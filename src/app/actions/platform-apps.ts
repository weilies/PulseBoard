"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getUser, getUserRole } from "@/lib/auth";
import { resolveTenant, getCurrentTenantId } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import * as N8n from "@/lib/services/n8n.service";

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

async function requireSuperAdmin() {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" as const };
  const tenantId = await resolveTenant(user.id);
  if (!tenantId) return { error: "No active tenant" as const };
  const role = await getUserRole(user.id, tenantId);
  if (role !== "super_admin") return { error: "Insufficient permissions" as const };
  return { user, tenantId };
}

// ---------------------------------------------------------------------------
// Admin: Publish / update a platform app
// ---------------------------------------------------------------------------

export async function publishApp(
  formData: FormData
): Promise<{ error?: string; data?: { id: string } }> {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return { error: auth.error };

  const appId = formData.get("app_id") as string | null;
  const name = (formData.get("name") as string)?.trim();
  const slug = (formData.get("slug") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const icon = (formData.get("icon") as string)?.trim() || null;
  const type = (formData.get("type") as string) || "n8n_workflow";
  const visibility = (formData.get("visibility") as string) || "public";
  const version = (formData.get("version") as string)?.trim() || "1.0.0";
  const n8nTemplateWorkflowId = (formData.get("n8n_template_workflow_id") as string)?.trim() || null;
  const publish = formData.get("publish") === "true";

  if (!name || !slug) return { error: "Name and slug are required" };

  let allowedTenantIds: string[] | null = null;
  const allowedJson = formData.get("allowed_tenant_ids") as string | null;
  if (allowedJson) {
    try { allowedTenantIds = JSON.parse(allowedJson); } catch { /* ignore */ }
  }

  let configSchema: Record<string, unknown> = { fields: [] };
  const schemaJson = formData.get("config_schema") as string | null;
  if (schemaJson) {
    try { configSchema = JSON.parse(schemaJson); } catch { /* ignore */ }
  }

  const db = createAdminClient();
  const payload = {
    name, slug, description, icon, type, visibility,
    allowed_tenant_ids: visibility === "tenant_specific" ? allowedTenantIds : null,
    version,
    n8n_template_workflow_id: n8nTemplateWorkflowId,
    config_schema: configSchema,
    published_at: publish ? new Date().toISOString() : null,
    published_by: publish ? auth.user.id : null,
    updated_at: new Date().toISOString(),
  };

  if (appId) {
    const { error } = await db.from("platform_apps").update(payload).eq("id", appId);
    if (error) return { error: error.message };
    revalidatePath("/dashboard/admin/apps");
    return { data: { id: appId } };
  }

  const { data: created, error } = await db.from("platform_apps").insert(payload).select("id").single();
  if (error) return { error: error.message };
  revalidatePath("/dashboard/admin/apps");
  return { data: { id: created.id } };
}

export async function deleteApp(appId: string): Promise<{ error?: string }> {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return { error: auth.error };

  const db = createAdminClient();
  const { error } = await db.from("platform_apps").delete().eq("id", appId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/admin/apps");
  return {};
}

// ---------------------------------------------------------------------------
// Tenant: Install an app
// ---------------------------------------------------------------------------

export interface InstallCredential {
  key: string;
  n8n_credential_type: string;
  /** Credential field values — written to n8n, never stored in PulseBox */
  value: Record<string, unknown>;
}

export async function installPlatformApp(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "No tenant context" };

  const appId = formData.get("app_id") as string;
  if (!appId) return { error: "App ID required" };

  const db = createAdminClient();

  // Fetch and validate app
  const { data: app } = await db
    .from("platform_apps")
    .select("id, slug, type, visibility, allowed_tenant_ids, n8n_template_workflow_id, published_at")
    .eq("id", appId)
    .maybeSingle();

  if (!app) return { error: "App not found" };
  if (!app.published_at) return { error: "App is not published" };
  if (app.visibility === "tenant_specific") {
    const allowed = (app.allowed_tenant_ids ?? []) as string[];
    if (!allowed.includes(tenantId)) return { error: "App not available for your organization" };
  }

  // Check existing install
  const { data: existing } = await db
    .from("tenant_installed_apps")
    .select("id, enabled")
    .eq("tenant_id", tenantId)
    .eq("app_id", appId)
    .maybeSingle();

  if (existing?.enabled) return { error: "App is already installed" };

  // Parse inputs
  let config: Record<string, unknown> = {};
  const configJson = formData.get("config") as string | null;
  if (configJson) { try { config = JSON.parse(configJson); } catch { /* ignore */ } }

  let accessPolicy: Record<string, unknown> = {};
  const policyJson = formData.get("access_policy") as string | null;
  if (policyJson) { try { accessPolicy = JSON.parse(policyJson); } catch { /* ignore */ } }

  let credentials: InstallCredential[] = [];
  const credsJson = formData.get("credentials") as string | null;
  if (credsJson) { try { credentials = JSON.parse(credsJson); } catch { /* ignore */ } }

  // Clone n8n workflow
  const { data: tenant } = await db.from("tenants").select("slug").eq("id", tenantId).maybeSingle();
  const workflowName = `[${tenant?.slug ?? tenantId.slice(0, 8)}].[${app.slug}]`;

  let n8nWorkflowId: string | null = null;
  if (app.type === "n8n_workflow" && app.n8n_template_workflow_id) {
    const result = await N8n.cloneWorkflow(app.n8n_template_workflow_id, workflowName);
    if ("error" in result) return { error: `Workflow clone failed: ${result.error}` };
    n8nWorkflowId = result.id;
  }

  // Upsert install record
  let installedAppId: string;
  if (existing) {
    const { error } = await db.from("tenant_installed_apps").update({
      enabled: true, config, access_policy: accessPolicy, n8n_workflow_id: n8nWorkflowId,
    }).eq("id", existing.id);
    if (error) return { error: error.message };
    installedAppId = existing.id;
  } else {
    const { data: created, error } = await db.from("tenant_installed_apps").insert({
      tenant_id: tenantId, app_id: appId,
      installed_by_user_id: user.id,
      config, access_policy: accessPolicy,
      n8n_workflow_id: n8nWorkflowId,
      enabled: true,
    }).select("id").single();
    if (error) return { error: error.message };
    installedAppId = created.id;
  }

  // Write credentials to n8n vault, store only the n8n credential ID
  for (const cred of credentials) {
    const credName = `${workflowName}.${cred.key}`;
    const result = await N8n.createCredential(credName, cred.n8n_credential_type, cred.value);
    if ("error" in result) continue; // credential failure is non-blocking
    await db.from("tenant_app_credentials").upsert(
      {
        tenant_installed_app_id: installedAppId,
        credential_key: cred.key,
        n8n_credential_id: result.id,
        last_updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_installed_app_id,credential_key" }
    );
  }

  revalidatePath("/dashboard/studio/app-store");
  revalidatePath("/dashboard/studio/automata");
  return {};
}

// ---------------------------------------------------------------------------
// Tenant: Pause / Resume
// ---------------------------------------------------------------------------

export async function pauseInstalledApp(installedAppId: string): Promise<{ error?: string }> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "No tenant context" };

  const db = createAdminClient();
  const { data: install } = await db
    .from("tenant_installed_apps")
    .select("id, n8n_workflow_id, tenant_id")
    .eq("id", installedAppId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!install) return { error: "Install not found" };
  if (install.n8n_workflow_id) await N8n.deactivateWorkflow(install.n8n_workflow_id);

  const { error } = await db.from("tenant_installed_apps").update({ enabled: false }).eq("id", installedAppId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/studio/automata");
  return {};
}

export async function resumeInstalledApp(installedAppId: string): Promise<{ error?: string }> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "No tenant context" };

  const db = createAdminClient();
  const { data: install } = await db
    .from("tenant_installed_apps")
    .select("id, n8n_workflow_id, tenant_id")
    .eq("id", installedAppId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!install) return { error: "Install not found" };
  if (install.n8n_workflow_id) await N8n.activateWorkflow(install.n8n_workflow_id);

  const { error } = await db.from("tenant_installed_apps").update({ enabled: true }).eq("id", installedAppId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/studio/automata");
  return {};
}

