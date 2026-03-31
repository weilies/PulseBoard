-- Super admins can read and manage tenant_users across all tenants.
-- The existing "See own tenant members" policy uses get_my_tenant_ids(), which
-- only returns tenants the current user belongs to — blocking super admins from
-- viewing members of tenants they are not personally enrolled in.

CREATE POLICY "Super admins see all tenant members"
  ON public.tenant_users FOR SELECT
  USING (public.is_super_admin());

CREATE POLICY "Super admins manage all tenant members"
  ON public.tenant_users FOR ALL
  USING (public.is_super_admin());
