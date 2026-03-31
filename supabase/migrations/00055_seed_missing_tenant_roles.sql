-- =============================================================================
-- 00055_seed_missing_tenant_roles.sql
-- Seed default roles, policies, and permissions for tenants created after
-- migration 00013 (which only seeded existing tenants at the time).
-- Also backfills tenant_users.role_id where it is still NULL.
-- =============================================================================

do $$
declare
  v_tenant record;
  v_role_tenant_admin_id uuid;
  v_policy_tenant_mgmt_id uuid;
  v_col record;
begin
  -- Find tenants that have zero roles (missed by 00013 seed)
  for v_tenant in
    select t.id, t.slug, t.is_super
    from public.tenants t
    where not exists (select 1 from public.roles r where r.tenant_id = t.id)
  loop

    -- Create tenant_admin role
    insert into public.roles (tenant_id, name, slug, description, is_system)
    values (v_tenant.id, 'Tenant Admin', 'tenant_admin', 'Full access within this tenant', true)
    on conflict (tenant_id, slug) do nothing
    returning id into v_role_tenant_admin_id;

    if v_role_tenant_admin_id is null then
      select id into v_role_tenant_admin_id from public.roles
      where tenant_id = v_tenant.id and slug = 'tenant_admin';
    end if;

    -- Create "Tenant Management" policy
    insert into public.policies (tenant_id, name, description, is_system)
    values (v_tenant.id, 'Tenant Management', 'Default access for tenant administrators', true)
    on conflict (tenant_id, name) do nothing
    returning id into v_policy_tenant_mgmt_id;

    if v_policy_tenant_mgmt_id is null then
      select id into v_policy_tenant_mgmt_id from public.policies
      where tenant_id = v_tenant.id and name = 'Tenant Management';
    end if;

    -- Page permissions for tenant admin
    insert into public.policy_permissions (policy_id, resource_type, resource_id, permissions) values
      (v_policy_tenant_mgmt_id, 'page', 'dashboard',                    '{"access": true}'),
      (v_policy_tenant_mgmt_id, 'page', 'users',                        '{"access": true}'),
      (v_policy_tenant_mgmt_id, 'page', 'studio.system-collections',    '{"access": true}'),
      (v_policy_tenant_mgmt_id, 'page', 'studio.tenant-collections',    '{"access": true}'),
      (v_policy_tenant_mgmt_id, 'page', 'roles',                        '{"access": true}'),
      (v_policy_tenant_mgmt_id, 'page', 'policies',                     '{"access": true}'),
      (v_policy_tenant_mgmt_id, 'page', 'apps',                         '{"access": true}'),
      (v_policy_tenant_mgmt_id, 'page', 'webhooks',                     '{"access": true}'),
      (v_policy_tenant_mgmt_id, 'page', 'studio.app-store',             '{"access": true}'),
      (v_policy_tenant_mgmt_id, 'page', 'studio.queries',               '{"access": true}'),
      (v_policy_tenant_mgmt_id, 'page', 'studio.logs',                  '{"access": true}')
    on conflict (policy_id, resource_type, resource_id) do nothing;

    -- System collections: read + export
    for v_col in select id from public.collections where type = 'system' loop
      insert into public.policy_permissions (policy_id, resource_type, resource_id, permissions)
      values (
        v_policy_tenant_mgmt_id,
        'collection',
        v_col.id::text,
        '{"read": true, "create": false, "update": false, "delete": false, "export": true, "import": false, "manage_schema": false}'
      )
      on conflict (policy_id, resource_type, resource_id) do nothing;
    end loop;

    -- Tenant collections for this tenant: full CRUD
    for v_col in select id from public.collections where type = 'tenant' and tenant_id = v_tenant.id loop
      insert into public.policy_permissions (policy_id, resource_type, resource_id, permissions)
      values (
        v_policy_tenant_mgmt_id,
        'collection',
        v_col.id::text,
        '{"read": true, "create": true, "update": true, "delete": true, "export": true, "import": true, "manage_schema": true}'
      )
      on conflict (policy_id, resource_type, resource_id) do nothing;
    end loop;

    -- Link policy to role
    insert into public.role_policies (role_id, policy_id)
    values (v_role_tenant_admin_id, v_policy_tenant_mgmt_id)
    on conflict do nothing;

  end loop;
end;
$$;

-- Backfill tenant_users.role_id where still NULL
update public.tenant_users tu
set role_id = r.id
from public.roles r
where r.tenant_id = tu.tenant_id
  and r.slug = case
    when tu.role = 'super_admin' then 'super_admin'
    else 'tenant_admin'
  end
  and tu.role_id is null;
