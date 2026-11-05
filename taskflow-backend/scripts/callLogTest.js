const { io } = require('socket.io-client');

const BASE = 'http://localhost:5000';
const [, , emailA, passA, emailB, passB] = process.argv;

if (!emailA || !passA || !emailB || !passB) {
  console.log('Usage: node scripts/callLogTest.js emailA passA emailB passB   (A calls B)');
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
  const sockA = await connect(a.token);
  const sockB = await connect(b.token);

  const chat = (await api('POST', '/chats', a.token, { userId: b._id })).body;

  const lastCall = async () => {
    const res = await api('GET', `/chats/${chat._id}/messages?limit=10`, a.token);
    const calls = res.body.messages.filter((m) => m.call && m.call.type);
    return calls[calls.length - 1];
  };
  const unreadOfB = async () => (await api('GET', '/chats/unread-count', b.token)).body.count;

  const startCall = async (type) => {
    const incoming = waitFor(sockB, 'call:incoming');
    const invite = await emitAck(sockA, 'call:invite', { conversationId: chat._id, type });
    await incoming;
    return invite.callId;
  };

  const baseline = await unreadOfB();

  // 1. a completed voice call
  let liveMessage = null;
  sockB.on('message:new', (m) => {
    if (m.call?.type) liveMessage = m;
  });

  let callId = await startCall('audio');
  const accepted = waitFor(sockA, 'call:accepted');
  await emitAck(sockB, 'call:accept', { callId });
  await accepted;
  await wait(2200);
  const ended = waitFor(sockB, 'call:ended');
  sockA.emit('call:hangup', { callId });
  await ended;
  await wait(700);

  let m = await lastCall();
  check(
    'a completed voice call is logged with its duration',
    m?.call?.status === 'completed' && m.call.type === 'audio' && m.call.duration >= 2,
    m ? `${m.call.status}, ${m.call.duration}s` : 'no call message'
  );
  check('the caller is the sender of the call line', m?.sender?._id === a._id);
  check('B received the call line live over the socket', liveMessage?._id === m?._id);
  check('a completed call is NOT unread for B', (await unreadOfB()) === baseline);

  // 2. a declined video call
  callId = await startCall('video');
  const endedDecline = waitFor(sockA, 'call:ended');
  sockB.emit('call:hangup', { callId });
  await endedDecline;
  await wait(700);
  m = await lastCall();
  check(
    'a declined video call is logged',
    m?.call?.status === 'declined' && m.call.type === 'video',
    m ? `${m.call.status}, ${m.call.type}` : 'no call message'
  );
  check('a declined call is NOT unread for B', (await unreadOfB()) === baseline);

  // 3. a cancelled call = a missed call for B
  callId = await startCall('audio');
  const endedCancel = waitFor(sockB, 'call:ended');
  sockA.emit('call:hangup', { callId });
  await endedCancel;
  await wait(700);
  m = await lastCall();
  check('a cancelled call is logged', m?.call?.status === 'cancelled', m?.call?.status);
  check('a cancelled call IS unread for B (a missed call)', (await unreadOfB()) === baseline + 1);

  // 4. the conversation preview
  const chats = (await api('GET', '/chats', b.token)).body;
  const mine = chats.find((c) => c._id === chat._id);
  check(
    'the conversation preview mentions the call',
    /call/i.test(mine?.lastMessage?.text || ''),
    mine?.lastMessage?.text
  );

  console.log(failed === 0 ? '\nPASS: all call history checks passed' : `\nFAIL: ${failed} check(s) failed`);
  sockA.close();
  sockB.close();
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});