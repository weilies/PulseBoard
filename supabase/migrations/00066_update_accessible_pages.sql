-- Add studio.automata and admin.platform-apps to get_accessible_pages for super_admin

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
      ('studio.app-store'),
      ('studio.automata'),
      ('admin.platform-apps');
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
