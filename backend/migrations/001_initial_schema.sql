CREATE TABLE IF NOT EXISTS tenants (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  name TEXT,
  slug TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  role_id TEXT,
  name TEXT,
  email TEXT,
  password TEXT,
  role TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roles (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  name TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  role_id TEXT,
  name TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS departments (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  name TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teams (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  department_id TEXT,
  name TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_profiles (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  user_id TEXT,
  team_id TEXT,
  title TEXT,
  active BOOLEAN NOT NULL DEFAULT false,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  name TEXT,
  email TEXT,
  company TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS services (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  department_id TEXT,
  name TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sla_policies (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  name TEXT,
  priority TEXT,
  response_hours INTEGER,
  resolution_hours INTEGER,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS priorities (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  name TEXT,
  rank INTEGER,
  response_hours INTEGER,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  name TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tickets (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  customer_id TEXT,
  assignee_id TEXT,
  service_id TEXT,
  title TEXT,
  description TEXT,
  status TEXT,
  priority TEXT,
  category TEXT,
  closed_at TIMESTAMPTZ,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket_comments (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  ticket_id TEXT,
  author_id TEXT,
  body TEXT,
  internal BOOLEAN NOT NULL DEFAULT false,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket_attachments (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  ticket_id TEXT,
  file_name TEXT,
  url TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket_histories (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  ticket_id TEXT,
  action TEXT,
  from_status TEXT,
  to_status TEXT,
  actor_id TEXT,
  comment_id TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_articles (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  title TEXT,
  body TEXT,
  category TEXT,
  published BOOLEAN NOT NULL DEFAULT false,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  type TEXT,
  payload JSONB,
  status TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  method TEXT,
  path TEXT,
  status_code INTEGER,
  duration_ms INTEGER,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  prompt TEXT,
  reply TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cache_entries (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  key TEXT,
  value JSONB,
  expires_at TIMESTAMPTZ,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS background_jobs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  type TEXT,
  payload JSONB,
  status TEXT,
  result TEXT,
  finished_at TIMESTAMPTZ,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenants_tenant_idx ON tenants (tenant_id);
CREATE INDEX IF NOT EXISTS users_tenant_idx ON users (tenant_id);
CREATE INDEX IF NOT EXISTS roles_tenant_idx ON roles (tenant_id);
CREATE INDEX IF NOT EXISTS permissions_tenant_idx ON permissions (tenant_id);
CREATE INDEX IF NOT EXISTS departments_tenant_idx ON departments (tenant_id);
CREATE INDEX IF NOT EXISTS teams_tenant_idx ON teams (tenant_id);
CREATE INDEX IF NOT EXISTS agent_profiles_tenant_idx ON agent_profiles (tenant_id);
CREATE INDEX IF NOT EXISTS customers_tenant_idx ON customers (tenant_id);
CREATE INDEX IF NOT EXISTS services_tenant_idx ON services (tenant_id);
CREATE INDEX IF NOT EXISTS sla_policies_tenant_idx ON sla_policies (tenant_id);
CREATE INDEX IF NOT EXISTS priorities_tenant_idx ON priorities (tenant_id);
CREATE INDEX IF NOT EXISTS categories_tenant_idx ON categories (tenant_id);
CREATE INDEX IF NOT EXISTS tickets_tenant_idx ON tickets (tenant_id);
CREATE INDEX IF NOT EXISTS ticket_comments_tenant_idx ON ticket_comments (tenant_id);
CREATE INDEX IF NOT EXISTS ticket_attachments_tenant_idx ON ticket_attachments (tenant_id);
CREATE INDEX IF NOT EXISTS ticket_histories_tenant_idx ON ticket_histories (tenant_id);
CREATE INDEX IF NOT EXISTS knowledge_articles_tenant_idx ON knowledge_articles (tenant_id);
CREATE INDEX IF NOT EXISTS notifications_tenant_idx ON notifications (tenant_id);
CREATE INDEX IF NOT EXISTS audit_logs_tenant_idx ON audit_logs (tenant_id);
CREATE INDEX IF NOT EXISTS ai_conversations_tenant_idx ON ai_conversations (tenant_id);
CREATE INDEX IF NOT EXISTS cache_entries_tenant_idx ON cache_entries (tenant_id);
CREATE INDEX IF NOT EXISTS background_jobs_tenant_idx ON background_jobs (tenant_id);
