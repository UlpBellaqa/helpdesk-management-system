const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp, createStore } = require('./server');

async function withServer(run) {
  const store = await createStore({ memory: true });
  const server = createApp(store).listen(0);
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await store.close();
  }
}

async function login(baseUrl, email = 'admin@demo.com', password = 'admin123') {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.ok(body.token);
  return body;
}

test('health endpoint works', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'ok');
  });
});

test('login protects ticket list', async () => {
  await withServer(async (baseUrl) => {
    const anonymousTickets = await fetch(`${baseUrl}/api/tickets`);
    assert.equal(anonymousTickets.status, 401);

    const body = await login(baseUrl);
    const tickets = await fetch(`${baseUrl}/api/tickets`, {
      headers: { Authorization: `Bearer ${body.token}` },
    });
    const rows = await tickets.json();
    assert.equal(tickets.status, 200);
    assert.equal(rows[0].title, 'Laptop will not start');
  });
});

test('role authorization protects admin resources', async () => {
  await withServer(async (baseUrl) => {
    const agent = await login(baseUrl, 'agent@demo.com', 'agent123');
    const users = await fetch(`${baseUrl}/api/users`, {
      headers: { Authorization: `Bearer ${agent.token}` },
    });
    assert.equal(users.status, 403);
  });
});

test('ticket comments and status updates create history', async () => {
  await withServer(async (baseUrl) => {
    const admin = await login(baseUrl);
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` };

    const comment = await fetch(`${baseUrl}/api/tickets/1/comments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ body: 'Customer confirmed the adapter works.' }),
    });
    assert.equal(comment.status, 201);

    const status = await fetch(`${baseUrl}/api/tickets/1/status`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'in_progress' }),
    });
    assert.equal((await status.json()).status, 'in_progress');

    const histories = await fetch(`${baseUrl}/api/histories?ticketId=1`, { headers });
    const historyRows = await histories.json();
    assert.ok(historyRows.some((row) => row.action === 'status_changed'));
  });
});

test('search cache and tenant isolation work', async () => {
  await withServer(async (baseUrl) => {
    const admin = await login(baseUrl);
    const adminHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` };

    const register = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: 'Globex',
        companySlug: `globex-${Date.now()}`,
        name: 'Globex User',
        email: `globex-${Date.now()}@example.com`,
        password: 'secret123',
      }),
    });
    const globex = await register.json();
    assert.equal(register.status, 201);

    const globexHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${globex.token}` };
    await fetch(`${baseUrl}/api/tickets`, {
      method: 'POST',
      headers: globexHeaders,
      body: JSON.stringify({ title: 'Globex printer issue', status: 'open', priority: 'Medium' }),
    });

    const firstSearch = await fetch(`${baseUrl}/api/search?q=Globex`, { headers: globexHeaders });
    const secondSearch = await fetch(`${baseUrl}/api/search?q=Globex`, { headers: globexHeaders });
    assert.equal((await firstSearch.json()).cached, false);
    assert.equal((await secondSearch.json()).cached, true);

    const adminSearch = await fetch(`${baseUrl}/api/search?q=Globex`, { headers: adminHeaders });
    assert.equal((await adminSearch.json()).results.length, 0);
  });
});
