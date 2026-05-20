const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const resourceConfigs = [
  { route: 'tenants', property: 'tenants', table: 'tenants', tenantScoped: false, fields: ['name', 'slug'] },
  { route: 'users', property: 'users', table: 'users', fields: ['roleId', 'name', 'email', 'password', 'role'] },
  { route: 'roles', property: 'roles', table: 'roles', fields: ['name'] },
  { route: 'permissions', property: 'permissions', table: 'permissions', fields: ['roleId', 'name'] },
  { route: 'departments', property: 'departments', table: 'departments', fields: ['name'] },
  { route: 'teams', property: 'teams', table: 'teams', fields: ['departmentId', 'name'] },
  { route: 'agent-profiles', property: 'agentProfiles', table: 'agent_profiles', fields: ['userId', 'teamId', 'title', 'active'] },
  { route: 'customers', property: 'customers', table: 'customers', fields: ['name', 'email', 'company'] },
  { route: 'services', property: 'services', table: 'services', fields: ['departmentId', 'name'] },
  { route: 'sla-policies', property: 'slaPolicies', table: 'sla_policies', fields: ['name', 'priority', 'responseHours', 'resolutionHours'] },
  { route: 'priorities', property: 'priorities', table: 'priorities', fields: ['name', 'rank', 'responseHours'] },
  { route: 'categories', property: 'categories', table: 'categories', fields: ['name'] },
  { route: 'tickets', property: 'tickets', table: 'tickets', fields: ['customerId', 'assigneeId', 'serviceId', 'title', 'description', 'status', 'priority', 'category', 'closedAt'] },
  { route: 'comments', property: 'comments', table: 'ticket_comments', fields: ['ticketId', 'authorId', 'body', 'internal'] },
  { route: 'attachments', property: 'attachments', table: 'ticket_attachments', fields: ['ticketId', 'fileName', 'url'] },
  { route: 'histories', property: 'histories', table: 'ticket_histories', fields: ['ticketId', 'action', 'fromStatus', 'toStatus', 'actorId', 'commentId'] },
  { route: 'articles', property: 'articles', table: 'knowledge_articles', fields: ['title', 'body', 'category', 'published'] },
  { route: 'notifications', property: 'notifications', table: 'notifications', fields: ['type', 'payload', 'status'] },
  { route: 'audit-logs', property: 'auditLogs', table: 'audit_logs', fields: ['method', 'path', 'statusCode', 'durationMs'] },
  { route: 'ai-conversations', property: 'aiConversations', table: 'ai_conversations', fields: ['prompt', 'reply'] },
  { route: 'cache-entries', property: 'cacheEntries', table: 'cache_entries', fields: ['key', 'value', 'expiresAt'] },
  { route: 'jobs', property: 'jobs', table: 'background_jobs', fields: ['type', 'payload', 'status', 'result', 'finishedAt'] },
];

const specialFields = new Set(['id', 'tenantId', 'createdAt', 'updatedAt']);

function snakeCase(value) {
  return value.replace(/([A-Z])/g, '_$1').toLowerCase();
}

function schemaTypeForField(field) {
  if (['active', 'published', 'internal', 'read'].includes(field)) return 'BOOLEAN';
  if (['rank', 'responseHours', 'resolutionHours', 'durationMs'].includes(field)) return 'INTEGER';
  if (['payload', 'value'].includes(field)) return 'JSONB';
  if (['closedAt', 'finishedAt', 'expiresAt'].includes(field)) return 'TIMESTAMPTZ';
  return 'TEXT';
}

function omitSpecialFields(data) {
  return Object.fromEntries(Object.entries(data || {}).filter(([key]) => !specialFields.has(key)));
}

function buildExplicitValues(data, fields) {
  const values = {};
  for (const field of fields || []) {
    if (specialFields.has(field) || field === 'tenantId') continue;
    if (data[field] !== undefined) values[field] = data[field];
  }
  return values;
}

function omitExplicitFields(data, fields) {
  const explicit = new Set(fields || []);
  return Object.fromEntries(Object.entries(data || {}).filter(([key]) => !explicit.has(key)));
}

