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

test('current user profile can be updated', async () => {
  await withServer(async (baseUrl) => {
    const admin = await login(baseUrl);
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` };

    const update = await fetch(`${baseUrl}/api/auth/me`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        name: 'Demo Profile',
        email: 'admin-profile@demo.com',
        department: 'Support Operations',
        avatar: 'data:image/jpeg;base64,abc123',
        role: 'customer',
      }),
    });
    const updated = await update.json();
    assert.equal(update.status, 200);
    assert.equal(updated.name, 'Demo Profile');
    assert.equal(updated.email, 'admin-profile@demo.com');
    assert.equal(updated.role, 'admin');
    assert.equal(updated.data.department, 'Support Operations');
    assert.equal(updated.data.avatar, 'data:image/jpeg;base64,abc123');

    const me = await fetch(`${baseUrl}/api/auth/me`, { headers });
    const currentUser = await me.json();
    assert.equal(currentUser.data.avatar, 'data:image/jpeg;base64,abc123');
  });
});

test('registered users can sign in again with the same email after normalization', async () => {
  await withServer(async (baseUrl) => {
    const email = `New.User.${Date.now()}@Example.COM`;
    const password = 'secret123';

    const register = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: 'Signup Persistence',
        name: 'New User',
        email,
        password,
      }),
    });
    const registered = await register.json();
    assert.equal(register.status, 201);
    assert.equal(registered.user.email, email.toLowerCase());

    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.toLowerCase(), password }),
    });
    const loginBody = await loginResponse.json();
    assert.equal(loginResponse.status, 200);
    assert.equal(loginBody.user.email, email.toLowerCase());
    assert.ok(loginBody.token);
  });
});

test('knowledge articles can be internal or admin global', async () => {
  await withServer(async (baseUrl) => {
    const admin = await login(baseUrl);
    const adminHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` };

    const globalArticle = await fetch(`${baseUrl}/api/articles`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ title: 'Global reset guide', body: 'Visible to every account', category: 'General', published: true, global: true }),
    });
    assert.equal(globalArticle.status, 201);

    const registerFirst = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: 'Knowledge Customer',
        name: 'Knowledge Reader',
        email: `knowledge-reader-${Date.now()}@example.com`,
        password: 'secret123',
      }),
    });
    const firstCustomer = await registerFirst.json();
    assert.equal(registerFirst.status, 201);

    const firstHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${firstCustomer.token}` };
    const internalArticle = await fetch(`${baseUrl}/api/articles`, {
      method: 'POST',
      headers: firstHeaders,
      body: JSON.stringify({ title: 'Internal customer guide', body: 'Only this account', category: 'General', published: true }),
    });
    const internalArticleBody = await internalArticle.json();
    assert.equal(internalArticle.status, 201);

    const firstList = await fetch(`${baseUrl}/api/articles`, { headers: firstHeaders });
    const firstRows = await firstList.json();
    assert.equal(firstList.status, 200);
    assert.ok(firstRows.some((article) => article.title === 'Global reset guide'));
    assert.ok(firstRows.some((article) => article.title === 'Internal customer guide'));

    const adminList = await fetch(`${baseUrl}/api/articles`, { headers: adminHeaders });
    const adminRows = await adminList.json();
    assert.ok(adminRows.some((article) => article.title === 'Global reset guide'));
    assert.equal(adminRows.some((article) => article.title === 'Internal customer guide'), false);

    const adminDeleteInternal = await fetch(`${baseUrl}/api/articles/${internalArticleBody.id}`, {
      method: 'DELETE',
      headers: adminHeaders,
    });
    assert.equal(adminDeleteInternal.status, 403);

    const adminEditInternal = await fetch(`${baseUrl}/api/articles/${internalArticleBody.id}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ title: 'Admin edit attempt', body: 'Blocked', category: 'General', published: true }),
    });
    assert.equal(adminEditInternal.status, 403);

    const ownerEditInternal = await fetch(`${baseUrl}/api/articles/${internalArticleBody.id}`, {
      method: 'PUT',
      headers: firstHeaders,
      body: JSON.stringify({ title: 'Updated internal guide', body: 'Only this account updated', category: 'General', published: true }),
    });
    const editedInternal = await ownerEditInternal.json();
    assert.equal(ownerEditInternal.status, 200);
    assert.equal(editedInternal.title, 'Updated internal guide');

    const ownerDeleteInternal = await fetch(`${baseUrl}/api/articles/${internalArticleBody.id}`, {
      method: 'DELETE',
      headers: firstHeaders,
    });
    assert.equal(ownerDeleteInternal.status, 204);

    const registerSecond = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: 'Other Knowledge Customer',
        name: 'Other Reader',
        email: `other-knowledge-reader-${Date.now()}@example.com`,
        password: 'secret123',
      }),
    });
    const secondCustomer = await registerSecond.json();
    assert.equal(registerSecond.status, 201);

    const secondList = await fetch(`${baseUrl}/api/articles`, {
      headers: { Authorization: `Bearer ${secondCustomer.token}` },
    });
    const secondRows = await secondList.json();
    assert.ok(secondRows.some((article) => article.title === 'Global reset guide'));
    assert.equal(secondRows.some((article) => article.title === 'Internal customer guide'), false);
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

    const internal = await fetch(`${baseUrl}/api/tickets/1/comments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ body: 'Staff-only troubleshooting note.', internal: true }),
    });
    const internalBody = await internal.json();
    assert.equal(internal.status, 201);
    assert.equal(internalBody.internal, true);

    const status = await fetch(`${baseUrl}/api/tickets/1/status`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'in_progress' }),
    });
    assert.equal((await status.json()).status, 'in_progress');

    const comments = await fetch(`${baseUrl}/api/tickets/1/comments`, { headers });
    const commentRows = await comments.json();
    assert.ok(commentRows.some((row) => row.body === 'Customer confirmed the adapter works.'));
    assert.ok(commentRows.some((row) => row.body === 'Staff-only troubleshooting note.' && row.internal === true));

    const histories = await fetch(`${baseUrl}/api/histories`, { headers });
    const historyRows = await histories.json();
    assert.ok(historyRows.some((row) => row.action === 'commented'));
    assert.ok(historyRows.some((row) => row.action === 'status_changed'));
  });
});

test('customers cannot mark their ticket replies as internal notes', async () => {
  await withServer(async (baseUrl) => {
    const register = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: 'Customer Notes',
        name: 'Customer Notes User',
        email: `customer-notes-${Date.now()}@example.com`,
        password: 'secret123',
      }),
    });
    const customer = await register.json();
    assert.equal(register.status, 201);

    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${customer.token}` };
    const ticketResponse = await fetch(`${baseUrl}/api/tickets`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: 'Customer visible ticket', status: 'open', priority: 'Medium' }),
    });
    const ticket = await ticketResponse.json();
    assert.equal(ticketResponse.status, 201);

    const commentResponse = await fetch(`${baseUrl}/api/tickets/${ticket.id}/comments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ body: 'This should stay public.', internal: true }),
    });
    const comment = await commentResponse.json();
    assert.equal(commentResponse.status, 201);
    assert.equal(comment.internal, false);
  });
});

test('customers cannot perform admin or agent ticket actions', async () => {
  await withServer(async (baseUrl) => {
    const register = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: 'Customer RBAC',
        name: 'Customer RBAC User',
        email: `customer-rbac-${Date.now()}@example.com`,
        password: 'secret123',
      }),
    });
    const customer = await register.json();
    assert.equal(register.status, 201);

    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${customer.token}` };
    const ticketResponse = await fetch(`${baseUrl}/api/tickets`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: 'Customer-managed ticket', status: 'open', priority: 'Medium' }),
    });
    const ticket = await ticketResponse.json();
    assert.equal(ticketResponse.status, 201);

    const statusChange = await fetch(`${baseUrl}/api/tickets/${ticket.id}/status`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'in_progress' }),
    });
    assert.equal(statusChange.status, 403);

    const deleteTicket = await fetch(`${baseUrl}/api/tickets/${ticket.id}`, {
      method: 'DELETE',
      headers,
    });
    assert.equal(deleteTicket.status, 403);

    const job = await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ type: 'email', payload: { ticketId: ticket.id } }),
    });
    assert.equal(job.status, 403);
  });
});

