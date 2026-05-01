const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('./server');

test('health endpoint works', async () => {
  const server = app.listen(0);
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'ok');
  server.close();
});

test('login returns token and ticket list is protected', async () => {
  const server = app.listen(0);
  const { port } = server.address();
  const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@demo.com', password: 'admin123' }),
  });
  const body = await login.json();
  assert.equal(login.status, 200);
  assert.ok(body.token);

  const tickets = await fetch(`http://127.0.0.1:${port}/api/tickets`, {
    headers: { Authorization: `Bearer ${body.token}` },
  });
  assert.equal(tickets.status, 200);
  assert.ok(Array.isArray(await tickets.json()));
  server.close();
});