// ---------------------------------------------------------------------------
// Tenant: Update config
// ---------------------------------------------------------------------------

export async function updateInstalledAppConfig(formData: FormData): Promise<{ error?: string }> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "No tenant context" };

  const installedAppId = formData.get("installed_app_id") as string;
  const configJson = formData.get("config") as string;
  if (!installedAppId || !configJson) return { error: "Missing required fields" };

  let config: Record<string, unknown>;
  try { config = JSON.parse(configJson); } catch { return { error: "Invalid config JSON" }; }

  const db = createAdminClient();
  const { error } = await db
    .from("tenant_installed_apps")
    .update({ config })
    .eq("id", installedAppId)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };
  revalidatePath("/dashboard/studio/automata");
  return {};
}

// ---------------------------------------------------------------------------
// Tenant: Update access policy
// ---------------------------------------------------------------------------

export async function updateInstalledAppAccess(formData: FormData): Promise<{ error?: string }> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "No tenant context" };

  const installedAppId = formData.get("installed_app_id") as string;
  const policyJson = formData.get("access_policy") as string;
  if (!installedAppId || !policyJson) return { error: "Missing required fields" };

  let accessPolicy: Record<string, unknown>;
  try { accessPolicy = JSON.parse(policyJson); } catch { return { error: "Invalid access policy JSON" }; }

  const db = createAdminClient();
  const { error } = await db
    .from("tenant_installed_apps")
    .update({ access_policy: accessPolicy })
    .eq("id", installedAppId)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };
  revalidatePath("/dashboard/studio/automata");
  return {};
}

