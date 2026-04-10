"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth";
import { logUserMgmtEvent } from "@/lib/audit";
import * as TenantsService from "@/lib/services/tenants.service";

// ---------------------------------------------------------------------------
// Tenants
// ---------------------------------------------------------------------------

export async function createTenant(formData: FormData) {
  const name = formData.get("name") as string;
  const slug = formData.get("slug") as string;
  const contactName = (formData.get("contactName") as string) || undefined;
  const contactEmail = (formData.get("contactEmail") as string) || undefined;
  if (!name || !slug) return { error: "Name and slug are required" };

  const user = await getUser();
  if (!user) return { error: "User not authenticated" };

  const supabase = await createClient();
  return TenantsService.createTenant(supabase, { name, slug, userId: user.id, contactName, contactEmail });
}

export async function updateTenant(formData: FormData) {
  const tenantId = formData.get("tenantId") as string;
  const name = formData.get("name") as string;
  const slug = formData.get("slug") as string;
  const contactName = (formData.get("contactName") as string) || undefined;
  const contactEmail = (formData.get("contactEmail") as string) || undefined;
  const timezone = (formData.get("timezone") as string) || undefined;
  const feedbackMode = formData.get("feedbackMode") === "true";
  if (!tenantId) return { error: "Tenant ID is required" };

  const supabase = await createClient();
  return TenantsService.updateTenant(supabase, { tenantId, name, slug, contactName, contactEmail, timezone, feedbackMode });
}

export async function deleteTenant(formData: FormData) {
  const tenantId = formData.get("tenantId") as string;
  if (!tenantId) return { error: "Tenant ID is required" };

  const supabase = await createClient();
  return TenantsService.deleteTenant(supabase, tenantId);
}

export async function setDefaultTenant(formData: FormData) {
  const tenantId = formData.get("tenantId") as string;
  if (!tenantId) return { error: "Tenant ID is required" };

  const user = await getUser();
  if (!user) return { error: "User not authenticated" };

  const supabase = await createClient();
  return TenantsService.setDefaultTenant(supabase, { userId: user.id, tenantId });
}

// ---------------------------------------------------------------------------
// Users — role text column + role_id UUID are both kept in sync
// ---------------------------------------------------------------------------

/** Resolve a role slug to its UUID in the roles table for a given tenant. */
async function resolveRoleId(
  db: ReturnType<typeof createAdminClient>,
  tenantId: string,
  roleSlug: string,
): Promise<string | null> {
  const { data } = await db
    .from("roles")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("slug", roleSlug)
    .single();
  return data?.id ?? null;
}

export async function createUser(formData: FormData) {
  const email = formData.get("email") as string;
  const fullName = formData.get("fullName") as string;
  const password = formData.get("password") as string;
  const tenantId = formData.get("tenantId") as string;
  const role = formData.get("role") as string;

  if (!email || !fullName || !password || !tenantId || !role) {
    return { error: "All fields are required" };
  }

  const actor = await getUser();

  // Phase 3: switch to role_id-based insertion
  const admin = createAdminClient();

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (authError) return { error: authError.message };

  const roleId = await resolveRoleId(admin, tenantId, role);
  const { error: assignError } = await admin.from("tenant_users").insert([
    { tenant_id: tenantId, user_id: authData.user.id, role, role_id: roleId, is_default: false },
  ]);
  if (assignError) return { error: `User created but tenant assignment failed: ${assignError.message}` };

  // Clean up auto-assigned super tenant if needed
  const { data: superTenant } = await admin.from("tenants").select("id").eq("slug", "nextnovas").single();
  if (superTenant && superTenant.id !== tenantId) {
    await admin.from("tenant_users").delete().eq("user_id", authData.user.id).eq("tenant_id", superTenant.id);
  }

  if (actor) {
    await logUserMgmtEvent({
      tenantId,
      actorId:     actor.id,
      targetType:  "user",
      targetId:    authData.user.id,
      targetLabel: email,
      action:      "user.created",
      newData:     { email, role },
    });
  }

  return { data: authData };
}

export async function updateUserProfile(formData: FormData) {
  const userId = formData.get("userId") as string;
  const fullName = formData.get("fullName") as string;
  const tenantId = formData.get("tenantId") as string;
  if (!userId || !fullName) return { error: "User ID and full name are required" };

  const actor = await getUser();

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .single();

  const { data, error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", userId);
  if (error) return { error: error.message };

  if (actor && tenantId) {
    await logUserMgmtEvent({
      tenantId,
      actorId:    actor.id,
      targetType: "user",
      targetId:   userId,
      action:     "user.profile_updated",
      oldData:    current ? { full_name: current.full_name } : undefined,
      newData:    { full_name: fullName },
    });
  }

  return { data };
}

export async function updateUserTimezone(formData: FormData) {
  const timezone = formData.get("timezone") as string;
  if (!timezone) return { error: "Timezone is required" };

  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ timezone })
    .eq("id", user.id);
  if (error) return { error: error.message };
  return { data: true };
}

