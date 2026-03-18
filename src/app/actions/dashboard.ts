"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth";
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
  if (!tenantId) return { error: "Tenant ID is required" };

  const supabase = await createClient();
  return TenantsService.updateTenant(supabase, { tenantId, name, slug, contactName, contactEmail, timezone });
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
// Users — still using role text column (will switch to role_id in Phase 3)
// ---------------------------------------------------------------------------

export async function createUser(formData: FormData) {
  const email = formData.get("email") as string;
  const fullName = formData.get("fullName") as string;
  const password = formData.get("password") as string;
  const tenantId = formData.get("tenantId") as string;
  const role = formData.get("role") as string;

  if (!email || !fullName || !password || !tenantId || !role) {
    return { error: "All fields are required" };
  }

  // Phase 3: switch to role_id-based insertion
  const admin = createAdminClient();

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (authError) return { error: authError.message };

  const { error: assignError } = await admin.from("tenant_users").insert([
    { tenant_id: tenantId, user_id: authData.user.id, role, is_active: true, is_default: false },
  ]);
  if (assignError) return { error: `User created but tenant assignment failed: ${assignError.message}` };

  // Clean up auto-assigned super tenant if needed
  const { data: superTenant } = await admin.from("tenants").select("id").eq("slug", "bipo").single();
  if (superTenant && superTenant.id !== tenantId) {
    await admin.from("tenant_users").delete().eq("user_id", authData.user.id).eq("tenant_id", superTenant.id);
  }

  return { data: authData };
}

export async function updateUserProfile(formData: FormData) {
  const userId = formData.get("userId") as string;
  const fullName = formData.get("fullName") as string;
  if (!userId || !fullName) return { error: "User ID and full name are required" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", userId);
  if (error) return { error: error.message };
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

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase
    .from("profiles").select("id").eq("email", email).single();
  if (userError || !userData) return { error: "User not found" };

  const { data, error } = await supabase.from("tenant_users").insert([
    { user_id: userData.id, tenant_id: tenantId, role, is_active: true },
  ]);
  if (error) return { error: error.message };
  return { data };
}

export async function updateUserRole(formData: FormData) {
  const userId = formData.get("userId") as string;
  const tenantId = formData.get("tenantId") as string;
  const role = formData.get("role") as string;
  if (!userId || !tenantId || !role) return { error: "All fields are required" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenant_users")
    .update({ role })
    .eq("user_id", userId)
    .eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  return { data };
}

export async function updateUserStatus(formData: FormData) {
  const userId = formData.get("userId") as string;
  const tenantId = formData.get("tenantId") as string;
  const status = formData.get("status") as string;
  if (!userId || !tenantId || !status) return { error: "All fields are required" };
  if (!["active", "inactive", "suspended"].includes(status)) return { error: "Invalid status" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenant_users")
    .update({ status })
    .eq("user_id", userId)
    .eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  return { data };
}

export async function removeUserFromTenant(formData: FormData) {
  const userId = formData.get("userId") as string;
  const tenantId = formData.get("tenantId") as string;
  if (!userId || !tenantId) return { error: "User ID and tenant ID are required" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenant_users")
    .delete()
    .eq("user_id", userId)
    .eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  return { data };
}

export async function deleteUser(formData: FormData) {
  const userId = formData.get("userId") as string;
  if (!userId) return { error: "User ID is required" };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };
  return { data };
}
