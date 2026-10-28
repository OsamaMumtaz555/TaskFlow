const { io } = require('socket.io-client');

const BASE = 'http://localhost:5000';
const [, , emailA, passA, emailB, passB] = process.argv;

if (!emailA || !passA || !emailB || !passB) {
  console.log('Usage: node scripts/socketFloodTest.js emailA passA emailB passB');
  process.exit(1);
}

const json = { 'Content-Type': 'application/json' };

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

(async () => {
  const a = await login(emailA, passA);
  const b = await login(emailB, passB);

  const socket = io(BASE, { auth: { token: a.token } });
  await new Promise((resolve, reject) => {
    socket.on('connect', resolve);
    socket.on('connect_error', reject);
  });

  const chat = await (
    await fetch(`${BASE}/api/chats`, {
      method: 'POST',
      headers: { ...json, Authorization: `Bearer ${a.token}` },
      body: JSON.stringify({ userId: b._id }),
    })
  ).json();

  const TOTAL = 25;
  let delivered = 0;
  let refused = 0;
  let pending = TOTAL;

  // fire all messages at once, far faster than a human could type
  for (let i = 1; i <= TOTAL; i++) {
    socket.emit(
      'message:send',
      { conversationId: chat._id, text: `Flood test ${i}` },
      (reply) => {
        if (reply.ok) delivered++;
        else refused++;

        if (--pending === 0) {
          console.log(`Delivered: ${delivered}, refused: ${refused}`);
          socket.close();
          process.exit(0);
        }
      }
    );
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
}); 