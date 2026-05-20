const bcrypt = require('bcryptjs');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createStore, resourceConfigs } = require('./src/dataStore');
const { buildSwaggerSpec, swaggerHtml } = require('./src/swagger');
const { validateLoginRequest, validateRegisterRequest } = require('./src/validation');
const { ApiError, BadRequestError, UnauthorizedError, ForbiddenError } = require('./src/errors');
const { LoggingMiddleware, AuthenticationMiddleware } = require('./src/middleware');

dotenv.config();

const PORT = process.env.PORT || 4000;
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'dev-secret';
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || '8h';
const adminResources = new Set(['users', 'roles', 'permissions', 'tenants']);

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

function notFound(res) {
  return res.status(404).json({ message: 'Resource not found' });
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
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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
  app.get('/api-docs', (req, res) => res.type('html').send(swaggerHtml()));

  const signToken = (payload) => authMiddleware.signToken(payload);

  app.post('/api/auth/register', asyncRoute(async (req, res) => {
    const validationError = validateRegisterRequest(req.body);
    if (validationError) {
      throw new BadRequestError(validationError);
    }

    const exists = (await store.users.list({ filters: { email: req.body.email } }))[0];
    if (exists) throw new BadRequestError('Email already exists');

    const tenant = await store.tenants.create({ 
      name: req.body.companyName, 
      slug: req.body.companySlug || `tenant-${Date.now()}` 
    });
    if (!tenant) throw new BadRequestError('Tenant could not be created');

    const requestedRole = req.body.role || 'customer';
    const role = ['admin', 'agent'].includes(requestedRole) ? 'customer' : requestedRole;
    const hashedPassword = await hashPassword(req.body.password);

    const user = await store.users.create({
      tenantId: tenant.id,
      name: req.body.name,
      email: req.body.email,
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

    const users = await store.users.list({ filters: { email: req.body.email } });
    const user = users[0];
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

  app.get('/api/tenants/current', asyncRoute(async (req, res) => {
    const tenant = await store.tenants.findById(tenantId(req));
    return tenant ? res.json(tenant) : notFound(res);
  }));

  app.get('/api/dashboard/summary', asyncRoute(async (req, res) => {
    res.json(await store.dashboardSummary(tenantId(req)));
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
    let reply = await buildLocalAiReply(store, tenantId(req), prompt);

    if (process.env.OPENAI_API_KEY) {
      try {
        const context = await buildLocalAiReply(store, tenantId(req), prompt);
        const response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
            input: `You are a concise helpdesk operations assistant. Use this local context and answer the user request.\n\n${context}\n\nUser request: ${prompt}`,
          }),
        });
        const data = await response.json();
        reply = data.output_text || data.output?.[0]?.content?.[0]?.text || reply;
      } catch (error) {
        console.error('OpenAI request failed, using local analysis fallback:', error.message);
      }
    }

    const conversation = await store.aiConversations.create({ tenantId: tenantId(req), prompt, reply });
    await store.queue.enqueue('ai-analysis', { conversationId: conversation.id, prompt }, tenantId(req));
    return res.json({ reply, conversation });
  }));

  app.post('/api/jobs', asyncRoute(async (req, res) => {
    const job = await store.queue.enqueue(req.body.type || 'email', req.body.payload || {}, tenantId(req));
    return res.status(202).json(job);
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
    return comment ? res.status(201).json(comment) : notFound(res);
  }));

  app.patch('/api/tickets/:id/status', asyncRoute(async (req, res) => {
    if (!['admin', 'agent'].includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
    const allowedStatuses = ['open', 'triage', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
    if (!allowedStatuses.includes(req.body.status)) {
      return res.status(400).json({ message: `Status must be one of: ${allowedStatuses.join(', ')}` });
    }
    const ticket = await store.changeTicketStatus(req.params.id, req.body.status, req.user.id, tenantId(req));
    return ticket ? res.json(ticket) : notFound(res);
  }));

  Object.entries(resourceMap).forEach(([resource, repo]) => {
    app.get(`/api/${resource}`, asyncRoute(async (req, res) => {
      if (adminResources.has(resource) && req.user.role !== 'admin') return res.status(403).json({ message: 'Admin role required' });
      const filters = { ...req.query };
      delete filters.q;
      return res.json(await repo.list({ tenantId: tenantId(req), search: req.query.q, filters }));
    }));

    app.post(`/api/${resource}`, asyncRoute(async (req, res) => {
      if (adminResources.has(resource) && req.user.role !== 'admin') return res.status(403).json({ message: 'Admin role required' });
      const payload = prepareResourcePayload(req, resource);
      return res.status(201).json(await repo.create(payload));
    }));

    app.get(`/api/${resource}/:id`, asyncRoute(async (req, res) => {
      if (adminResources.has(resource) && req.user.role !== 'admin') return res.status(403).json({ message: 'Admin role required' });
      const row = await repo.findById(req.params.id, tenantId(req));
      return row ? res.json(row) : notFound(res);
    }));

    app.put(`/api/${resource}/:id`, asyncRoute(async (req, res) => {
      if (adminResources.has(resource) && req.user.role !== 'admin') return res.status(403).json({ message: 'Admin role required' });
      const payload = sanitizeUpdatePayload(req, resource);
      const row = await repo.update(req.params.id, payload, tenantId(req));
      return row ? res.json(row) : notFound(res);
    }));

    app.delete(`/api/${resource}/:id`, asyncRoute(async (req, res) => {
      if (adminResources.has(resource) && req.user.role !== 'admin') return res.status(403).json({ message: 'Admin role required' });
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
