-- Add webhooks, studio.logs, studio.app-store page permissions
-- into "Full Platform Access" system policy (super tenant only)
do $$
declare
  v_policy_id uuid;
  v_tenant_id uuid;
begin
  -- Get super tenant
  select id into v_tenant_id from public.tenants where is_super = true limit 1;
  if v_tenant_id is null then return; end if;

  -- Get "Full Platform Access" policy
  select id into v_policy_id
  from public.policies
  where tenant_id = v_tenant_id and name = 'Full Platform Access' and is_system = true
  limit 1;
  if v_policy_id is null then return; end if;

  -- Upsert missing page permissions
  insert into public.policy_permissions (policy_id, resource_type, resource_id, permissions)
  values
    (v_policy_id, 'page', 'webhooks',        '{"access": true}'),
    (v_policy_id, 'page', 'studio.logs',     '{"access": true}'),
    (v_policy_id, 'page', 'studio.app-store','{"access": true}')
  on conflict (policy_id, resource_type, resource_id) do nothing;
end $$;
