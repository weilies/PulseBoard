import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Store } from "lucide-react";
import { AutomataDashboard } from "./automata-client";

interface PlatformAppRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  type: string;
  version: string;
  config_schema: { fields?: Array<{ key: string; type: string; label: string }> } | null;
}

interface InstalledAppRow {
  id: string;
  enabled: boolean;
  config: Record<string, unknown> | null;
  installed_at: string;
  n8n_workflow_id: string | null;
  platform_apps: PlatformAppRow;
}

interface JobRunRow {
  id: string;
  tenant_installed_app_id: string;
  triggered_at: string;
  completed_at: string | null;
  status: string;
  summary: Record<string, unknown> | null;
}

export default async function AutomataPage() {
  const user = await getUser();
  if (!user) notFound();

  const tenantId = await resolveTenant(user.id);
  if (!tenantId) notFound();

  const db = createAdminClient();

  // Fetch installed apps with platform app details
  const { data: rawInstalls } = await db
    .from("tenant_installed_apps")
    .select("id, enabled, config, installed_at, n8n_workflow_id, platform_apps(id, slug, name, description, icon, type, version, config_schema)")
    .eq("tenant_id", tenantId)
    .order("installed_at", { ascending: false });

  const installs = (rawInstalls ?? []) as unknown as InstalledAppRow[];
  const installedIds = installs.map((i) => i.id);

  // Fetch latest run per installed app + activity feed
  let allRuns: JobRunRow[] = [];
  if (installedIds.length > 0) {
    const { data } = await db
      .from("integration_job_runs")
      .select("id, tenant_installed_app_id, triggered_at, completed_at, status, summary")
      .in("tenant_installed_app_id", installedIds)
      .order("triggered_at", { ascending: false })
      .limit(100);
    allRuns = (data ?? []) as JobRunRow[];
  }

  // Build latest-run map per installed app
  const latestRunMap: Record<string, JobRunRow> = {};
  for (const run of allRuns) {
    if (!latestRunMap[run.tenant_installed_app_id]) {
      latestRunMap[run.tenant_installed_app_id] = run;
    }
  }

  // Activity feed: last 20 runs across all apps
  const activityFeed = allRuns.slice(0, 20);

  // Build app name map for activity feed
  const appNameMap: Record<string, { name: string; icon: string | null }> = {};
  for (const install of installs) {
    appNameMap[install.id] = { name: install.platform_apps.name, icon: install.platform_apps.icon };
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚡</span>
          <div>
            <h1
              className="text-xl font-bold text-gray-900 dark:text-gray-100"
              style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
            >
              Automata
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Monitor and control your outbound automation workflows
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/studio/app-store"
          className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
        >
          <Store className="h-3.5 w-3.5" />
          Browse App Store
        </Link>
      </div>

      <AutomataDashboard
        installs={installs.map((i) => ({
          id: i.id,
          enabled: i.enabled,
          config: i.config ?? {},
          installed_at: i.installed_at,
          n8n_workflow_id: i.n8n_workflow_id,
          app: i.platform_apps,
          latestRun: latestRunMap[i.id] ?? null,
        }))}
        activityFeed={activityFeed.map((r) => ({
          ...r,
          appName: appNameMap[r.tenant_installed_app_id]?.name ?? "Unknown",
          appIcon: appNameMap[r.tenant_installed_app_id]?.icon ?? null,
        }))}
      />
    </div>
  );
}
