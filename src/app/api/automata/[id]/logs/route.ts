import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getExecutions } from "@/lib/services/n8n.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: installedAppId } = await params;
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? 1));
  const limit = 20;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();

  // Verify tenant ownership
  const { data: install } = await db
    .from("tenant_installed_apps")
    .select("id, n8n_workflow_id, access_policy, tenant_id")
    .eq("id", installedAppId)
    .maybeSingle();

  if (!install) return Response.json({ error: "Not found" }, { status: 404 });

  // Verify user belongs to this tenant
  const { data: membership } = await db
    .from("tenant_users")
    .select("id, role_id")
    .eq("user_id", user.id)
    .eq("tenant_id", install.tenant_id)
    .eq("is_active", true)
    .maybeSingle();

  if (!membership) return Response.json({ error: "Forbidden" }, { status: 403 });

  // Check view_logs access policy
  const policy = (install.access_policy ?? {}) as { view_logs?: string[] };
  const allowedRoles: string[] = policy.view_logs ?? [];
  const { data: isSuper } = await supabase.rpc("is_super_admin");

  if (!isSuper && allowedRoles.length > 0 && !allowedRoles.includes(membership.role_id ?? "")) {
    return Response.json({ error: "Access denied: insufficient role for log view" }, { status: 403 });
  }

  // Fetch PulseBox-side job runs (source of truth for status + summary)
  const { data: pbRuns } = await db
    .from("integration_job_runs")
    .select("id, n8n_execution_id, triggered_at, completed_at, status, summary")
    .eq("tenant_installed_app_id", installedAppId)
    .order("triggered_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  // Attempt to merge n8n execution data (duration etc.) — best-effort
  let n8nMap: Record<string, { startedAt?: string; stoppedAt?: string; status?: string }> = {};
  if (install.n8n_workflow_id) {
    const n8nResult = await getExecutions(install.n8n_workflow_id, limit);
    if (!("error" in n8nResult)) {
      for (const ex of n8nResult.executions) {
        n8nMap[String(ex.id)] = { startedAt: ex.startedAt, stoppedAt: ex.stoppedAt, status: ex.status };
      }
    }
  }

  const runs = (pbRuns ?? []).map((r) => {
    const n8n = r.n8n_execution_id ? n8nMap[r.n8n_execution_id] : undefined;
    const startedAt = n8n?.startedAt ?? r.triggered_at;
    const stoppedAt = n8n?.stoppedAt ?? r.completed_at;
    const durationMs =
      startedAt && stoppedAt
        ? new Date(stoppedAt).getTime() - new Date(startedAt).getTime()
        : null;

    return {
      id: r.id,
      n8n_execution_id: r.n8n_execution_id,
      triggered_at: r.triggered_at,
      completed_at: r.completed_at,
      duration_ms: durationMs,
      status: r.status,
      summary: r.summary,
    };
  });

  return Response.json({ runs, page, hasMore: runs.length === limit });
}
