import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getUser, getUserRole } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { notFound } from "next/navigation";
import { Settings2 } from "lucide-react";
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

  // Fetch tenants for tenant_specific picker
  const { data: tenants } = await db
    .from("tenants")
    .select("id, name, slug")
    .order("name");

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings2 className="h-6 w-6 text-blue-600" />
          <div>
            <h1
              className="text-xl font-bold text-gray-900"
              style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
            >
              Platform App Catalog
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Manage apps published to tenants via App Store
            </p>
          </div>
        </div>
      </div>

      <AdminAppCatalogClient
        apps={(apps ?? []).map((a) => ({ ...a, installCount: countMap[a.id] ?? 0 }))}
        tenants={tenants ?? []}
      />
    </div>
  );
}
