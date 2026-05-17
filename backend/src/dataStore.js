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

function quoteIdentifier(value) {
  return `"${value.replace(/"/g, '""')}"`;
}

class PostgresRepository {
  constructor(pool, config) {
    this.pool = pool;
    this.table = config.table;
    this.config = config;
    this.tenantScoped = config.tenantScoped !== false;
    this.explicitFields = new Set((config.fields || []).filter((field) => !specialFields.has(field) && field !== 'tenantId'));
  }

  rowFromDatabase(row) {
    const record = {
      id: String(row.id),
      tenantId: row.tenant_id || undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      ...row.data,
    };
    for (const field of this.explicitFields) {
      const column = snakeCase(field);
      if (Object.prototype.hasOwnProperty.call(row, column)) {
        record[field] = row[column];
      }
    }
    return record;
  }

  async init() {
    const table = quoteIdentifier(this.table);
    const columns = [
      'id BIGSERIAL PRIMARY KEY',
      'tenant_id TEXT',
      ...[...this.explicitFields].map((field) => `${quoteIdentifier(snakeCase(field))} ${schemaTypeForField(field)}`),
      `data JSONB NOT NULL DEFAULT '{}'::jsonb`,
      `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`,
      `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`,
    ];
    await this.pool.query(`CREATE TABLE IF NOT EXISTS ${table} (${columns.join(', ')})`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS ${this.table}_tenant_idx ON ${table} (tenant_id)`);
  }

  buildExplicitValues(data) {
    return buildExplicitValues(data, this.config.fields);
  }

  async create(data) {
    const tenantId = this.tenantScoped ? data.tenantId : data.tenantId || null;
    const rowData = omitSpecialFields(data);
    const explicitValues = this.buildExplicitValues(rowData);
    const jsonData = omitExplicitFields(rowData, this.config.fields);
    const columns = ['tenant_id'];
    const params = [tenantId || null];
    const placeholders = ['$1'];

    for (const [field, value] of Object.entries(explicitValues)) {
      columns.push(quoteIdentifier(snakeCase(field)));
      params.push(value);
      placeholders.push(`$${params.length}`);
    }

    columns.push('data');
    params.push(jsonData);
    placeholders.push(`$${params.length}`);

    const result = await this.pool.query(
      `INSERT INTO ${quoteIdentifier(this.table)} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
      params,
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
    const nextTenantId = this.tenantScoped ? current.tenantId : data.tenantId || null;
    const explicitValues = this.buildExplicitValues(next);
    const jsonData = omitExplicitFields(next, this.config.fields);

    const sets = ['tenant_id = $1', 'data = $2', 'updated_at = now()'];
    const params = [nextTenantId || null, jsonData];

    for (const [field, value] of Object.entries(explicitValues)) {
      sets.push(`${quoteIdentifier(snakeCase(field))} = $${params.length + 1}`);
      params.push(value);
    }

    params.push(id);
    const where = ['id = $' + params.length];
    if (tenantId && this.tenantScoped) {
      params.push(tenantId);
      where.push(`tenant_id = $${params.length}`);
    }

    const result = await this.pool.query(
      `UPDATE ${quoteIdentifier(this.table)}
       SET ${sets.join(', ')}
       WHERE ${where.join(' AND ')}
       RETURNING *`,
      params,
    );
    return result.rows[0] ? this.rowFromDatabase(result.rows[0]) : null;
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
