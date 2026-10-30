const { io } = require('socket.io-client');

const BASE = 'http://localhost:5000';
const [, , emailA, passA, emailB, passB] = process.argv;

if (!emailA || !passA || !emailB || !passB) {
  console.log('Usage: node scripts/notificationTest.js adminEmail adminPass memberEmail memberPass');
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
  return res.json();
};

const connect = (token, label) =>
  new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token } });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => reject(new Error(`${label}: ${err.message}`)));
  });

(async () => {
  // A = creator (Admin), B = assignee (Member)
  const a = await login(emailA, passA);
  const b = await login(emailB, passB);
  const sockA = await connect(a.token, 'A');
  const sockB = await connect(b.token, 'B');

  const gotA = [];
  const gotB = [];
  sockA.on('notification:new', (n) => {
    gotA.push(n.type);
    console.log(`  -> A got ${n.type} (by ${n.actor.name}) "${n.taskTitle}"`);
  });
  sockB.on('notification:new', (n) => {
    gotB.push(n.type);
    console.log(`  -> B got ${n.type} (by ${n.actor.name}) "${n.taskTitle}"`);
  });

  console.log('1. A creates a task assigned to B');
  const t1 = await api('POST', '/tasks', a.token, {
    title: 'Notification test task',
    assignedTo: b._id,
  });
  await wait(700);

  console.log('2. B sets it to In Progress');
  await api('PUT', `/tasks/${t1._id}`, b.token, { status: 'In Progress' });
  await wait(700);

  console.log('3. A sets it to Completed');
  await api('PUT', `/tasks/${t1._id}`, a.token, { status: 'Completed' });
  await wait(700);

  console.log('4. A removes the assignee');
  await api('PUT', `/tasks/${t1._id}`, a.token, { assignedTo: '' });
  await wait(700);

  console.log('5. A creates a second task for B, then deletes it');
  const t2 = await api('POST', '/tasks', a.token, {
    title: 'Notification test task 2',
    assignedTo: b._id,
  });
  await wait(700);
  await api('DELETE', `/tasks/${t2._id}`, a.token);
  await wait(700);

  console.log('6. A assigns a task to A (no notification expected)');
  const t3 = await api('POST', '/tasks', a.token, {
    title: 'Notification test task 3',
    assignedTo: a._id,
  });
  await wait(700);

  // clean up the test tasks
  await api('DELETE', `/tasks/${t1._id}`, a.token);
  await api('DELETE', `/tasks/${t3._id}`, a.token);
  await wait(500);

  const expectedB = [
    'task_assigned',
    'task_status_changed',
    'task_unassigned',
    'task_assigned',
    'task_deleted',
  ];
  const expectedA = ['task_status_changed'];

  console.log('\nA received:', gotA.join(', ') || '(none)');
  console.log('B received:', gotB.join(', ') || '(none)');
  const pass =
    JSON.stringify(gotA) === JSON.stringify(expectedA) &&
    JSON.stringify(gotB) === JSON.stringify(expectedB);
  console.log(pass ? '\nPASS: every notification went to the right person' : '\nFAIL: compare with the expected lists');

  sockA.close();
  sockB.close();
  process.exit(0);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});