const { io } = require('socket.io-client');

const BASE = 'http://localhost:5000';
const [, , emailA, passA, emailB, passB, emailC, passC] = process.argv;

if (!emailA || !passA || !emailB || !passB || !emailC || !passC) {
  console.log(
    'Usage: node scripts/fileTest.js emailA passA emailB passB emailC passC\n' +
      '(A and B chat with each other, C is an outsider)'
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

const upload = async (token, conversationId, filename, content, note) => {
  const form = new FormData();
  if (note) form.append('text', note);
  form.append('file', new Blob([content]), filename);
  const res = await fetch(`${BASE}/api/chats/${conversationId}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return { status: res.status, body: await res.json() };
};

let failed = 0;
const check = (label, ok, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  (' + extra + ')' : ''}`);
};

// a real 1x1 PNG image
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

(async () => {
  const a = await login(emailA, passA);
  const b = await login(emailB, passB);
  const c = await login(emailC, passC);

  const sockB = io(BASE, { auth: { token: b.token } });
  await new Promise((resolve, reject) => {
    sockB.on('connect', resolve);
    sockB.on('connect_error', reject);
  });
  let liveMessage = null;
  sockB.on('message:new', (m) => {
    if (m.attachment) liveMessage = m;
  });

  const chat = (await api('POST', '/chats', a.token, { userId: b._id })).body;

  // 1. a valid image with a note
  const ok = await upload(a.token, chat._id, 'test image.png', PNG, 'Here is the file');
  check('A uploads a valid PNG with a note', ok.status === 201, `status ${ok.status}`);
  check(
    'the response has name and size, but no storedName',
    ok.body.attachment?.originalName === 'test image.png' &&
      ok.body.attachment?.size === PNG.length &&
      ok.body.attachment?.storedName === undefined
  );

  await wait(500);
  check('B received the file message live over the socket', liveMessage?._id === ok.body._id);

  // 2. downloads
  const messageId = ok.body._id;
  const asB = await fetch(`${BASE}/api/chats/${chat._id}/messages/${messageId}/file`, {
    headers: { Authorization: `Bearer ${b.token}` },
  });
  const bytes = Buffer.from(await asB.arrayBuffer());
  check(
    'B downloads the same bytes (shown inline as an image)',
    asB.status === 200 &&
      asB.headers.get('content-type')?.startsWith('image/png') &&
      bytes.equals(PNG)
  );

  const asC = await fetch(`${BASE}/api/chats/${chat._id}/messages/${messageId}/file`, {
    headers: { Authorization: `Bearer ${c.token}` },
  });
  check('outsider C cannot download it', asC.status === 404, `status ${asC.status}`);

  const noToken = await fetch(`${BASE}/api/chats/${chat._id}/messages/${messageId}/file`);
  check('no token cannot download it', noToken.status === 401, `status ${noToken.status}`);

  // 3. history never leaks the name on disk
  const history = await api('GET', `/chats/${chat._id}/messages?limit=5`, a.token);
  const stored = history.body.messages.find((m) => m._id === messageId);
  check(
    'message history has no storedName',
    stored && stored.attachment && stored.attachment.storedName === undefined
  );

  // 4. rejected uploads
  const exe = await upload(a.token, chat._id, 'virus.exe', Buffer.from('MZ fake'));
  check('.exe is rejected', exe.status === 400, exe.body.message);

  const fake = await upload(a.token, chat._id, 'fake.png', Buffer.from('this is just text'));
  check('a text file renamed to .png is rejected', fake.status === 400, fake.body.message);

  const outsider = await upload(c.token, chat._id, 'sneaky.png', PNG);
  check('outsider C cannot upload into the conversation', outsider.status === 404, `status ${outsider.status}`);

  // 5. too large (11 MB > 10 MB limit)
  try {
    const big = await upload(
      a.token,
      chat._id,
      'big.pdf',
      Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(11 * 1024 * 1024)])
    );
    check('an 11 MB file is rejected', big.status === 413, `status ${big.status}`);
  } catch (error) {
    // the server may close the connection as soon as it sees the file is too big
    check('an 11 MB file is rejected', true, 'server closed the connection');
  }

  console.log(failed === 0 ? '\nPASS: all file checks passed' : `\nFAIL: ${failed} check(s) failed`);
  sockB.close();
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});