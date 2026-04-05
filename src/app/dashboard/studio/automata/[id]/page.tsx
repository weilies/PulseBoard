import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppDetailClient } from "./app-detail-client";

export default async function AutomataAppDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id: installedAppId } = await params;
  const { tab: initialTab } = await searchParams;

  const user = await getUser();
  if (!user) notFound();

  const tenantId = await resolveTenant(user.id);
  if (!tenantId) notFound();

  const db = createAdminClient();

  // Verify ownership + fetch install + app data
  const { data: rawInstall } = await db
    .from("tenant_installed_apps")
    .select(`
      id, enabled, config, access_policy, installed_at, installed_by_user_id, n8n_workflow_id,
      platform_apps(id, slug, name, description, icon, type, version, config_schema, published_by)
    `)
    .eq("id", installedAppId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!rawInstall) notFound();

  // Fetch credentials (keys only — no values)
  const { data: credentials } = await db
    .from("tenant_app_credentials")
    .select("credential_key, last_updated_at")
    .eq("tenant_installed_app_id", installedAppId);

  // Fetch tenant roles for access policy
  const supabase = await createClient();
  const { data: roles } = await supabase
    .from("roles")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .order("name");

  // Fetch last 30 days stats
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentRuns } = await db
    .from("integration_job_runs")
    .select("id, status, triggered_at, completed_at")
    .eq("tenant_installed_app_id", installedAppId)
    .gte("triggered_at", thirtyDaysAgo)
    .order("triggered_at", { ascending: false });

  const { data: latestRun } = await db
    .from("integration_job_runs")
    .select("id, status, triggered_at, completed_at, summary")
    .eq("tenant_installed_app_id", installedAppId)
    .order("triggered_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Determine user's access to sensitive tabs
  const { data: isSuper } = await supabase.rpc("is_super_admin");
  const { data: membership } = await db
    .from("tenant_users")
    .select("role_id")
    .eq("user_id", user.id)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();

  const policy = (rawInstall.access_policy ?? {}) as {
    view_definition?: string[];
    view_logs?: string[];
  };
  const userRoleId = membership?.role_id ?? "";
  const canViewWorkflow = isSuper || !policy.view_definition?.length || (policy.view_definition ?? []).includes(userRoleId);
  const canViewLogs = isSuper || !policy.view_logs?.length || (policy.view_logs ?? []).includes(userRoleId);

  // Installed-by user display
  let installedByEmail: string | null = null;
  if (rawInstall.installed_by_user_id) {
    const { data: profile } = await db
      .from("profiles")
      .select("email")
      .eq("id", rawInstall.installed_by_user_id)
      .maybeSingle();
    installedByEmail = (profile as { email?: string } | null)?.email ?? null;
  }

  const totalRuns = recentRuns?.length ?? 0;
  const successRuns = recentRuns?.filter((r) => r.status === "success").length ?? 0;
  const successRate = totalRuns > 0 ? Math.round((successRuns / totalRuns) * 100) : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const install = rawInstall as any;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Back nav */}
      <Link
        href="/dashboard/studio/automata"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Automata
      </Link>

      <AppDetailClient
        install={{
          id: install.id,
          enabled: install.enabled,
          config: install.config ?? {},
          access_policy: install.access_policy ?? {},
          installed_at: install.installed_at,
          installed_by_email: installedByEmail,
          n8n_workflow_id: install.n8n_workflow_id,
        }}
        app={install.platform_apps}
        credentials={credentials ?? []}
        roles={roles ?? []}
        stats={{ totalRuns, successRate, lastRun: latestRun ?? null }}
        canViewWorkflow={!!canViewWorkflow}
        canViewLogs={!!canViewLogs}
        initialTab={initialTab ?? "overview"}
      />
    </div>
  );
}
