const bcrypt = require('bcryptjs');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createStore, resourceConfigs } = require('./src/dataStore');
const { buildSwaggerSpec, swaggerHtml } = require('./src/swagger');
const { validateLoginRequest, validateRegisterRequest } = require('./src/validation');
const { ApiError, BadRequestError, UnauthorizedError } = require('./src/errors');
const { LoggingMiddleware, AuthenticationMiddleware } = require('./src/middleware');

dotenv.config();

const PORT = process.env.PORT || 4000;
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'dev-secret';
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || '8h';
const allowedOrigins = new Set([
  'http://localhost:4000',
  'http://127.0.0.1:4000',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
]);
const documentedResourceRoutes = {
  tickets: new Set(['getList', 'postList', 'getItem', 'putItem']),
  customers: new Set(['getList', 'postList', 'getItem', 'putItem', 'deleteItem']),
  articles: new Set(['getList', 'postList']),
  services: new Set(['getList', 'postList', 'deleteItem']),
  jobs: new Set(['getList']),
  histories: new Set(['getList']),
};
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

async function hashPassword(password) {
  return bcrypt.hash(password || '', 10);
}

async function verifyPassword(password, storedPassword) {
  if (!storedPassword) return false;
  if (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2y$')) {
    return bcrypt.compare(password, storedPassword);
  }
  return password === storedPassword;
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function tenantId(req) {
  return req.user?.tenantId;
}

function prepareResourcePayload(req, resource) {
  if (resource === 'tenants') return req.body;
  return { ...req.body, tenantId: tenantId(req) };
}

function prepareArticlePayload(req) {
  const payload = { ...req.body };
  const global = req.user?.role === 'admin' && payload.global !== false;
  delete payload.global;
  return {
    ...payload,
    tenantId: global ? null : tenantId(req),
    data: {
      ...(payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data) ? payload.data : {}),
      scope: global ? 'global' : 'workspace',
      createdBy: req.user?.id,
    },
  };
}

function sanitizeUpdatePayload(req, resource) {
  if (resource === 'tenants') return req.body;
  const payload = { ...req.body };
  delete payload.tenantId;
  return payload;
}

function safeUser(user) {
  if (!user) return null;
  const { password, ...rest } = user;
  return rest;
}

async function ensureUniqueEmail(store, email, currentUserId) {
  const normalizedEmail = normalizeEmail(email);
  const existing = (await store.users.list())
    .filter((row) => normalizeEmail(row.email) === normalizedEmail)
    .find((row) => row.id !== currentUserId);
  if (existing) throw new BadRequestError('Email already exists');
}

function notificationTitle(type) {
  return {
    ticket_created: 'Ticket created',
    comment_added: 'Comment added',
    status_changed: 'Ticket status changed',
    attachment_added: 'Attachment added',
    attachment_deleted: 'Attachment deleted',
  }[type] || formatLabel(type);
}

async function createNotification(store, tenantIdValue, type, payload = {}, actorId) {
  return store.notifications.create({
    tenantId: tenantIdValue,
    type,
    payload,
    status: 'unread',
    data: {
      title: notificationTitle(type),
      actorId,
    },
  });
}

function profileData(user) {
  return user?.data && typeof user.data === 'object' && !Array.isArray(user.data) ? user.data : {};
}

function sanitizeProfilePayload(body) {
  const payload = {};
  const data = {};

  if (body.name !== undefined) payload.name = String(body.name).trim();
  if (body.email !== undefined) payload.email = normalizeEmail(body.email);
  if (body.department !== undefined) data.department = String(body.department).trim();
  if (body.avatar !== undefined) data.avatar = String(body.avatar || '');

  return { payload, data };
}