async function hashPassword(password) {
  return bcrypt.hash(password || '', 10);
}

function matches(row, { tenantId, search, filters = {} } = {}) {
  if (tenantId && row.tenantId !== undefined && row.tenantId !== tenantId) return false;
  if (search && !Object.values(row).some((value) => String(value).toLowerCase().includes(String(search).toLowerCase()))) {
    return false;
  }
  return Object.entries(filters).every(([key, value]) => {
    if (value === undefined || value === '') return true;
    return String(row[key]) === String(value);
  });
}

class PrismaRepository {
  constructor(prisma, model) {
    this.prisma = prisma;
    this.model = model;
  }

  async create(data) {
    const { tenantId, ...createData } = data;
    return this.prisma[this.model].create({
      data: {
        ...createData,
        ...(tenantId && { tenantId }),
      },
    });
  }

  async list({ tenantId, search, filters = {} } = {}) {
    const where = {};
    if (tenantId) where.tenantId = tenantId;

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        where[key] = value;
      }
    });

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { body: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ].filter(condition => Object.values(condition)[0] !== undefined);
    }

    return this.prisma[this.model].findMany({ where });
  }

  async findById(id, tenantId) {
    const where = { id };
    if (tenantId) where.tenantId = tenantId;
    
    return this.prisma[this.model].findFirst({ where });
  }

  async update(id, data, tenantId) {
    const { tenantId: _, ...updateData } = data;
    
    const existing = await this.findById(id, tenantId);
    if (!existing) return null;

    return this.prisma[this.model].update({
      where: { id },
      data: updateData,
    });
  }

  async delete(id, tenantId) {
    const existing = await this.findById(id, tenantId);
    if (!existing) return false;

    await this.prisma[this.model].delete({
      where: { id },
    });
    return true;
  }
}

class MemoryCache {
  constructor(ttlMs = 60000) {
    this.ttlMs = ttlMs;
    this.values = new Map();
  }

  async get(key) {
    const hit = this.values.get(key);
    if (!hit || hit.expiresAt < Date.now()) {
      this.values.delete(key);
      return null;
    }
    return hit.value;
  }

  async set(key, value) {
    this.values.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}

class RedisCache {
  constructor(url) {
    const { createClient } = require('redis');
    this.client = createClient({ url });
    this.fallback = new MemoryCache();
    this.client.on('error', () => {});
    this.ready = this.client.connect().catch(() => null);
  }

  async get(key) {
    await this.ready;
    if (!this.client.isOpen) return this.fallback.get(key);
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }

  async set(key, value) {
    await this.ready;
    if (!this.client.isOpen) return this.fallback.set(key, value);
    await this.client.setEx(key, 60, JSON.stringify(value));
  }

  async close() {
    if (this.client.isOpen) await this.client.quit();
  }
}

class BackgroundQueue {
  constructor(jobRepository) {
    this.jobRepository = jobRepository;
  }

