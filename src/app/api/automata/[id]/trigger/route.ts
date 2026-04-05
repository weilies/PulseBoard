import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { triggerWorkflow } from "@/lib/services/n8n.service";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: installedAppId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();

  // Verify tenant ownership + app is enabled
  const { data: install } = await db
    .from("tenant_installed_apps")
    .select("id, n8n_workflow_id, enabled, tenant_id")
    .eq("id", installedAppId)
    .maybeSingle();

  if (!install) return Response.json({ error: "Not found" }, { status: 404 });
  if (!install.enabled) return Response.json({ error: "App is paused" }, { status: 400 });

  // Verify user belongs to this tenant
  const { data: membership } = await db
    .from("tenant_users")
    .select("id")
    .eq("user_id", user.id)
    .eq("tenant_id", install.tenant_id)
    .eq("is_active", true)
    .maybeSingle();

  if (!membership) return Response.json({ error: "Forbidden" }, { status: 403 });

  if (!install.n8n_workflow_id) {
    return Response.json({ error: "No workflow linked to this app" }, { status: 400 });
  }

  // Create a running job record before triggering
  const { data: jobRun } = await db
    .from("integration_job_runs")
    .insert({
      tenant_installed_app_id: installedAppId,
      triggered_at: new Date().toISOString(),
      status: "running",
    })
    .select("id")
    .single();

  // Trigger n8n workflow
  const result = await triggerWorkflow(install.n8n_workflow_id);
  if ("error" in result) {
    // Update job run to failed if trigger failed
    if (jobRun) {
      await db.from("integration_job_runs").update({
        status: "failed",
        completed_at: new Date().toISOString(),
        summary: { error: result.error },
      }).eq("id", jobRun.id);
    }
    return Response.json({ error: result.error }, { status: 502 });
  }

  // Update job run with n8n execution ID
  if (jobRun) {
    await db.from("integration_job_runs").update({
      n8n_execution_id: result.executionId,
    }).eq("id", jobRun.id);
  }

  return Response.json({ success: true, executionId: result.executionId, runId: jobRun?.id });
}
