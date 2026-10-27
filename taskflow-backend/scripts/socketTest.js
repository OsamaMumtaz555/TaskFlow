const { io } = require('socket.io-client');

const BASE = 'http://localhost:5000';
const [, , emailA, passA, emailB, passB] = process.argv;

if (!emailA || !passA || !emailB || !passB) {
  console.log('Usage: node scripts/socketTest.js emailA passA emailB passB');
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

const connect = (token, label) =>
  new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token } });
    socket.on('connect', () => {
      console.log(`${label} connected`);
      resolve(socket);
    });
    socket.on('connect_error', (err) =>
      reject(new Error(`${label} connect_error: ${err.message}`))
    );
  });

const api = async (method, path, token, body) => {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { ...json, Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
};

(async () => {
  // 1. a bad token must be refused
  await new Promise((resolve) => {
    const bad = io(BASE, { auth: { token: 'bad' }, reconnection: false });
    bad.on('connect_error', (err) => {
      console.log('Bad token refused:', err.message);
      bad.close();
      resolve();
    });
    bad.on('connect', () => {
      console.log('ERROR: a bad token was allowed to connect!');
      bad.close();
      resolve();
    });
  });

  // 2. log in both users and connect their sockets
  const a = await login(emailA, passA);
  const b = await login(emailB, passB);
  const sockA = await connect(a.token, `A (${a.name})`);
  const sockB = await connect(b.token, `B (${b.name})`);

  sockB.on('message:new', (m) =>
    console.log(`B received live: "${m.text}" from ${m.sender.name}`)
  );

  // 3. A opens a conversation with B
  const chat = await api('POST', '/chats', a.token, { userId: b._id });
  console.log('Conversation:', chat._id, 'with', chat.other.name);

  // 4. A sends a message through the socket
  sockA.emit(
    'message:send',
    { conversationId: chat._id, text: 'Hello from the test script' },
    async (reply) => {
      console.log('Ack for A:', reply.ok ? 'ok' : reply.error);

      setTimeout(async () => {
        const chatsB = await api('GET', '/chats', b.token);
        const mine = chatsB.find((c) => c._id === chat._id);
        console.log('B unread count:', mine.unreadCount, '(expected 1 or more)');

        await api('PUT', `/chats/${chat._id}/read`, b.token);
        const after = await api('GET', '/chats', b.token);
        console.log(
          'B unread after reading:',
          after.find((c) => c._id === chat._id).unreadCount,
          '(expected 0)'
        );

        const history = await api('GET', `/chats/${chat._id}/messages`, a.token);
        console.log('History has', history.messages.length, 'message(s)');

        sockA.close();
        sockB.close();
        process.exit(0);
      }, 500);
    }
  );
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});