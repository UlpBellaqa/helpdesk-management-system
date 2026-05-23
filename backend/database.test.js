const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createApp, createStore } = require('./server');

const databaseUrl = process.env.DATABASE_URL;

async function withDatabaseServer(run) {
  execFileSync('npx', ['prisma', 'db', 'push'], {
    cwd: __dirname,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  const store = await createStore();
  const server = createApp(store).listen(0);
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`, store);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await store.close();
  }
}

test('postgres-backed API can login, create a ticket, and persist it', { skip: !databaseUrl }, async () => {
  await withDatabaseServer(async (baseUrl, store) => {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@demo.com', password: 'admin123' }),
    });
    const session = await login.json();
    assert.equal(login.status, 200);
    assert.ok(session.token);

    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` };
    const title = `Postgres persistence ${Date.now()}`;
    const create = await fetch(`${baseUrl}/api/tickets`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title, status: 'open', priority: 'High', category: 'Software' }),
    });
    const created = await create.json();
    assert.equal(create.status, 201);
    assert.equal(created.title, title);

    const persisted = await store.tickets.findById(created.id, session.user.tenantId);
    assert.equal(persisted.title, title);
    assert.equal(persisted.priority, 'High');
  });
});
