const { io } = require('socket.io-client');

const BASE = 'http://localhost:5000';
const [, , emailA, passA, emailB, passB, emailC, passC] = process.argv;

if (!emailA || !passA || !emailB || !passB || !emailC || !passC) {
  console.log(
    'Usage: node scripts/callTest.js emailA passA emailB passB emailC passC\n' +
      '(A calls B, C is an outsider)'
  );
  process.exit(1);
}

const json = { 'Content-Type': 'application/json' };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const login = async (email, password) => {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Login failed for ${email}: ${data.message}`);
  return data;
};

const api = async (method, path, token, body) => {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { ...json, Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};

const connect = (token) =>
  new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token } });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });

// resolves with the event's data, or null if it does not arrive in time
const waitFor = (socket, event, ms = 1500) =>
  new Promise((resolve) => {
    const handler = (data) => {
      clearTimeout(timer);
      resolve(data);
    };
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve(null);
    }, ms);
    socket.once(event, handler);
  });

// true when NO such event arrives
const expectNothing = async (socket, event, ms = 700) =>
  (await waitFor(socket, event, ms)) === null;

const emitAck = (socket, event, payload) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: 'no answer' }), 2000);
    socket.emit(event, payload, (reply) => {
      clearTimeout(timer);
      resolve(reply);
    });
  });

let failed = 0;
const check = (label, ok, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  (' + extra + ')' : ''}`);
};

(async () => {
  const a = await login(emailA, passA);
  const b = await login(emailB, passB);
  const c = await login(emailC, passC);

  let sockA = await connect(a.token);
  const sockB = await connect(b.token);
  const sockC = await connect(c.token);

  const chatAB = (await api('POST', '/chats', a.token, { userId: b._id })).body;
  const chatCB = (await api('POST', '/chats', c.token, { userId: b._id })).body;
  const callAB = { conversationId: chatAB._id, type: 'audio' };

  // ---- 1. refusals ----
  const badType = await emitAck(sockA, 'call:invite', { ...callAB, type: 'screen' });
  check('an invalid call type is refused', !badType.ok, badType.error);

  const outsider = await emitAck(sockC, 'call:invite', callAB);
  check('outsider C cannot call inside the A-B conversation', !outsider.ok, outsider.error);

  // ---- 2. a normal call ----
  const incomingP = waitFor(sockB, 'call:incoming');
  const invite = await emitAck(sockA, 'call:invite', callAB);
  check('A invites B', invite.ok === true && Boolean(invite.callId), invite.error);

  const incoming = await incomingP;
  check(
    'B receives call:incoming with the caller name',
    incoming?.callId === invite.callId && incoming?.caller?.name === a.name
  );

  const acceptedP = waitFor(sockA, 'call:accepted');
  const accept = await emitAck(sockB, 'call:accept', { callId: invite.callId });
  check('B accepts', accept.ok === true, accept.error);
  check('A receives call:accepted', (await acceptedP)?.callId === invite.callId);

  // ---- 3. signaling relay ----
  const offerP = waitFor(sockB, 'webrtc:signal');
  sockA.emit('webrtc:signal', {
    callId: invite.callId,
    data: { type: 'offer', sdp: 'fake-offer' },
  });
  check('an offer is relayed from A to B', (await offerP)?.data?.type === 'offer');

  const answerP = waitFor(sockA, 'webrtc:signal');
  sockB.emit('webrtc:signal', {
    callId: invite.callId,
    data: { type: 'answer', sdp: 'fake-answer' },
  });
  check('an answer is relayed from B to A', (await answerP)?.data?.type === 'answer');

  const noneA = expectNothing(sockA, 'webrtc:signal');
  const noneB = expectNothing(sockB, 'webrtc:signal');
  sockC.emit('webrtc:signal', {
    callId: invite.callId,
    data: { type: 'offer', sdp: 'intruder' },
  });
  check(
    'outsider C cannot inject signals into the call',
    (await noneA) && (await noneB)
  );

  // ---- 4. busy ----
  const second = await emitAck(sockA, 'call:invite', callAB);
  check('A cannot start a second call while in one', !second.ok, second.error);

  const busy = await emitAck(sockC, 'call:invite', {
    conversationId: chatCB._id,
    type: 'audio',
  });
  check('C is told that B is busy', !busy.ok && /busy/i.test(busy.error || ''), busy.error);

  // ---- 5. hang up ----
  const endA = waitFor(sockA, 'call:ended');
  const endB = waitFor(sockB, 'call:ended');
  sockB.emit('call:hangup', { callId: invite.callId });
  const [ea, eb] = await Promise.all([endA, endB]);
  check(
    'hang up ends the call for both people',
    ea?.reason === 'hangup' && eb?.reason === 'hangup' && typeof ea?.duration === 'number'
  );

  // ---- 6. declined ----
  const incoming2 = waitFor(sockB, 'call:incoming');
  const invite2 = await emitAck(sockA, 'call:invite', callAB);
  await incoming2;
  const declinedA = waitFor(sockA, 'call:ended');
  sockB.emit('call:hangup', { callId: invite2.callId });
  check('declining a ringing call tells the caller (rejected)', (await declinedA)?.reason === 'rejected');

  // ---- 7. cancelled ----
  const incoming3 = waitFor(sockB, 'call:incoming');
  const invite3 = await emitAck(sockA, 'call:invite', callAB);
  await incoming3;
  const cancelledB = waitFor(sockB, 'call:ended');
  sockA.emit('call:hangup', { callId: invite3.callId });
  check('cancelling before an answer stops the ringing (cancelled)', (await cancelledB)?.reason === 'cancelled');

  // ---- 8. a side disconnects during a call ----
  const incoming4 = waitFor(sockB, 'call:incoming');
  const invite4 = await emitAck(sockA, 'call:invite', callAB);
  await incoming4;
  const accepted4 = waitFor(sockA, 'call:accepted');
  await emitAck(sockB, 'call:accept', { callId: invite4.callId });
  await accepted4;
  const droppedB = waitFor(sockB, 'call:ended');
  sockA.close();
  check('if one side disconnects the other is told (disconnected)', (await droppedB)?.reason === 'disconnected');
  sockA = await connect(a.token);

  // ---- 9. offline ----
  sockB.close();
  await wait(400);
  const offline = await emitAck(sockA, 'call:invite', callAB);
  check('calling someone who is offline is refused', !offline.ok && /offline/i.test(offline.error || ''), offline.error);

  console.log(failed === 0 ? '\nPASS: all call checks passed' : `\nFAIL: ${failed} check(s) failed`);
  sockA.close();
  sockC.close();
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});