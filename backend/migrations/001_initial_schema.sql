DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tenants',
    'users',
    'roles',
    'permissions',
    'departments',
    'teams',
    'agent_profiles',
    'customers',
    'services',
    'sla_policies',
    'priorities',
    'categories',
    'tickets',
    'ticket_comments',
    'ticket_attachments',
    'ticket_histories',
    'knowledge_articles',
    'notifications',
    'audit_logs',
    'ai_conversations',
    'cache_entries',
    'background_jobs'
  ]
  LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I (
        id BIGSERIAL PRIMARY KEY,
        tenant_id TEXT,
        data JSONB NOT NULL DEFAULT ''{}''::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )',
      table_name
    );
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (tenant_id)', table_name || '_tenant_idx', table_name);
  END LOOP;
END $$;
