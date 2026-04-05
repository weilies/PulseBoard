-- Automata Phase 1: DB schema for platform apps, tenant installs, credentials, job runs, and job errors

-- 1. platform_apps (Next Novas publishes)
create table if not exists platform_apps (
  id                        uuid primary key default gen_random_uuid(),
  slug                      text not null unique,
  name                      text not null,
  description               text,
  icon                      text,
  type                      text not null default 'n8n_workflow',  -- n8n_workflow | collection_bundle
  visibility                text not null default 'public',        -- public | tenant_specific
  allowed_tenant_ids        uuid[],
  config_schema             jsonb not null default '{}',
  n8n_workflow_json         jsonb,
  n8n_template_workflow_id  text,
  version                   text not null default '1.0.0',
  published_at              timestamptz,
  published_by              uuid references auth.users(id),
  created_at                timestamptz default now(),
  updated_at                timestamptz default now()
);

-- 2. tenant_installed_apps (tenant installs)
create table if not exists tenant_installed_apps (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id) on delete cascade,
  app_id                uuid not null references platform_apps(id),
  installed_at          timestamptz default now(),
  installed_by_user_id  uuid references auth.users(id),
  config                jsonb not null default '{}',
  n8n_workflow_id       text,
  access_policy         jsonb not null default '{}',
  enabled               boolean not null default true,
  unique(tenant_id, app_id)
);

-- 3. tenant_app_credentials (credential pointers — never stores actual secret values)
create table if not exists tenant_app_credentials (
  id                        uuid primary key default gen_random_uuid(),
  tenant_installed_app_id   uuid not null references tenant_installed_apps(id) on delete cascade,
  credential_key            text not null,
  n8n_credential_id         text not null,
  last_updated_at           timestamptz default now(),
  unique(tenant_installed_app_id, credential_key)
);

-- 4. integration_job_runs (execution summary — lightweight)
create table if not exists integration_job_runs (
  id                      uuid primary key default gen_random_uuid(),
  tenant_installed_app_id uuid not null references tenant_installed_apps(id) on delete cascade,
  n8n_execution_id        text,
  triggered_at            timestamptz not null,
  completed_at            timestamptz,
  status                  text not null,  -- success | partial | failed | aborted | running
  summary                 jsonb,
  created_at              timestamptz default now()
);

-- 5. integration_job_errors (row-level errors for traceability)
create table if not exists integration_job_errors (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid not null references integration_job_runs(id) on delete cascade,
  row_number       int,
  source_data      jsonb,
  error_code       text,
  error_message    text,
  resolved_at      timestamptz,
  resolved_by      uuid references auth.users(id),
  resolution_note  text,
  created_at       timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- RLS Policies
-- ---------------------------------------------------------------------------

alter table platform_apps enable row level security;
alter table tenant_installed_apps enable row level security;
alter table tenant_app_credentials enable row level security;
alter table integration_job_runs enable row level security;
alter table integration_job_errors enable row level security;

-- platform_apps: readable by all authenticated users (public visibility check happens in app layer)
create policy "platform_apps_read_authenticated"
  on platform_apps for select
  to authenticated
  using (true);

-- platform_apps: only super_admin (service role) can insert/update/delete — enforced at app layer
create policy "platform_apps_write_service_role"
  on platform_apps for all
  to service_role
  using (true);

-- tenant_installed_apps: scoped to current tenant
create policy "tenant_installed_apps_tenant_read"
  on tenant_installed_apps for select
  to authenticated
  using (
    tenant_id in (
      select tenant_id from tenant_users where user_id = auth.uid()
    )
  );

create policy "tenant_installed_apps_tenant_write"
  on tenant_installed_apps for all
  to authenticated
  using (
    tenant_id in (
      select tenant_id from tenant_users where user_id = auth.uid()
    )
  );

-- tenant_app_credentials: scoped via installed app → tenant
create policy "tenant_app_credentials_read"
  on tenant_app_credentials for select
  to authenticated
  using (
    tenant_installed_app_id in (
      select ia.id from tenant_installed_apps ia
      join tenant_users tu on tu.tenant_id = ia.tenant_id
      where tu.user_id = auth.uid()
    )
  );

create policy "tenant_app_credentials_write"
  on tenant_app_credentials for all
  to authenticated
  using (
    tenant_installed_app_id in (
      select ia.id from tenant_installed_apps ia
      join tenant_users tu on tu.tenant_id = ia.tenant_id
      where tu.user_id = auth.uid()
    )
  );

-- integration_job_runs: scoped via installed app → tenant
create policy "integration_job_runs_read"
  on integration_job_runs for select
  to authenticated
  using (
    tenant_installed_app_id in (
      select ia.id from tenant_installed_apps ia
      join tenant_users tu on tu.tenant_id = ia.tenant_id
      where tu.user_id = auth.uid()
    )
  );

create policy "integration_job_runs_write"
  on integration_job_runs for all
  to authenticated
  using (
    tenant_installed_app_id in (
      select ia.id from tenant_installed_apps ia
      join tenant_users tu on tu.tenant_id = ia.tenant_id
      where tu.user_id = auth.uid()
    )
  );

-- integration_job_errors: scoped via run → installed app → tenant
create policy "integration_job_errors_read"
  on integration_job_errors for select
  to authenticated
  using (
    run_id in (
      select r.id from integration_job_runs r
      join tenant_installed_apps ia on ia.id = r.tenant_installed_app_id
      join tenant_users tu on tu.tenant_id = ia.tenant_id
      where tu.user_id = auth.uid()
    )
  );

create policy "integration_job_errors_write"
  on integration_job_errors for all
  to authenticated
  using (
    run_id in (
      select r.id from integration_job_runs r
      join tenant_installed_apps ia on ia.id = r.tenant_installed_app_id
      join tenant_users tu on tu.tenant_id = ia.tenant_id
      where tu.user_id = auth.uid()
    )
  );
