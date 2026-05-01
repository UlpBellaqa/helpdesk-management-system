const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { DataStore } = require('./src/dataStore');
const { buildSwaggerSpec, swaggerHtml } = require('./src/swagger');

dotenv.config();

const app = express();
const store = new DataStore();
const PORT = process.env.PORT || 4000;
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'dev-secret';

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
    });
  });
  next();
});

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifyToken(token) {
  const [body, signature] = String(token || '').split('.');
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(body || '').digest('base64url');
  if (!body || signature !== expected) return null;
  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
}

function auth(requiredRoles = []) {
  return (req, res, next) => {
    const publicPaths = ['/health', '/api/auth/login', '/api/auth/register', '/api-docs', '/api-docs.json'];
    if (publicPaths.includes(req.path)) return next();
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = verifyToken(token);
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    if (requiredRoles.length && !requiredRoles.includes(user.role)) return res.status(403).json({ message: 'Forbidden' });
    req.user = user;
    next();
  };
}

app.use(auth());

function tenantId(req) {
  return req.user?.tenantId || req.body.tenantId || req.query.tenantId;
}

function sendNotFound(res) {
  return res.status(404).json({ message: 'Resource not found' });
}

const resourceMap = {
  tenants: store.tenants,
  users: store.users,
  roles: store.roles,
  permissions: store.permissions,
  departments: store.departments,
  teams: store.teams,
  'agent-profiles': store.agentProfiles,
  customers: store.customers,
  services: store.services,
  'sla-policies': store.slaPolicies,
  priorities: store.priorities,
  categories: store.categories,
  tickets: store.tickets,
  comments: store.comments,
  attachments: store.attachments,
  histories: store.histories,
  articles: store.articles,
  notifications: store.notifications,
  'audit-logs': store.auditLogs,
  'ai-conversations': store.aiConversations,
  'cache-entries': store.cacheEntries,
  jobs: store.jobs,
};

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'helpdesk-api' }));
app.get('/api-docs.json', (req, res) => res.json(buildSwaggerSpec(PORT)));
app.get('/api-docs', (req, res) => res.type('html').send(swaggerHtml()));

app.post('/api/auth/register', (req, res) => {
  const tenant = req.body.tenantId ? store.tenants.findById(req.body.tenantId) : store.tenants.create({ name: req.body.companyName || 'New Company', slug: req.body.companySlug || `tenant-${Date.now()}` });
  const exists = store.users.list({ filters: { email: req.body.email } })[0];
  if (exists) return res.status(409).json({ message: 'Email already exists' });
  const user = store.users.create({ tenantId: tenant.id, name: req.body.name, email: req.body.email, password: req.body.password, role: req.body.role || 'customer' });
  const token = signToken({ id: user.id, tenantId: user.tenantId, role: user.role, email: user.email });
  return res.status(201).json({ token, user: { ...user, password: undefined } });
});

app.post('/api/auth/login', (req, res) => {
  const user = store.users.list({ filters: { email: req.body.email } }).find((row) => row.password === req.body.password);
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });
  const token = signToken({ id: user.id, tenantId: user.tenantId, role: user.role, email: user.email });
  return res.json({ token, user: { ...user, password: undefined } });
});

app.get('/api/search', (req, res) => {
  const query = req.query.q || '';
  const cacheKey = `${tenantId(req)}:${query}:${JSON.stringify(req.query)}`;
  const cached = store.cache.get(cacheKey);
  if (cached) return res.json({ cached: true, results: cached });
  const results = ['tickets', 'customers', 'articles'].flatMap((resource) =>
    resourceMap[resource].list({ tenantId: tenantId(req), search: query }).map((item) => ({ resource, item })),
  );
  store.cache.set(cacheKey, results);
  return res.json({ cached: false, results });
});

app.post('/api/ai/chat', async (req, res) => {
  const prompt = req.body.message || '';
  let reply = `Demo AI assistant: I would help with "${prompt}". Set OPENAI_API_KEY to call the real OpenAI API.`;
  if (process.env.OPENAI_API_KEY) {
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
          input: prompt,
        }),
      });
      const data = await response.json();
      reply = data.output_text || data.output?.[0]?.content?.[0]?.text || 'OpenAI returned an empty response.';
    } catch (error) {
      reply = `OpenAI request failed: ${error.message}`;
    }
  }
  const conversation = store.aiConversations.create({ tenantId: tenantId(req), prompt, reply });
  store.queue.enqueue('ai-analysis', { conversationId: conversation.id, prompt }, tenantId(req));
  return res.json({ reply, conversation });
});

app.post('/api/jobs', (req, res) => {
  const job = store.queue.enqueue(req.body.type || 'email', req.body.payload || {}, tenantId(req));
  return res.status(202).json(job);
});

Object.entries(resourceMap).forEach(([resource, repo]) => {
  const requiresAdmin = ['users', 'roles', 'permissions', 'tenants'].includes(resource);

  app.get(`/api/${resource}`, (req, res) => {
    const filters = { ...req.query };
    delete filters.q;
    const rows = repo.list({ tenantId: tenantId(req), search: req.query.q, filters });
    res.json(rows);
  });

  app.post(`/api/${resource}`, (req, res) => {
    if (requiresAdmin && req.user.role !== 'admin') return res.status(403).json({ message: 'Admin role required' });
    const row = repo.create({ ...req.body, tenantId: req.body.tenantId || tenantId(req) });
    res.status(201).json(row);
  });

  app.get(`/api/${resource}/:id`, (req, res) => {
    const row = repo.findById(req.params.id, tenantId(req));
    return row ? res.json(row) : sendNotFound(res);
  });

  app.put(`/api/${resource}/:id`, (req, res) => {
    if (requiresAdmin && req.user.role !== 'admin') return res.status(403).json({ message: 'Admin role required' });
    const row = repo.update(req.params.id, req.body, tenantId(req));
    return row ? res.json(row) : sendNotFound(res);
  });

  app.delete(`/api/${resource}/:id`, (req, res) => {
    if (requiresAdmin && req.user.role !== 'admin') return res.status(403).json({ message: 'Admin role required' });
    return repo.delete(req.params.id, tenantId(req)) ? res.status(204).send() : sendNotFound(res);
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Helpdesk API running on http://localhost:${PORT}`);
    console.log(`Swagger docs on http://localhost:${PORT}/api-docs`);
  });
}

module.exports = { app, store, signToken };
