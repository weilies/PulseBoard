"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getUser, getUserRole } from "@/lib/auth";
import { getCurrentTenantId } from "@/lib/tenant";
import { randomBytes, createHash } from "crypto";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a prefixed random ID: pb_app_<16 hex chars> */
function generateAppId(): string {
  return `pb_app_${randomBytes(8).toString("hex")}`;
}

/** Generate a prefixed random secret: pb_sec_<32 hex chars> */
function generateAppSecret(): string {
  return `pb_sec_${randomBytes(16).toString("hex")}`;
}

/** SHA-256 hash of a secret */
function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

async function requireAdmin() {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" as const };

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { error: "No active tenant" as const };

  const role = await getUserRole(user.id, tenantId);
  if (!role || !["super_admin", "tenant_admin"].includes(role)) {
    return { error: "Insufficient permissions" as const };
  }

  return { user, tenantId, role };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function getApps() {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error, data: [] };

  const db = createAdminClient();
  const { data, error } = await db
    .from("tenant_apps")
    .select("id, app_name, app_id, is_active, created_at, last_used_at, expires_at")
    .eq("tenant_id", auth.tenantId)
    .order("created_at", { ascending: false });

  if (error) return { error: error.message, data: [] };
  return { data: data ?? [] };
}

export async function createApp(formData: FormData) {
  const appName = formData.get("appName") as string;
  if (!appName?.trim()) return { error: "App name is required" };

  const expiresAt = formData.get("expiresAt") as string | null;

  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };

  const appId = generateAppId();
  const appSecret = generateAppSecret();
  const secretHash = hashSecret(appSecret);

  const db = createAdminClient();
  const { error } = await db.from("tenant_apps").insert({
    tenant_id: auth.tenantId,
    app_name: appName.trim(),
    app_id: appId,
    app_secret_hash: secretHash,
    created_by: auth.user.id,
    expires_at: expiresAt || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard/apps");

  // Return the secret — this is the ONLY time it's visible
  return { appId, appSecret };
}

export async function rotateAppSecret(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return { error: "App ID is required" };

  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };

  const newSecret = generateAppSecret();
  const secretHash = hashSecret(newSecret);

  const db = createAdminClient();
  const { error } = await db
    .from("tenant_apps")
    .update({ app_secret_hash: secretHash })
    .eq("id", id)
    .eq("tenant_id", auth.tenantId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/apps");

  // Return the new secret — only time it's visible
  return { appSecret: newSecret };
}

export async function toggleApp(formData: FormData) {
  const id = formData.get("id") as string;
  const isActive = formData.get("isActive") === "true";
  if (!id) return { error: "App ID is required" };

  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };

  const db = createAdminClient();
  const { error } = await db
    .from("tenant_apps")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("tenant_id", auth.tenantId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/apps");
  return {};
}

export async function deleteApp(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return { error: "App ID is required" };

  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };

  const db = createAdminClient();
  const { error } = await db
    .from("tenant_apps")
    .delete()
    .eq("id", id)
    .eq("tenant_id", auth.tenantId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/apps");
  return {};
}