  async enqueue(type, payload, tenantId) {
    const job = await this.jobRepository.create({ type, payload, tenantId, status: 'queued' });
    setTimeout(() => {
      this.jobRepository.update(job.id, {
        status: 'completed',
        result: `Processed ${type}`,
        finishedAt: new Date().toISOString(),
      }, tenantId);
    }, 50);
    return job;
  }
}

class BaseStore {
  async seed() {
    if ((await this.tenants.list()).length > 0) return;

    const tenant = await this.tenants.create({ name: 'Acme Helpdesk', slug: 'acme' });
    const adminRole = await this.roles.create({ tenantId: tenant.id, name: 'admin' });
    const agentRole = await this.roles.create({ tenantId: tenant.id, name: 'agent' });
    await this.permissions.create({ tenantId: tenant.id, roleId: adminRole.id, name: 'system:admin' });
    await this.permissions.create({ tenantId: tenant.id, roleId: agentRole.id, name: 'tickets:manage' });
    await this.users.create({ tenantId: tenant.id, name: 'Admin User', email: 'admin@demo.com', password: await hashPassword('admin123'), role: 'admin', roleId: adminRole.id });
    const agent = await this.users.create({ tenantId: tenant.id, name: 'Agent User', email: 'agent@demo.com', password: await hashPassword('agent123'), role: 'agent', roleId: agentRole.id });
    const department = await this.departments.create({ tenantId: tenant.id, name: 'IT Support' });
    const team = await this.teams.create({ tenantId: tenant.id, name: 'Level 1', departmentId: department.id });
    await this.agentProfiles.create({ tenantId: tenant.id, userId: agent.id, teamId: team.id, title: 'Support Agent', active: true });
    await this.priorities.create({ tenantId: tenant.id, name: 'High', rank: 1, responseHours: 4 });
    await this.priorities.create({ tenantId: tenant.id, name: 'Medium', rank: 2, responseHours: 12 });
    await this.categories.create({ tenantId: tenant.id, name: 'Hardware' });
    await this.categories.create({ tenantId: tenant.id, name: 'Software' });
    const service = await this.services.create({ tenantId: tenant.id, name: 'Laptop Support', departmentId: department.id });
    await this.slaPolicies.create({ tenantId: tenant.id, name: 'Urgent 4h', priority: 'High', responseHours: 4, resolutionHours: 24 });
    const customer = await this.customers.create({ tenantId: tenant.id, name: 'Jane Customer', email: 'jane@example.com', company: 'Acme' });
    const ticket = await this.tickets.create({
      tenantId: tenant.id,
      title: 'Laptop will not start',
      description: 'Device does not power on after travel.',
      status: 'open',
      priority: 'High',
      category: 'Hardware',
      serviceId: service.id,
      customerId: customer.id,
      assigneeId: agent.id,
    });
    await this.comments.create({ tenantId: tenant.id, ticketId: ticket.id, authorId: agent.id, body: 'Initial triage started.' });
    await this.histories.create({ tenantId: tenant.id, ticketId: ticket.id, action: 'created', fromStatus: null, toStatus: 'open', actorId: agent.id });
    await this.articles.create({ tenantId: tenant.id, title: 'Reset laptop power state', body: 'Disconnect power, hold power button, reconnect.', category: 'Hardware', published: true });
  }

  async addTicketComment(ticketId, data, tenantId) {
    const ticket = await this.tickets.findById(ticketId, tenantId);
    if (!ticket) return null;
    const comment = await this.comments.create({
      tenantId,
      ticketId: ticket.id,
      authorId: data.authorId,
      body: data.body,
      internal: Boolean(data.internal),
    });
    await this.tickets.update(ticket.id, {}, tenantId);
    await this.histories.create({ tenantId, ticketId: ticket.id, action: 'commented', actorId: data.authorId, commentId: comment.id });
    await this.queue.enqueue('comment-notification', { ticketId: ticket.id, commentId: comment.id }, tenantId);
    return comment;
  }

  async changeTicketStatus(ticketId, status, actorId, tenantId) {
    const ticket = await this.tickets.findById(ticketId, tenantId);
    if (!ticket) return null;
    const updated = await this.tickets.update(ticket.id, { status }, tenantId);
    await this.histories.create({ tenantId, ticketId: ticket.id, action: 'status_changed', fromStatus: ticket.status, toStatus: status, actorId });
    await this.queue.enqueue('status-notification', { ticketId: ticket.id, fromStatus: ticket.status, toStatus: status }, tenantId);
    return updated;
  }

  async dashboardSummary(tenantId) {
    const tickets = await this.tickets.list({ tenantId });
    const countBy = (key) =>
      tickets.reduce((totals, ticket) => {
        const value = ticket[key] || 'unassigned';
        totals[value] = (totals[value] || 0) + 1;
        return totals;
      }, {});
    return {
      totals: {
        tickets: tickets.length,
        customers: (await this.customers.list({ tenantId })).length,
        openJobs: (await this.jobs.list({ tenantId, filters: { status: 'queued' } })).length,
        articles: (await this.articles.list({ tenantId })).length,
      },
      byStatus: countBy('status'),
      byPriority: countBy('priority'),
      recentTickets: tickets.slice(-5).reverse(),
    };
  }

