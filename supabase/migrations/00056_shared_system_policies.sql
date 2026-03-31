-- =============================================================================
-- 00056_shared_system_policies.sql
-- System policies live ONLY in the super tenant and are shared across all tenants.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Re-link role_policies from per-tenant system policy copies to the
--    super tenant's canonical system policies (matched by name).
-- ---------------------------------------------------------------------------
do $$
declare
  v_super_tenant_id uuid;
  v_local_policy record;
  v_canonical_id uuid;
begin
  select id into v_super_tenant_id from public.tenants where is_super = true limit 1;
  if v_super_tenant_id is null then
    raise exception 'No super tenant found';
  end if;

  -- For each system policy in a non-super tenant, find the matching super tenant policy
  for v_local_policy in
    select p.id as local_id, p.name
    from public.policies p
    where p.is_system = true
      and p.tenant_id != v_super_tenant_id
  loop
    select id into v_canonical_id
    from public.policies
    where tenant_id = v_super_tenant_id
      and name = v_local_policy.name
      and is_system = true;

    -- If no matching canonical policy exists in super tenant, skip (shouldn't happen)
    if v_canonical_id is null then
      raise notice 'No canonical policy found for "%" — skipping', v_local_policy.name;
      continue;
    end if;

    -- Re-link role_policies to point to the canonical policy
    -- Use ON CONFLICT to handle cases where the link already exists
    insert into public.role_policies (role_id, policy_id)
    select rp.role_id, v_canonical_id
    from public.role_policies rp
    where rp.policy_id = v_local_policy.local_id
    on conflict (role_id, policy_id) do nothing;

    -- Delete the old links
    delete from public.role_policies
    where policy_id = v_local_policy.local_id;

  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Delete orphaned per-tenant system policies (now have no role_policies).
--    Cascades to their policy_permissions.
-- ---------------------------------------------------------------------------
delete from public.policies p
where p.is_system = true
  and p.tenant_id != (select id from public.tenants where is_super = true)
  and not exists (
    select 1 from public.role_policies rp where rp.policy_id = p.id
  );

-- ---------------------------------------------------------------------------
-- 3. Update RLS on `policies` — allow all authenticated users to READ
--    system policies (is_system = true), regardless of tenant.
-- ---------------------------------------------------------------------------
drop policy if exists "policies_select" on public.policies;
create policy "policies_select" on public.policies
  for select using (
    is_system = true                                      -- everyone reads system policies
    or public.is_super_admin()                            -- super admin reads everything
    or tenant_id in (select public.get_my_tenant_ids())   -- users read their tenant's custom policies
  );

-- Manage policy: system policies writable only by super admin.
-- Custom policies writable by users with 'roles' page access in their tenant.
drop policy if exists "policies_manage" on public.policies;
create policy "policies_manage" on public.policies
  for all using (
    public.is_super_admin()
    or (
      not is_system
      and tenant_id in (select public.get_my_tenant_ids())
      and public.has_page_access('roles')
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Update RLS on `policy_permissions` — allow reading permissions for
--    system policies (visible to all) + own tenant's custom policies.
-- ---------------------------------------------------------------------------
drop policy if exists "pp_select" on public.policy_permissions;
create policy "pp_select" on public.policy_permissions
  for select using (
    public.is_super_admin()
    or policy_id in (
      select id from public.policies
      where is_system = true
         or tenant_id in (select public.get_my_tenant_ids())
    )
  );

-- Manage: system policy permissions writable only by super admin.
-- Custom policy permissions writable by users with 'roles' page access.
drop policy if exists "pp_manage" on public.policy_permissions;
create policy "pp_manage" on public.policy_permissions
  for all using (
    public.is_super_admin()
    or (
      public.has_page_access('roles')
      and policy_id in (
        select id from public.policies
        where not is_system
          and tenant_id in (select public.get_my_tenant_ids())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 5. role_policies RLS stays the same — it checks role's tenant, not
--    policy's tenant. Cross-tenant links (tenant role → super tenant policy)
--    are visible because the role belongs to the user's tenant.
-- ---------------------------------------------------------------------------
