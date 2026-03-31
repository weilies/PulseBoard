-- =============================================================================
-- 00054_fix_system_policy_filter.sql — Remove incorrect super-tenant filter
-- =============================================================================
-- Migration 00053 added a WHERE clause that only accepted system policies from
-- the super tenant. But each tenant gets its OWN copy of system policies
-- (seeded in 00013). The role_policies join already scopes correctly —
-- no tenant_id filter is needed on policies at all.
--
-- Also adds missing page slugs to the super_admin shortcut.
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
      ('studio.navigations'),
      ('studio.queries'),
      ('studio.logs'),
      ('roles'),
      ('policies'),
      ('apps'),
      ('webhooks'),
      ('studio.app-store');
    return;
  end if;

  return query
    select distinct pp.resource_id
    from public.tenant_users tu
    join public.role_policies rp on rp.role_id = tu.role_id
    join public.policy_permissions pp on pp.policy_id = rp.policy_id
    where tu.user_id = auth.uid()
      and tu.is_active = true
      and pp.resource_type = 'page'
      and (pp.permissions ->> 'access')::boolean = true;
end;
$$;

create or replace function public.has_page_access(p_page_slug text)
returns boolean
language plpgsql
security definer
stable
as $$
begin
  if public.is_super_admin() then
    return true;
  end if;

  return exists (
    select 1
    from public.tenant_users tu
    join public.role_policies rp on rp.role_id = tu.role_id
    join public.policy_permissions pp on pp.policy_id = rp.policy_id
    where tu.user_id = auth.uid()
      and tu.is_active = true
      and pp.resource_type = 'page'
      and pp.resource_id = p_page_slug
      and (pp.permissions ->> 'access')::boolean = true
  );
end;
$$;

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
    join public.policy_permissions pp on pp.policy_id = rp.policy_id
    where tu.user_id = auth.uid()
      and tu.is_active = true
      and pp.resource_type = 'collection'
      and (pp.permissions ->> p_permission)::boolean = true;
end;
$$;
