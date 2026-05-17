const bcrypt = require('bcryptjs');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const { createStore, resourceConfigs } = require('./src/dataStore');
const { buildSwaggerSpec, swaggerHtml } = require('./src/swagger');
const { validateLoginRequest, validateRegisterRequest } = require('./src/validation');

dotenv.config();

const PORT = process.env.PORT || 4000;
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'dev-secret';
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || '8h';
const adminResources = new Set(['users', 'roles', 'permissions', 'tenants']);

function signToken(payload) {
  return jwt.sign(payload, TOKEN_SECRET, { expiresIn: TOKEN_EXPIRY });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, TOKEN_SECRET);
  } catch {
    return null;
  }
}

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

function publicRoute(req) {
  return ['/', '/health', '/api/auth/login', '/api/auth/register', '/api-docs', '/api-docs.json'].includes(req.path);
}

function tenantId(req) {
  return req.user?.tenantId;
}

function safeUser(user) {
  if (!user) return null;
  const { password, ...rest } = user;
  return rest;
}

function notFound(res) {
  return res.status(404).json({ message: 'Resource not found' });
}

function createApp(store) {
  const app = express();
  const resourceMap = Object.fromEntries(resourceConfigs.map((config) => [config.route, store[config.property]]));

  app.use(cors());
  app.use(express.json());

  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      store.auditLogs.create({
        tenantId: req.user?.tenantId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - started,
      }).catch(() => {});
    });
    next();
  });

  app.use((req, res, next) => {
    if (publicRoute(req)) return next();
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = verifyToken(token);
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    req.user = user;
    return next();
  });

  app.get('/', (req, res) => res.redirect('/api-docs'));
  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'helpdesk-api' }));
  app.get('/api-docs.json', (req, res) => res.json(buildSwaggerSpec(PORT)));
  app.get('/api-docs', (req, res) => res.type('html').send(swaggerHtml()));

  app.post('/api/auth/register', asyncRoute(async (req, res) => {
    const validationError = validateRegisterRequest(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const exists = (await store.users.list({ filters: { email: req.body.email } }))[0];
    if (exists) return res.status(409).json({ message: 'Email already exists' });

    const tenant = await store.tenants.create({ 
      name: req.body.companyName, 
      slug: req.body.companySlug || `tenant-${Date.now()}` 
    });
    if (!tenant) return res.status(400).json({ message: 'Tenant could not be created' });

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
      return res.status(400).json({ message: validationError });
    }

    const users = await store.users.list({ filters: { email: req.body.email } });
    const user = users[0];
    if (!user || !(await verifyPassword(req.body.password, user.password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
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
    let reply = `Demo AI assistant: I would help with "${prompt}". Set OPENAI_API_KEY to call the real OpenAI API.`;

    if (process.env.OPENAI_API_KEY) {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', input: prompt }),
      });
      const data = await response.json();
      reply = data.output_text || data.output?.[0]?.content?.[0]?.text || reply;
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
      const payload = resource === 'tenants' ? req.body : { ...req.body, tenantId: tenantId(req) };
      return res.status(201).json(await repo.create(payload));
    }));

    app.get(`/api/${resource}/:id`, asyncRoute(async (req, res) => {
      if (adminResources.has(resource) && req.user.role !== 'admin') return res.status(403).json({ message: 'Admin role required' });
      const row = await repo.findById(req.params.id, tenantId(req));
      return row ? res.json(row) : notFound(res);
    }));

    app.put(`/api/${resource}/:id`, asyncRoute(async (req, res) => {
      if (adminResources.has(resource) && req.user.role !== 'admin') return res.status(403).json({ message: 'Admin role required' });
      const row = await repo.update(req.params.id, req.body, tenantId(req));
      return row ? res.json(row) : notFound(res);
    }));

    app.delete(`/api/${resource}/:id`, asyncRoute(async (req, res) => {
      if (adminResources.has(resource) && req.user.role !== 'admin') return res.status(403).json({ message: 'Admin role required' });
      return (await repo.delete(req.params.id, tenantId(req))) ? res.status(204).send() : notFound(res);
    }));
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    return res.status(500).json({ message: error.message || 'Server error' });
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

module.exports = { createApp, createStore, signToken, verifyToken };