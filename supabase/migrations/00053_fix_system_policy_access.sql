-- =============================================================================
-- 00053_fix_system_policy_access.sql — Fix system policy permission lookups
-- =============================================================================
-- System policies (is_system = true) are defined in the super tenant but should
-- grant access to users in all tenants. The get_accessible_pages() RPC now
-- correctly fetches permissions from the super tenant for system policies.
-- =============================================================================

create or replace function public.get_accessible_pages()
returns setof text
language plpgsql
security definer
stable
as $$
begin
  if public.is_super_admin() then
    return query values
      ('dashboard'),
      ('users'),
      ('tenants'),
      ('studio.system-collections'),
      ('studio.content-catalog'),
      ('studio.tenant-collections'),
      ('roles'),
      ('policies'),
      ('apps'),
      ('webhooks'),
      ('studio.logs'),
      ('studio.app-store');
    return;
  end if;

  -- Get pages from policies assigned to user's roles
  -- Handle both system and non-system policies correctly
  return query
    select distinct pp.resource_id
    from public.tenant_users tu
    join public.role_policies rp on rp.role_id = tu.role_id
    join public.policies p on p.id = rp.policy_id
    join public.policy_permissions pp on pp.policy_id = rp.policy_id
    where tu.user_id = auth.uid()
      and tu.is_active = true
      and pp.resource_type = 'page'
      and (pp.permissions ->> 'access')::boolean = true
      -- For system policies, they are stored in the super tenant
      -- For tenant policies, they match the user's tenant context
      and (p.is_system = false or p.tenant_id = (select id from public.tenants where is_super = true));
end;
$$;

-- Similarly, update has_page_access() to handle system policies
create or replace function public.has_page_access(p_page_slug text)
returns boolean
language plpgsql
security definer
stable
as $$
begin
  -- Super admins have access to all pages
  if public.is_super_admin() then
    return true;
  end if;

  -- Check if user has a policy with access to this page
  return exists (
    select 1
    from public.tenant_users tu
    join public.role_policies rp on rp.role_id = tu.role_id
    join public.policies p on p.id = rp.policy_id
    join public.policy_permissions pp on pp.policy_id = rp.policy_id
    where tu.user_id = auth.uid()
      and tu.is_active = true
      and pp.resource_type = 'page'
      and pp.resource_id = p_page_slug
      and (pp.permissions ->> 'access')::boolean = true
      and (p.is_system = false or p.tenant_id = (select id from public.tenants where is_super = true))
  );
end;
$$;

-- And update get_accessible_collection_ids() to handle system policies
create or replace function public.get_accessible_collection_ids(p_permission text)
returns setof uuid
language plpgsql
security definer
stable
as $$
begin
  if public.is_super_admin() then
    return query select id from public.collections;
    return;
  end if;

  return query
    select distinct pp.resource_id::uuid
    from public.tenant_users tu
    join public.role_policies rp on rp.role_id = tu.role_id
    join public.policies p on p.id = rp.policy_id
    join public.policy_permissions pp on pp.policy_id = rp.policy_id
    where tu.user_id = auth.uid()
      and tu.is_active = true
      and pp.resource_type = 'collection'
      and (pp.permissions ->> p_permission)::boolean = true
      and (p.is_system = false or p.tenant_id = (select id from public.tenants where is_super = true));
end;
$$;