  async close() {}
}

class MemoryRepository {
  constructor({ tenantScoped = true } = {}) {
    this.tenantScoped = tenantScoped;
    this.rows = [];
    this.nextId = 1;
  }

  async create(data) {
    const now = new Date().toISOString();
    const row = {
      ...data,
      id: String(this.nextId++),
      tenantId: this.tenantScoped ? data.tenantId : data.tenantId,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(row);
    return row;
  }

  async list(options = {}) {
    return this.rows.filter((row) => matches(row, options));
  }

  async findById(id, tenantId) {
    return this.rows.find((row) => row.id === String(id) && matches(row, { tenantId })) || null;
  }

  async update(id, data, tenantId) {
    const row = await this.findById(id, tenantId);
    if (!row) return null;
    const sanitized = { ...data };
    if (this.tenantScoped) delete sanitized.tenantId;
    Object.assign(row, sanitized, { updatedAt: new Date().toISOString() });
    return row;
  }

  async delete(id, tenantId) {
    const index = this.rows.findIndex((row) => row.id === String(id) && matches(row, { tenantId }));
    if (index < 0) return false;
    this.rows.splice(index, 1);
    return true;
  }
}

class MemoryStore extends BaseStore {
  constructor() {
    super();
    resourceConfigs.forEach((config) => {
      this[config.property] = new MemoryRepository({ tenantScoped: config.tenantScoped !== false });
    });
    this.cache = new MemoryCache();
    this.queue = new BackgroundQueue(this.jobs);
  }
}

class PrismaStore extends BaseStore {
  constructor(databaseUrl) {
    super();
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });

    this.tenants = new PrismaRepository(this.prisma, 'tenant');
    this.users = new PrismaRepository(this.prisma, 'user');
    this.roles = new PrismaRepository(this.prisma, 'role');
    this.permissions = new PrismaRepository(this.prisma, 'permission');
    this.departments = new PrismaRepository(this.prisma, 'department');
    this.teams = new PrismaRepository(this.prisma, 'team');
    this.agentProfiles = new PrismaRepository(this.prisma, 'agentProfile');
    this.customers = new PrismaRepository(this.prisma, 'customer');
    this.services = new PrismaRepository(this.prisma, 'service');
    this.slaPolicies = new PrismaRepository(this.prisma, 'slaPolicy');
    this.priorities = new PrismaRepository(this.prisma, 'priority');
    this.categories = new PrismaRepository(this.prisma, 'category');
    this.tickets = new PrismaRepository(this.prisma, 'ticket');
    this.comments = new PrismaRepository(this.prisma, 'ticketComment');
    this.attachments = new PrismaRepository(this.prisma, 'ticketAttachment');
    this.histories = new PrismaRepository(this.prisma, 'ticketHistory');
    this.articles = new PrismaRepository(this.prisma, 'knowledgeArticle');
    this.notifications = new PrismaRepository(this.prisma, 'notification');
    this.auditLogs = new PrismaRepository(this.prisma, 'auditLog');
    this.aiConversations = new PrismaRepository(this.prisma, 'aiConversation');
    this.cacheEntries = new PrismaRepository(this.prisma, 'cacheEntry');
    this.jobs = new PrismaRepository(this.prisma, 'backgroundJob');

    this.cache = new MemoryCache();
    this.queue = new BackgroundQueue(this.jobs);
  }

  async init() {
    await this.seed();
  }

  async close() {
    await this.cache.close?.();
    await this.prisma.$disconnect();
  }
}

async function createStore({ memory = false } = {}) {
  if (memory || !process.env.DATABASE_URL) {
    const store = new MemoryStore();
    await store.seed();
    return store;
  }

  const store = new PrismaStore(process.env.DATABASE_URL);
  await store.init();
  return store;
}

module.exports = { createStore, resourceConfigs };
