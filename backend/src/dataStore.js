class Entity {
  constructor(data = {}) {
    this.id = data.id;
    this.tenantId = data.tenantId;
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }
}

class Tenant extends Entity {}
class User extends Entity {}
class Role extends Entity {}
class Permission extends Entity {}
class Department extends Entity {}
class Team extends Entity {}
class AgentProfile extends Entity {}
class Customer extends Entity {}
class ServiceCatalog extends Entity {}
class SlaPolicy extends Entity {}
class Priority extends Entity {}
class Category extends Entity {}
class Ticket extends Entity {}
class TicketComment extends Entity {}
class TicketAttachment extends Entity {}
class TicketHistory extends Entity {}
class KnowledgeArticle extends Entity {}
class Notification extends Entity {}
class AuditLog extends Entity {}
class AiConversation extends Entity {}
class CacheEntry extends Entity {}
class BackgroundJob extends Entity {}

const modelClasses = {
  tenants: Tenant,
  users: User,
  roles: Role,
  permissions: Permission,
  departments: Department,
  teams: Team,
  agentProfiles: AgentProfile,
  customers: Customer,
  services: ServiceCatalog,
  slaPolicies: SlaPolicy,
  priorities: Priority,
  categories: Category,
  tickets: Ticket,
  comments: TicketComment,
  attachments: TicketAttachment,
  histories: TicketHistory,
  articles: KnowledgeArticle,
  notifications: Notification,
  auditLogs: AuditLog,
  aiConversations: AiConversation,
  cacheEntries: CacheEntry,
  jobs: BackgroundJob,
};

class Repository {
  constructor(ModelClass) {
    this.ModelClass = ModelClass;
    this.rows = [];
    this.nextId = 1;
  }

  create(data) {
    const row = new this.ModelClass({
      ...data,
      id: String(this.nextId++),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    this.rows.push(row);
    return row;
  }

  list({ tenantId, search, filters = {} } = {}) {
    return this.rows.filter((row) => {
      if (tenantId && row.tenantId && row.tenantId !== tenantId) return false;
      const matchesSearch =
        !search ||
        Object.values(row).some((value) =>
          String(value).toLowerCase().includes(String(search).toLowerCase()),
        );
      const matchesFilters = Object.entries(filters).every(([key, value]) => {
        if (value === undefined || value === '') return true;
        return String(row[key]) === String(value);
      });
      return matchesSearch && matchesFilters;
    });
  }

  findById(id, tenantId) {
    return this.rows.find((row) => row.id === String(id) && (!tenantId || !row.tenantId || row.tenantId === tenantId));
  }

  update(id, data, tenantId) {
    const row = this.findById(id, tenantId);
    if (!row) return null;
    Object.assign(row, data, { updatedAt: new Date().toISOString() });
    return row;
  }

  delete(id, tenantId) {
    const index = this.rows.findIndex((row) => row.id === String(id) && (!tenantId || !row.tenantId || row.tenantId === tenantId));
    if (index < 0) return false;
    this.rows.splice(index, 1);
    return true;
  }
}

class CacheService {
  constructor(ttlMs = 60000) {
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  get(key) {
    const hit = this.cache.get(key);
    if (!hit || hit.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return hit.value;
  }

  set(key, value) {
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    return value;
  }

  clear() {
    this.cache.clear();
  }
}

class BackgroundQueue {
  constructor(jobRepository) {
    this.jobRepository = jobRepository;
  }

  enqueue(type, payload, tenantId) {
    const job = this.jobRepository.create({ type, payload, tenantId, status: 'queued' });
    setTimeout(() => {
      this.jobRepository.update(job.id, {
        status: 'completed',
        result: `Processed ${type}`,
        finishedAt: new Date().toISOString(),
      });
    }, 50);
    return job;
  }
}

class DataStore {
  constructor() {
    Object.entries(modelClasses).forEach(([name, ModelClass]) => {
      this[name] = new Repository(ModelClass);
    });
    this.cache = new CacheService();
    this.queue = new BackgroundQueue(this.jobs);
    this.seed();
  }

  seed() {
    const tenant = this.tenants.create({ name: 'Acme Helpdesk', slug: 'acme' });
    const adminRole = this.roles.create({ tenantId: tenant.id, name: 'admin' });
    const agentRole = this.roles.create({ tenantId: tenant.id, name: 'agent' });
    this.permissions.create({ tenantId: tenant.id, name: 'tickets:manage' });
    this.users.create({ tenantId: tenant.id, name: 'Admin User', email: 'admin@demo.com', password: 'admin123', role: 'admin', roleId: adminRole.id });
    this.users.create({ tenantId: tenant.id, name: 'Agent User', email: 'agent@demo.com', password: 'agent123', role: 'agent', roleId: agentRole.id });
    this.departments.create({ tenantId: tenant.id, name: 'IT Support' });
    this.teams.create({ tenantId: tenant.id, name: 'Level 1' });
    this.priorities.create({ tenantId: tenant.id, name: 'High', rank: 1 });
    this.categories.create({ tenantId: tenant.id, name: 'Hardware' });
    this.services.create({ tenantId: tenant.id, name: 'Laptop Support' });
    this.slaPolicies.create({ tenantId: tenant.id, name: 'Urgent 4h', responseHours: 4 });
    this.customers.create({ tenantId: tenant.id, name: 'Jane Customer', email: 'jane@example.com' });
    this.tickets.create({ tenantId: tenant.id, title: 'Laptop will not start', status: 'open', priority: 'High', category: 'Hardware' });
    this.articles.create({ tenantId: tenant.id, title: 'Reset laptop power state', body: 'Disconnect power, hold power button, reconnect.' });
  }
}

module.exports = { DataStore, modelClasses };