export async function assignUserToTenant(formData: FormData) {
  const email = formData.get("email") as string;
  const tenantId = formData.get("tenantId") as string;
  const role = formData.get("role") as string;
  if (!email || !tenantId || !role) return { error: "All fields are required" };

  const actor = await getUser();

  const db = createAdminClient();
  const { data: userData, error: userError } = await db
    .from("profiles").select("id").eq("email", email).single();
  if (userError || !userData) return { error: "User not found" };

  const roleId = await resolveRoleId(db, tenantId, role);
  const { data, error } = await db.from("tenant_users").upsert(
    [{ user_id: userData.id, tenant_id: tenantId, role, role_id: roleId }],
    { onConflict: "tenant_id,user_id" }
  );
  if (error) return { error: error.message };

  if (actor) {
    await logUserMgmtEvent({
      tenantId,
      actorId:     actor.id,
      targetType:  "user",
      targetId:    userData.id,
      targetLabel: email,
      action:      "user.assigned",
      newData:     { email, role },
    });
  }

  return { data };
}

export async function updateUserRole(formData: FormData) {
  const userId = formData.get("userId") as string;
  const tenantId = formData.get("tenantId") as string;
  const role = formData.get("role") as string;
  if (!userId || !tenantId || !role) return { error: "All fields are required" };

  const actor = await getUser();

  const db = createAdminClient();

  const { data: current } = await db
    .from("tenant_users")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .single();

  const roleId = await resolveRoleId(db, tenantId, role);
  const { data, error } = await db
    .from("tenant_users")
    .update({ role, role_id: roleId })
    .eq("user_id", userId)
    .eq("tenant_id", tenantId);
  if (error) return { error: error.message };

  if (actor) {
    await logUserMgmtEvent({
      tenantId,
      actorId:    actor.id,
      targetType: "user",
      targetId:   userId,
      action:     "user.role_changed",
      oldData:    current ? { role: current.role } : undefined,
      newData:    { role },
    });
  }

  return { data };
}

export async function updateUserStatus(formData: FormData) {
  const userId = formData.get("userId") as string;
  const tenantId = formData.get("tenantId") as string;
  const status = formData.get("status") as string;
  if (!userId || !tenantId || !status) return { error: "All fields are required" };
  if (!["active", "inactive", "suspended"].includes(status)) return { error: "Invalid status" };

  const actor = await getUser();

  const db = createAdminClient();
  const { data: current } = await db
    .from("tenant_users")
    .select("status")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .single();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenant_users")
    .update({ status })
    .eq("user_id", userId)
    .eq("tenant_id", tenantId);
  if (error) return { error: error.message };

  if (actor) {
    await logUserMgmtEvent({
      tenantId,
      actorId:    actor.id,
      targetType: "user",
      targetId:   userId,
      action:     "user.status_changed",
      oldData:    current ? { status: current.status } : undefined,
      newData:    { status },
    });
  }

  return { data };
}

export async function removeUserFromTenant(formData: FormData) {
  const userId = formData.get("userId") as string;
  const tenantId = formData.get("tenantId") as string;
  if (!userId || !tenantId) return { error: "User ID and tenant ID are required" };

  const actor = await getUser();

  const db = createAdminClient();
  const { data: current } = await db
    .from("tenant_users")
    .select("role, status")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .single();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenant_users")
    .delete()
    .eq("user_id", userId)
    .eq("tenant_id", tenantId);
  if (error) return { error: error.message };

  if (actor) {
    await logUserMgmtEvent({
      tenantId,
      actorId:    actor.id,
      targetType: "user",
      targetId:   userId,
      action:     "user.removed",
      oldData:    current ? { role: current.role, status: current.status } : undefined,
    });
  }

  return { data };
}

export async function deleteUser(formData: FormData) {
  const userId = formData.get("userId") as string;
  if (!userId) return { error: "User ID is required" };

  const actor = await getUser();

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();

  const { data, error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };

  if (actor) {
    await logUserMgmtEvent({
      tenantId:    (formData.get("tenantId") as string | null) ?? "",
      actorId:     actor.id,
      targetType:  "user",
      targetId:    userId,
      targetLabel: profile?.email ?? userId,
      action:      "user.deleted",
      oldData:     profile ? { email: profile.email } : undefined,
    });
  }

  return { data };
}
