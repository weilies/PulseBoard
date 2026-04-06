import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RunDetailClient } from "./run-detail-client";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string; run_id: string }>;
}) {
  const { id: installedAppId, run_id: runId } = await params;

  const user = await getUser();
  if (!user) notFound();

  const tenantId = await resolveTenant(user.id);
  if (!tenantId) notFound();

  const db = createAdminClient();

  // Verify the run belongs to this tenant's install
  const { data: run } = await db
    .from("integration_job_runs")
    .select("id, tenant_installed_app_id, status, triggered_at, completed_at, summary, n8n_execution_id")
    .eq("id", runId)
    .eq("tenant_installed_app_id", installedAppId)
    .maybeSingle();

  if (!run) notFound();

  // Verify the install belongs to this tenant
  const { data: install } = await db
    .from("tenant_installed_apps")
    .select("id, platform_apps(name, icon)")
    .eq("id", installedAppId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!install) notFound();

  // Check access policy (view_logs)
  const supabase = await createClient();
  const { data: isSuper } = await supabase.rpc("is_super_admin");
  const { data: membership } = await db
    .from("tenant_users")
    .select("role_id")
    .eq("user_id", user.id)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();

  const { data: rawInstall } = await db
    .from("tenant_installed_apps")
    .select("access_policy")
    .eq("id", installedAppId)
    .maybeSingle();

  const policy = (rawInstall?.access_policy ?? {}) as { view_logs?: string[] };
  const userRoleId = membership?.role_id ?? "";
  const canViewLogs = isSuper || !policy.view_logs?.length || (policy.view_logs ?? []).includes(userRoleId);
  if (!canViewLogs) notFound();

  // Fetch error rows with resolver profile info
  const { data: rawErrors } = await db
    .from("integration_job_errors")
    .select("id, row_number, source_data, error_code, error_message, resolved_at, resolved_by, resolution_note, created_at")
    .eq("run_id", runId)
    .order("row_number", { ascending: true });

  // Fetch resolver display names
  const resolverIds = [...new Set((rawErrors ?? []).filter((e) => e.resolved_by).map((e) => e.resolved_by as string))];
  const resolverMap: Record<string, string> = {};
  if (resolverIds.length > 0) {
    const { data: profiles } = await db
      .from("profiles")
      .select("id, email")
      .in("id", resolverIds);
    for (const p of profiles ?? []) {
      resolverMap[p.id] = (p as { email?: string }).email ?? p.id;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const installAny = install as any;
  const appName: string = installAny.platform_apps?.name ?? "Unknown App";
  const appIcon: string | null = installAny.platform_apps?.icon ?? null;

  const errors = (rawErrors ?? []).map((e) => ({
    ...e,
    resolver_email: e.resolved_by ? (resolverMap[e.resolved_by] ?? null) : null,
  }));

  const durationMs =
    run.triggered_at && run.completed_at
      ? new Date(run.completed_at).getTime() - new Date(run.triggered_at).getTime()
      : null;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Back nav */}
      <Link
        href={`/dashboard/studio/automata/${installedAppId}?tab=logs`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to {appName}
      </Link>

      <RunDetailClient
        installedAppId={installedAppId}
        run={{
          id: run.id,
          status: run.status,
          triggered_at: run.triggered_at,
          completed_at: run.completed_at,
          duration_ms: durationMs,
          summary: (run.summary ?? {}) as Record<string, unknown>,
          n8n_execution_id: run.n8n_execution_id,
        }}
        appName={appName}
        appIcon={appIcon}
        errors={errors}
      />
    </div>
  );
}
