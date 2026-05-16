const bcrypt = require('bcryptjs');

const resourceConfigs = [
  { route: 'tenants', property: 'tenants', table: 'tenants', tenantScoped: false },
  { route: 'users', property: 'users', table: 'users' },
  { route: 'roles', property: 'roles', table: 'roles' },
  { route: 'permissions', property: 'permissions', table: 'permissions' },
  { route: 'departments', property: 'departments', table: 'departments' },
  { route: 'teams', property: 'teams', table: 'teams' },
  { route: 'agent-profiles', property: 'agentProfiles', table: 'agent_profiles' },
  { route: 'customers', property: 'customers', table: 'customers' },
  { route: 'services', property: 'services', table: 'services' },
  { route: 'sla-policies', property: 'slaPolicies', table: 'sla_policies' },
  { route: 'priorities', property: 'priorities', table: 'priorities' },
  { route: 'categories', property: 'categories', table: 'categories' },
  { route: 'tickets', property: 'tickets', table: 'tickets' },
  { route: 'comments', property: 'comments', table: 'ticket_comments' },
  { route: 'attachments', property: 'attachments', table: 'ticket_attachments' },
  { route: 'histories', property: 'histories', table: 'ticket_histories' },
  { route: 'articles', property: 'articles', table: 'knowledge_articles' },
  { route: 'notifications', property: 'notifications', table: 'notifications' },
  { route: 'audit-logs', property: 'auditLogs', table: 'audit_logs' },
  { route: 'ai-conversations', property: 'aiConversations', table: 'ai_conversations' },
  { route: 'cache-entries', property: 'cacheEntries', table: 'cache_entries' },
  { route: 'jobs', property: 'jobs', table: 'background_jobs' },
];

const specialFields = new Set(['id', 'tenantId', 'createdAt', 'updatedAt']);

function omitSpecialFields(data) {
  return Object.fromEntries(Object.entries(data || {}).filter(([key]) => !specialFields.has(key)));
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
    Object.assign(row, data, { updatedAt: new Date().toISOString() });
    return row;
  }

  async delete(id, tenantId) {
    const index = this.rows.findIndex((row) => row.id === String(id) && matches(row, { tenantId }));
    if (index < 0) return false;
    this.rows.splice(index, 1);
    return true;
  }
}

function quoteIdentifier(value) {
  return `"${value.replace(/"/g, '""')}"`;
}

class PostgresRepository {
  constructor(pool, config) {
    this.pool = pool;
    this.table = config.table;
    this.tenantScoped = config.tenantScoped !== false;
  }

  rowFromDatabase(row) {
    return {
      id: String(row.id),
      tenantId: row.tenant_id || undefined,
      ...row.data,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async init() {
    const table = quoteIdentifier(this.table);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id BIGSERIAL PRIMARY KEY,
        tenant_id TEXT,
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS ${this.table}_tenant_idx ON ${table} (tenant_id)`);
  }

  async create(data) {
    const tenantId = this.tenantScoped ? data.tenantId : data.tenantId || null;
    const result = await this.pool.query(
      `INSERT INTO ${quoteIdentifier(this.table)} (tenant_id, data) VALUES ($1, $2) RETURNING *`,
      [tenantId || null, omitSpecialFields(data)],
    );
    return this.rowFromDatabase(result.rows[0]);
  }

  async list(options = {}) {
    const params = [];
    const where = [];
    if (options.tenantId && this.tenantScoped) {
      params.push(options.tenantId);
      where.push(`tenant_id = $${params.length}`);
    }
    const sql = `SELECT * FROM ${quoteIdentifier(this.table)} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id`;
    const result = await this.pool.query(sql, params);
    return result.rows.map((row) => this.rowFromDatabase(row)).filter((row) => matches(row, options));
  }

  async findById(id, tenantId) {
    const params = [id];
    const where = ['id = $1'];
    if (tenantId && this.tenantScoped) {
      params.push(tenantId);
      where.push(`tenant_id = $${params.length}`);
    }
    const result = await this.pool.query(`SELECT * FROM ${quoteIdentifier(this.table)} WHERE ${where.join(' AND ')}`, params);
    return result.rows[0] ? this.rowFromDatabase(result.rows[0]) : null;
  }

  async update(id, data, tenantId) {
    const current = await this.findById(id, tenantId);
    if (!current) return null;
    const next = { ...omitSpecialFields(current), ...omitSpecialFields(data) };
    const nextTenantId = this.tenantScoped ? data.tenantId || current.tenantId : data.tenantId || null;
    const result = await this.pool.query(
      `UPDATE ${quoteIdentifier(this.table)}
       SET tenant_id = $1, data = $2, updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [nextTenantId || null, next, id],
    );
    return this.rowFromDatabase(result.rows[0]);
  }

  async delete(id, tenantId) {
    const params = [id];
    const where = ['id = $1'];
    if (tenantId && this.tenantScoped) {
      params.push(tenantId);
      where.push(`tenant_id = $${params.length}`);
    }
    const result = await this.pool.query(`DELETE FROM ${quoteIdentifier(this.table)} WHERE ${where.join(' AND ')}`, params);
    return result.rowCount > 0;
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

class PostgresStore extends BaseStore {
  constructor(databaseUrl, redisUrl) {
    super();
    const { Pool } = require('pg');
    this.pool = new Pool({ connectionString: databaseUrl });
    resourceConfigs.forEach((config) => {
      this[config.property] = new PostgresRepository(this.pool, config);
    });
    this.cache = redisUrl ? new RedisCache(redisUrl) : new MemoryCache();
    this.queue = new BackgroundQueue(this.jobs);
  }

  async init() {
    for (const config of resourceConfigs) {
      await this[config.property].init();
    }
    await this.seed();
  }

  async close() {
    await this.cache.close?.();
    await this.pool.end();
  }
}

async function createStore({ memory = false } = {}) {
  if (memory || !process.env.DATABASE_URL) {
    const store = new MemoryStore();
    await store.seed();
    return store;
  }
  const store = new PostgresStore(process.env.DATABASE_URL, process.env.REDIS_URL || 'redis://localhost:6379');
  await store.init();
  return store;
}

module.exports = { createStore, resourceConfigs };
