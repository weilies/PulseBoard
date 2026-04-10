import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getUser, getUserRole } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { notFound } from "next/navigation";
import { AdminAppCatalogClient } from "./apps-admin-client";

export default async function AdminAppCatalogPage() {
  const user = await getUser();
  if (!user) notFound();

  const tenantId = await resolveTenant(user.id);
  if (!tenantId) notFound();

  const role = await getUserRole(user.id, tenantId);
  if (role !== "super_admin") notFound();

  const db = createAdminClient();

  const { data: apps } = await db
    .from("platform_apps")
    .select("id, slug, name, description, icon, type, visibility, version, published_at, updated_at")
    .order("created_at", { ascending: false });

  // Fetch install counts per app
  const { data: installCounts } = await db
    .from("tenant_installed_apps")
    .select("app_id")
    .eq("enabled", true);

  const countMap: Record<string, number> = {};
  for (const row of installCounts ?? []) {
    countMap[row.app_id] = (countMap[row.app_id] ?? 0) + 1;
  }

  // Fetch tenants for tenant_specific picker + super-tenant flag
  const [{ data: tenants }, { data: tenantRow }] = await Promise.all([
    db.from("tenants").select("id, name, slug").order("name"),
    db.from("tenants").select("is_super").eq("id", tenantId).maybeSingle(),
  ]);
  const isSuperTenant = tenantRow?.is_super ?? false;

  return (
    <AdminAppCatalogClient
      apps={(apps ?? []).map((a) => ({ ...a, installCount: countMap[a.id] ?? 0 }))}
      tenants={tenants ?? []}
      isSuperTenant={isSuperTenant}
    />
  );
}