// ---------------------------------------------------------------------------
// Tenant: Uninstall (deactivates workflow + hard-deletes install record)
// ---------------------------------------------------------------------------

export async function uninstallPlatformApp(installedAppId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "No tenant context" };

  const db = createAdminClient();

  const { data: install } = await db
    .from("tenant_installed_apps")
    .select("id, n8n_workflow_id, tenant_id")
    .eq("id", installedAppId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!install) return { error: "Install not found" };
  if (install.n8n_workflow_id) await N8n.deactivateWorkflow(install.n8n_workflow_id);

  const { error } = await db.from("tenant_installed_apps").delete().eq("id", installedAppId);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/studio/app-store");
  revalidatePath("/dashboard/studio/automata");
  return {};
}

// ---------------------------------------------------------------------------
// Tenant: Update a credential
// ---------------------------------------------------------------------------

export async function updateAppCredential(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "No tenant context" };

  const installedAppId = formData.get("installed_app_id") as string;
  const credentialKey = formData.get("credential_key") as string;
  const valueJson = formData.get("value") as string;

  if (!installedAppId || !credentialKey || !valueJson) return { error: "Missing required fields" };

  let value: Record<string, unknown> = {};
  try { value = JSON.parse(valueJson); } catch { return { error: "Invalid credential value" }; }

  const db = createAdminClient();

  // Verify ownership
  const { data: install } = await db
    .from("tenant_installed_apps")
    .select("id")
    .eq("id", installedAppId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!install) return { error: "Install not found" };

  const { data: cred } = await db
    .from("tenant_app_credentials")
    .select("n8n_credential_id")
    .eq("tenant_installed_app_id", installedAppId)
    .eq("credential_key", credentialKey)
    .maybeSingle();

  if (!cred) return { error: "Credential not found" };

  const result = await N8n.updateCredential(cred.n8n_credential_id, value);
  if (result.error) return { error: result.error };

  await db
    .from("tenant_app_credentials")
    .update({ last_updated_at: new Date().toISOString() })
    .eq("tenant_installed_app_id", installedAppId)
    .eq("credential_key", credentialKey);

  return {};
}