test('ticket attachments can be uploaded, listed, and deleted', async () => {
  await withServer(async (baseUrl) => {
    const admin = await login(baseUrl);
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` };

    const upload = await fetch(`${baseUrl}/api/tickets/1/attachments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fileName: 'error-log.txt',
        type: 'text/plain',
        size: 12,
        url: 'data:text/plain;base64,SGVsbG8gd29ybGQ=',
      }),
    });
    const attachment = await upload.json();
    assert.equal(upload.status, 201);
    assert.equal(attachment.fileName, 'error-log.txt');
    assert.equal(attachment.data.size, 12);

    const list = await fetch(`${baseUrl}/api/tickets/1/attachments`, { headers });
    const rows = await list.json();
    assert.equal(list.status, 200);
    assert.ok(rows.some((row) => row.id === attachment.id));

    const histories = await fetch(`${baseUrl}/api/histories`, { headers });
    const historyRows = await histories.json();
    assert.ok(historyRows.some((row) => row.action === 'attachment_added'));

    const remove = await fetch(`${baseUrl}/api/tickets/1/attachments/${attachment.id}`, {
      method: 'DELETE',
      headers,
    });
    assert.equal(remove.status, 204);

    const afterDelete = await fetch(`${baseUrl}/api/tickets/1/attachments`, { headers });
    const remaining = await afterDelete.json();
    assert.equal(remaining.some((row) => row.id === attachment.id), false);
  });
});

