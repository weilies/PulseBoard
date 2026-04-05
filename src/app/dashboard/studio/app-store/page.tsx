import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { Store } from "lucide-react";
import { AppStoreClient } from "./app-store-client";

export default async function AppStorePage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const tenantId = await resolveTenant(user.id);
  if (!tenantId) return null;

  const db = createAdminClient();

  // Fetch tenant slug for eligibility check
  const { data: tenant } = await db
    .from("tenants")
    .select("id, slug")
    .eq("id", tenantId)
    .maybeSingle();

  // Fetch published platform apps (public + tenant_specific where tenant is allowed)
  const { data: allApps } = await db
    .from("platform_apps")
    .select("id, slug, name, description, icon, type, visibility, allowed_tenant_ids, version, published_at, config_schema")
    .not("published_at", "is", null)
    .order("name");

  // Filter visibility server-side
  const apps = (allApps ?? []).filter((app) => {
    if (app.visibility === "public") return true;
    if (app.visibility === "tenant_specific") {
      const allowed = (app.allowed_tenant_ids ?? []) as string[];
      return allowed.includes(tenantId);
    }
    return false;
  });

  // Fetch this tenant's installs
  const { data: installs } = await db
    .from("tenant_installed_apps")
    .select("id, app_id, enabled")
    .eq("tenant_id", tenantId);

  const installMap = new Map(
    (installs ?? []).map((i) => [i.app_id, { id: i.id, enabled: i.enabled as boolean }])
  );

  // Fetch tenant roles for access policy step
  const { data: roles } = await supabase
    .from("roles")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .order("name");

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <Store className="h-6 w-6 text-blue-600" />
        <div>
          <h1
            className="text-xl font-bold text-gray-900"
            style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
          >
            App Store
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Browse and install platform integrations</p>
        </div>
      </div>

      <AppStoreClient
        apps={apps.map((a) => {
          const install = installMap.get(a.id);
          return {
            ...a,
            installId: install?.id ?? null,
            isInstalled: install?.enabled === true,
          };
        })}
        roles={roles ?? []}
        tenantId={tenantId}
        tenantSlug={tenant?.slug ?? ""}
      />

      <p className="text-xs text-gray-500">
        Apps are built and maintained by Next Novas. Contact your administrator to request additional integrations.
      </p>
    </div>
  );
}