function notFound(res) {
  return res.status(404).json({ message: 'Resource not found' });
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function resolveTicketCustomer(store, payload, tenantIdValue) {
  const customerInput = payload.customer || {};
  const customerId = payload.customerId;
  const email = normalizeEmail(customerInput.email || payload.customerEmail);
  const name = String(customerInput.name || payload.customerName || '').trim();
  const company = String(customerInput.company || payload.customerCompany || '').trim();

  if (customerId) return customerId;
  if (!email && !name) return undefined;

  if (email) {
    const existing = (await store.customers.list({ tenantId: tenantIdValue }))
      .find((customer) => normalizeEmail(customer.email) === email);
    if (existing) return existing.id;
  }

  const customer = await store.customers.create({
    tenantId: tenantIdValue,
    name: name || email,
    email,
    company,
  });
  return customer.id;
}

function sanitizeTicketPayload(payload, customerId) {
  const {
    customer,
    customerName,
    customerEmail,
    customerCompany,
    ...ticketPayload
  } = payload;

  return {
    ...ticketPayload,
    ...(customerId ? { customerId } : {}),
  };
}

async function visibleKnowledgeArticles(store, req) {
  const allArticles = await store.articles.list();
  if (req.user?.role === 'admin') {
    return allArticles.filter((article) => article.tenantId === tenantId(req) || article.tenantId === null);
  }

  const ownTenantArticles = await store.articles.list({ tenantId: tenantId(req) });
  const globalArticles = (await store.articles.list()).filter((article) => article.tenantId === null && article.published);
  const ownArticles = ownTenantArticles.filter((article) => article.published || article.data?.createdBy === req.user?.id);
  const rows = [...ownArticles, ...globalArticles];
  return rows.filter((article, index) => rows.findIndex((row) => row.id === article.id) === index);
}

async function canModifyKnowledgeArticle(store, req, articleId) {
  const article = (await store.articles.list()).find((row) => row.id === articleId);
  if (!article) return null;
  if (article.tenantId === tenantId(req)) return article;
  if (req.user?.role === 'admin' && article.tenantId === null) return article;
  return false;
}

function dataUrlByteSize(url) {
  const value = String(url || '');
  const commaIndex = value.indexOf(',');
  if (!value.startsWith('data:') || commaIndex < 0) return 0;
  const base64 = value.slice(commaIndex + 1);
  return Math.floor((base64.length * 3) / 4);
}

function sanitizeAttachmentPayload(body) {
  const fileName = String(body.fileName || '').trim();
  const url = String(body.url || '');
  const size = Number(body.size || dataUrlByteSize(url));
  const type = String(body.type || '').trim();

  if (!fileName) throw new BadRequestError('File name is required');
  if (!url.startsWith('data:')) throw new BadRequestError('Attachment file data is required');
  if (!Number.isFinite(size) || size <= 0) throw new BadRequestError('Attachment size is invalid');
  if (size > MAX_ATTACHMENT_BYTES) throw new BadRequestError('Attachment must be 5MB or smaller');

  return { fileName, url, size, type };
}

function formatLabel(value) {
  return String(value || 'unassigned').replaceAll('_', ' ');
}

async function buildLocalAiReply(store, tenantIdValue, prompt) {
  const [summary, tickets, customers, articles] = await Promise.all([
    store.dashboardSummary(tenantIdValue),
    store.tickets.list({ tenantId: tenantIdValue }),
    store.customers.list({ tenantId: tenantIdValue }),
    store.articles.list({ tenantId: tenantIdValue }),
  ]);

  const activeTickets = tickets.filter((ticket) => !['resolved', 'closed'].includes(ticket.status));
  const highPriorityTickets = activeTickets.filter((ticket) => ticket.priority === 'High');
  const waitingTickets = activeTickets.filter((ticket) => ticket.status === 'waiting_customer');
  const triageTickets = activeTickets.filter((ticket) => ticket.status === 'triage');
  const topTicket = highPriorityTickets[0] || activeTickets[0] || tickets[0];

  const recommendations = [];
  if (topTicket) {
    const nextStatus = topTicket.status === 'open' ? 'triage' : topTicket.status === 'triage' ? 'in progress' : formatLabel(topTicket.status);
    recommendations.push(`Open ticket #${topTicket.id} and move it to ${nextStatus} after adding the first agent note.`);
  }
  if (highPriorityTickets.length) recommendations.push('Handle the high-priority item first and make sure one agent clearly owns it.');
  if (waitingTickets.length) recommendations.push('Follow up on tickets waiting for the customer so they do not sit idle.');
  if (triageTickets.length) recommendations.push('Review triage tickets and decide whether they need engineering, customer input, or resolution.');
  if (!articles.length) recommendations.push('Create a knowledge base article if this issue is likely to repeat.');
  if (!recommendations.length) recommendations.push('The queue looks stable. Keep monitoring new tickets and SLA changes.');

  const lines = [];

  if (!topTicket) {
    lines.push('There are no tickets in the queue right now.');
    lines.push('');
    lines.push('The agent should monitor new requests, review customer records, and keep the knowledge base up to date.');
    return lines.join('\n');
  }

  lines.push(`Start with ticket #${topTicket.id}: ${topTicket.title}.`);
  lines.push('');
  lines.push(`It is currently ${formatLabel(topTicket.status)} and marked ${topTicket.priority} priority, so it should be handled before lower-priority work.`);
  lines.push(`Queue context: ${activeTickets.length} active ticket${activeTickets.length === 1 ? '' : 's'}, ${highPriorityTickets.length} high priority, ${waitingTickets.length} waiting on customer.`);
  lines.push('');
  lines.push('Next steps:');
  recommendations.slice(0, 3).forEach((item, index) => lines.push(`${index + 1}. ${item}`));

  return lines.join('\n');
}

async function buildAiContext(store, tenantIdValue) {
  const [summary, tickets, customers, articles] = await Promise.all([
    store.dashboardSummary(tenantIdValue),
    store.tickets.list({ tenantId: tenantIdValue }),
    store.customers.list({ tenantId: tenantIdValue }),
    store.articles.list({ tenantId: tenantIdValue }),
  ]);

  return {
    summary,
    tickets: tickets.map(({ id, title, description, status, priority, category, customerId, assigneeId }) => ({
      id,
      title,
      description,
      status,
      priority,
      category,
      customerId,
      assigneeId,
    })),
    customers: customers.map(({ id, name, email, company }) => ({ id, name, email, company })),
    articles: articles.map(({ id, title, body, category, published }) => ({ id, title, body, category, published })),
  };
}

function createApp(store) {
  const app = express();
  const resourceMap = Object.fromEntries(resourceConfigs.map((config) => [config.route, store[config.property]]));

  const loggingMiddleware = new LoggingMiddleware(store, {
    logLevel: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
    consoleLogging: true,
    databaseLogging: true,
  });

  const authMiddleware = new AuthenticationMiddleware({
    tokenSecret: TOKEN_SECRET,
    logger: loggingMiddleware,
  });

  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '10mb' }));

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { message: 'Too many requests from this IP, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: { message: 'Too many authentication attempts, please try again later.' },
  });
  app.use('/api/auth', authLimiter);

  app.use(loggingMiddleware.handle.bind(loggingMiddleware));

  app.use(authMiddleware.handle.bind(authMiddleware));

  app.get('/', (req, res) => res.redirect('/api-docs'));
  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'helpdesk-api' }));
  app.get('/api-docs.json', (req, res) => res.json(buildSwaggerSpec(PORT)));
  app.get('/api-docs', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:");
    res.type('html').send(swaggerHtml());
  });

  const signToken = (payload) => authMiddleware.signToken(payload);

  app.post('/api/auth/register', asyncRoute(async (req, res) => {
    const validationError = validateRegisterRequest(req.body);
    if (validationError) {
      throw new BadRequestError(validationError);
    }

    const email = normalizeEmail(req.body.email);
    const exists = (await store.users.list()).find((row) => normalizeEmail(row.email) === email);
    if (exists) throw new BadRequestError('Email already exists');

    const tenant = await store.tenants.create({ 
      name: String(req.body.companyName || '').trim(), 
      slug: req.body.companySlug || `tenant-${Date.now()}` 
    });
    if (!tenant) throw new BadRequestError('Tenant could not be created');

    const requestedRole = req.body.role || 'customer';
    const role = ['admin', 'agent'].includes(requestedRole) ? 'customer' : requestedRole;
    const hashedPassword = await hashPassword(req.body.password);

    const user = await store.users.create({
      tenantId: tenant.id,
      name: String(req.body.name || '').trim(),
      email,
      password: hashedPassword,
      role,
    });
    const token = signToken({ id: user.id, tenantId: user.tenantId, role: user.role, email: user.email });
    return res.status(201).json({ token, user: safeUser(user) });
  }));

  app.post('/api/auth/login', asyncRoute(async (req, res) => {
    const validationError = validateLoginRequest(req.body);
    if (validationError) {
      throw new BadRequestError(validationError);
    }

    const email = normalizeEmail(req.body.email);
    const user = (await store.users.list()).find((row) => normalizeEmail(row.email) === email);
    if (!user || !(await verifyPassword(req.body.password, user.password))) {
      throw new UnauthorizedError('Invalid credentials');
    }
    const token = signToken({ id: user.id, tenantId: user.tenantId, role: user.role, email: user.email });
    return res.json({ token, user: safeUser(user) });
  }));

  app.get('/api/auth/me', asyncRoute(async (req, res) => {
    const user = await store.users.findById(req.user.id, tenantId(req));
    return user ? res.json(safeUser(user)) : notFound(res);
  }));

  app.patch('/api/auth/me', asyncRoute(async (req, res) => {
    const user = await store.users.findById(req.user.id, tenantId(req));
    if (!user) return notFound(res);

    const { payload, data } = sanitizeProfilePayload(req.body || {});
    if (payload.email) await ensureUniqueEmail(store, payload.email, user.id);

    const updated = await store.users.update(user.id, {
      ...payload,
      data: {
        ...profileData(user),
        ...data,
      },
    }, tenantId(req));

    return updated ? res.json(safeUser(updated)) : notFound(res);
  }));

  app.get('/api/tenants/current', asyncRoute(async (req, res) => {
    const tenant = await store.tenants.findById(tenantId(req));
    return tenant ? res.json(tenant) : notFound(res);
  }));

  app.get('/api/dashboard/summary', asyncRoute(async (req, res) => {
    res.json(await store.dashboardSummary(tenantId(req)));
  }));

  app.get('/api/notifications', asyncRoute(async (req, res) => {
    const rows = await store.notifications.list({ tenantId: tenantId(req) });
    return res.json(rows.slice().reverse());
  }));

  app.patch('/api/notifications/:id/read', asyncRoute(async (req, res) => {
    const notification = await store.notifications.update(req.params.id, { status: 'read' }, tenantId(req));
    return notification ? res.json(notification) : notFound(res);
  }));

  app.delete('/api/notifications/:id', asyncRoute(async (req, res) => {
    return (await store.notifications.delete(req.params.id, tenantId(req))) ? res.status(204).send() : notFound(res);
  }));

  app.get('/api/search', asyncRoute(async (req, res) => {
    const query = req.query.q || '';
    const cacheKey = `${tenantId(req)}:${query}:${JSON.stringify(req.query)}`;
    const cached = await store.cache.get(cacheKey);
    if (cached) return res.json({ cached: true, results: cached });

    const results = [];
    for (const resource of ['tickets', 'customers', 'articles']) {
      const rows = await resourceMap[resource].list({ tenantId: tenantId(req), search: query });
      rows.forEach((item) => results.push({ resource, item }));
    }
    await store.cache.set(cacheKey, results);
    return res.json({ cached: false, results });
  }));

  app.post('/api/ai/chat', asyncRoute(async (req, res) => {
    const prompt = req.body.message || '';

    if (!process.env.OPENAI_API_KEY) {
      throw new ApiError(503, 'OpenAI API key is not configured');
    }

    const context = await buildAiContext(store, tenantId(req));
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        input: [
          'You are a helpful AI assistant inside a helpdesk management system.',
          'Answer the user directly. If the question is about tickets, customers, articles, queue status, priorities, or support work, use the JSON context below.',
          'If the user asks a general question, answer normally and briefly.',
          '',
          `Helpdesk context JSON:\n${JSON.stringify(context, null, 2)}`,
          '',
          `User question: ${prompt}`,
        ].join('\n'),
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(response.status, data.error?.message || 'OpenAI request failed');
    }

    const reply = data.output_text || data.output?.[0]?.content?.[0]?.text;
    if (!reply) {
      throw new ApiError(502, 'OpenAI returned an empty response');
    }

    const conversation = await store.aiConversations.create({ tenantId: tenantId(req), prompt, reply });
    await store.queue.enqueue('ai-analysis', { conversationId: conversation.id, prompt }, tenantId(req));
    return res.json({ reply, conversation });
  }));

  app.post('/api/jobs', asyncRoute(async (req, res) => {
    const job = await store.queue.enqueue(req.body.type || 'email', req.body.payload || {}, tenantId(req));
    return res.status(202).json(job);
  }));

  app.post('/api/tickets', asyncRoute(async (req, res) => {
    const customerId = await resolveTicketCustomer(store, req.body, tenantId(req));
    const payload = sanitizeTicketPayload({ ...req.body, tenantId: tenantId(req) }, customerId);
    const ticket = await store.tickets.create(payload);
    await createNotification(store, tenantId(req), 'ticket_created', { ticketId: ticket.id, title: ticket.title, priority: ticket.priority }, req.user.id);
    return res.status(201).json(ticket);
  }));

  app.get('/api/tickets/:id/comments', asyncRoute(async (req, res) => {
    const ticket = await store.tickets.findById(req.params.id, tenantId(req));
    if (!ticket) return notFound(res);
    return res.json(await store.comments.list({ tenantId: tenantId(req), filters: { ticketId: ticket.id } }));
  }));

  app.post('/api/tickets/:id/comments', asyncRoute(async (req, res) => {
    const comment = await store.addTicketComment(req.params.id, {
      body: req.body.body,
      internal: req.body.internal,
      authorId: req.user.id,
    }, tenantId(req));
    if (comment) await createNotification(store, tenantId(req), 'comment_added', { ticketId: comment.ticketId, commentId: comment.id }, req.user.id);
    return comment ? res.status(201).json(comment) : notFound(res);
  }));

  app.get('/api/tickets/:id/attachments', asyncRoute(async (req, res) => {
    const ticket = await store.tickets.findById(req.params.id, tenantId(req));
    if (!ticket) return notFound(res);
    return res.json(await store.attachments.list({ tenantId: tenantId(req), filters: { ticketId: ticket.id } }));
  }));

  app.post('/api/tickets/:id/attachments', asyncRoute(async (req, res) => {
    const ticket = await store.tickets.findById(req.params.id, tenantId(req));
    if (!ticket) return notFound(res);

    const attachment = sanitizeAttachmentPayload(req.body || {});
    const created = await store.attachments.create({
      tenantId: tenantId(req),
      ticketId: ticket.id,
      fileName: attachment.fileName,
      url: attachment.url,
      data: {
        size: attachment.size,
        type: attachment.type,
        uploadedBy: req.user.id,
      },
    });
    await store.histories.create({ tenantId: tenantId(req), ticketId: ticket.id, action: 'attachment_added', actorId: req.user.id });
    await createNotification(store, tenantId(req), 'attachment_added', { ticketId: ticket.id, attachmentId: created.id, fileName: created.fileName }, req.user.id);
    return res.status(201).json(created);
  }));

  app.delete('/api/tickets/:ticketId/attachments/:attachmentId', asyncRoute(async (req, res) => {
    const ticket = await store.tickets.findById(req.params.ticketId, tenantId(req));
    if (!ticket) return notFound(res);

    const attachment = await store.attachments.findById(req.params.attachmentId, tenantId(req));
    if (!attachment || attachment.ticketId !== ticket.id) return notFound(res);

    await store.attachments.delete(attachment.id, tenantId(req));
    await store.histories.create({ tenantId: tenantId(req), ticketId: ticket.id, action: 'attachment_deleted', actorId: req.user.id });
    await createNotification(store, tenantId(req), 'attachment_deleted', { ticketId: ticket.id, attachmentId: attachment.id, fileName: attachment.fileName }, req.user.id);
    return res.status(204).send();
  }));

  app.delete('/api/tickets/:ticketId/comments/:commentId', asyncRoute(async (req, res) => {
    const ticket = await store.tickets.findById(req.params.ticketId, tenantId(req));
    if (!ticket) return notFound(res);

    const comment = await store.comments.findById(req.params.commentId, tenantId(req));
    if (!comment || comment.ticketId !== ticket.id) return notFound(res);

    await store.comments.delete(comment.id, tenantId(req));
    await store.histories.create({
      tenantId: tenantId(req),
      ticketId: ticket.id,
      action: 'comment_deleted',
      actorId: req.user.id,
      commentId: comment.id,
    });
    return res.status(204).send();
  }));

  app.delete('/api/tickets/:id', asyncRoute(async (req, res) => {
    const ticket = await store.tickets.findById(req.params.id, tenantId(req));
    if (!ticket) return notFound(res);

    const childOptions = { tenantId: tenantId(req), filters: { ticketId: ticket.id } };
    const [attachments, comments, histories] = await Promise.all([
      store.attachments.list(childOptions),
      store.comments.list(childOptions),
      store.histories.list(childOptions),
    ]);

    await Promise.all(attachments.map((attachment) => store.attachments.delete(attachment.id, tenantId(req))));
    await Promise.all(comments.map((comment) => store.comments.delete(comment.id, tenantId(req))));
    await Promise.all(histories.map((history) => store.histories.delete(history.id, tenantId(req))));
    await store.tickets.delete(ticket.id, tenantId(req));
    return res.status(204).send();
  }));

  app.patch('/api/tickets/:id/status', asyncRoute(async (req, res) => {
    if (!['admin', 'agent'].includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
    const allowedStatuses = ['open', 'triage', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
    if (!allowedStatuses.includes(req.body.status)) {
      return res.status(400).json({ message: `Status must be one of: ${allowedStatuses.join(', ')}` });
    }
    const ticket = await store.changeTicketStatus(req.params.id, req.body.status, req.user.id, tenantId(req));
    if (ticket) await createNotification(store, tenantId(req), 'status_changed', { ticketId: ticket.id, title: ticket.title, status: ticket.status }, req.user.id);
    return ticket ? res.json(ticket) : notFound(res);
  }));

  app.get('/api/articles', asyncRoute(async (req, res) => {
    const rows = await visibleKnowledgeArticles(store, req);
    const query = String(req.query.q || '').trim().toLowerCase();
    const filtered = query
      ? rows.filter((article) => [article.title, article.body, article.category]
        .some((value) => String(value || '').toLowerCase().includes(query)))
      : rows;
    return res.json(filtered);
  }));

  app.post('/api/articles', asyncRoute(async (req, res) => {
    return res.status(201).json(await store.articles.create(prepareArticlePayload(req)));
  }));

  app.put('/api/articles/:id', asyncRoute(async (req, res) => {
    const article = await canModifyKnowledgeArticle(store, req, req.params.id);
    if (article === null) return notFound(res);
    if (article === false) return res.status(403).json({ message: 'You can only edit your own knowledge articles' });
    const payload = prepareArticlePayload(req);
    const updated = await store.articles.update(article.id, payload, article.tenantId || undefined);
    return updated ? res.json(updated) : notFound(res);
  }));

  app.delete('/api/articles/:id', asyncRoute(async (req, res) => {
    const article = await canModifyKnowledgeArticle(store, req, req.params.id);
    if (article === null) return notFound(res);
    if (article === false) return res.status(403).json({ message: 'You can only delete your own knowledge articles' });
    await store.articles.delete(article.id, article.tenantId || undefined);
    return res.status(204).send();
  }));

  Object.entries(resourceMap).forEach(([resource, repo]) => {
    if (resource === 'articles') return;
    const allowedRoutes = documentedResourceRoutes[resource];
    if (!allowedRoutes) return;

    if (allowedRoutes.has('getList')) app.get(`/api/${resource}`, asyncRoute(async (req, res) => {
      const filters = { ...req.query };
      delete filters.q;
      return res.json(await repo.list({ tenantId: tenantId(req), search: req.query.q, filters }));
    }));

    if (allowedRoutes.has('postList')) app.post(`/api/${resource}`, asyncRoute(async (req, res) => {
      const payload = prepareResourcePayload(req, resource);
      return res.status(201).json(await repo.create(payload));
    }));

    if (allowedRoutes.has('getItem')) app.get(`/api/${resource}/:id`, asyncRoute(async (req, res) => {
      const row = await repo.findById(req.params.id, tenantId(req));
      return row ? res.json(row) : notFound(res);
    }));

    if (allowedRoutes.has('putItem')) app.put(`/api/${resource}/:id`, asyncRoute(async (req, res) => {
      const payload = sanitizeUpdatePayload(req, resource);
      const row = await repo.update(req.params.id, payload, tenantId(req));
      return row ? res.json(row) : notFound(res);
    }));

    if (allowedRoutes.has('deleteItem')) app.delete(`/api/${resource}/:id`, asyncRoute(async (req, res) => {
      return (await repo.delete(req.params.id, tenantId(req))) ? res.status(204).send() : notFound(res);
    }));
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const statusCode = error instanceof ApiError ? error.statusCode : 500;
    const payload = {
      message: error.message || 'Server error',
      ...(error.details ? { details: error.details } : {}),
    };
    return res.status(statusCode).json(payload);
  });

  return app;
}

async function start() {
  const store = await createStore();
  const app = createApp(store);
  app.listen(PORT, () => {
    console.log(`Helpdesk API running on http://localhost:${PORT}`);
    console.log(`Swagger docs on http://localhost:${PORT}/api-docs`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { createApp, createStore, LoggingMiddleware, AuthenticationMiddleware };