test('notifications can be listed, marked read, and deleted', async () => {
  await withServer(async (baseUrl) => {
    const admin = await login(baseUrl);
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` };

    const ticket = await fetch(`${baseUrl}/api/tickets`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: 'Notification check', status: 'open', priority: 'Medium' }),
    });
    assert.equal(ticket.status, 201);

    const notifications = await fetch(`${baseUrl}/api/notifications`, { headers });
    const rows = await notifications.json();
    assert.equal(notifications.status, 200);
    const created = rows.find((row) => row.type === 'ticket_created');
    assert.ok(created);
    assert.equal(created.status, 'unread');

    const markRead = await fetch(`${baseUrl}/api/notifications/${created.id}/read`, {
      method: 'PATCH',
      headers,
    });
    const readNotification = await markRead.json();
    assert.equal(markRead.status, 200);
    assert.equal(readNotification.status, 'read');

    const remove = await fetch(`${baseUrl}/api/notifications/${created.id}`, {
      method: 'DELETE',
      headers,
    });
    assert.equal(remove.status, 204);
  });
});

test('ticket creation creates or reuses customer by email', async () => {
  await withServer(async (baseUrl) => {
    const admin = await login(baseUrl);
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` };

    const firstTicket = await fetch(`${baseUrl}/api/tickets`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: 'VPN access issue',
        status: 'open',
        priority: 'High',
        customer: {
          name: 'Arben Krasniqi',
          email: 'Arben@example.com',
          company: 'ABC Tech',
        },
      }),
    });
    const firstTicketBody = await firstTicket.json();
    assert.equal(firstTicket.status, 201);
    assert.ok(firstTicketBody.customerId);

    const secondTicket = await fetch(`${baseUrl}/api/tickets`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: 'Email access issue',
        status: 'open',
        priority: 'Medium',
        customer: {
          name: 'Arben Krasniqi',
          email: 'arben@example.com',
        },
      }),
    });
    const secondTicketBody = await secondTicket.json();
    assert.equal(secondTicket.status, 201);
    assert.equal(secondTicketBody.customerId, firstTicketBody.customerId);

    const customers = await fetch(`${baseUrl}/api/customers`, { headers });
    const customerRows = await customers.json();
    assert.equal(customerRows.filter((customer) => customer.email === 'arben@example.com').length, 1);
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
