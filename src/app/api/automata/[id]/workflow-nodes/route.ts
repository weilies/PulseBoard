import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkflow } from "@/lib/services/n8n.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: installedAppId } = await params;

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

  // Check view_definition access policy
  const policy = (install.access_policy ?? {}) as { view_definition?: string[] };
  const allowedRoles: string[] = policy.view_definition ?? [];
  const { data: isSuper } = await supabase.rpc("is_super_admin");

  if (!isSuper && allowedRoles.length > 0 && !allowedRoles.includes(membership.role_id ?? "")) {
    return Response.json({ error: "Access denied: insufficient role for workflow view" }, { status: 403 });
  }

  if (!install.n8n_workflow_id) {
    return Response.json({ nodes: [], note: "No n8n workflow linked to this app." });
  }

  const result = await getWorkflow(install.n8n_workflow_id);
  if ("error" in result) return Response.json({ error: result.error }, { status: 502 });

  return Response.json(result);
}
