import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export async function getRoles(supabase: SupabaseClient, tenantId: string) {
  const { data, error } = await supabase
    .from("roles")
    .select("id, name, slug, description, is_system, created_at")
    .eq("tenant_id", tenantId)
    .order("is_system", { ascending: false })
    .order("name");
  if (error) return { error: error.message };
  return { data: data ?? [] };
}

export async function createRole(
  supabase: SupabaseClient,
  params: { tenantId: string; name: string; description?: string | null; userId: string }
) {
  const { tenantId, name, description = null, userId } = params;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  // Check slug uniqueness
  const { data: existing } = await supabase
    .from("roles")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("slug", slug)
    .maybeSingle();
  if (existing) return { error: `A role with slug "${slug}" already exists` };

  const { data, error } = await supabase
    .from("roles")
    .insert({ tenant_id: tenantId, name, slug, description, is_system: false, created_by: userId })
    .select("id, name, slug")
    .single();
  if (error) return { error: error.message };
  return { data };
}

export async function updateRole(
  supabase: SupabaseClient,
  params: { roleId: string; name: string; description?: string | null }
) {
  const { roleId, name, description = null } = params;
  const { data, error } = await supabase
    .from("roles")
    .update({ name, description, updated_at: new Date().toISOString() })
    .eq("id", roleId)
    .eq("is_system", false) // cannot edit system roles
    .select("id")
    .single();
  if (error) return { error: error.message };
  if (!data) return { error: "Role not found or is a system role (cannot be edited)" };
  return { data };
}

export async function deleteRole(supabase: SupabaseClient, roleId: string) {
  // Check no users are currently assigned to this role
  const { data: users } = await supabase
    .from("tenant_users")
    .select("id")
    .eq("role_id", roleId)
    .limit(1);
  if (users && users.length > 0) {
    return { error: "Cannot delete role — users are still assigned to it. Reassign users first." };
  }

  const { error } = await supabase
    .from("roles")
    .delete()
    .eq("id", roleId)
    .eq("is_system", false);
  if (error) return { error: error.message };
  return { data: true };
}

// ---------------------------------------------------------------------------
// Role ↔ Policy assignments
// ---------------------------------------------------------------------------

export async function assignPolicyToRole(
  supabase: SupabaseClient,
  params: { roleId: string; policyId: string }
) {
  const { roleId, policyId } = params;
  const { error } = await supabase
    .from("role_policies")
    .insert({ role_id: roleId, policy_id: policyId });
  if (error) return { error: error.message };
  return { data: true };
}

export async function removePolicyFromRole(
  supabase: SupabaseClient,
  params: { roleId: string; policyId: string }
) {
  const { roleId, policyId } = params;
  const { error } = await supabase
    .from("role_policies")
    .delete()
    .eq("role_id", roleId)
    .eq("policy_id", policyId);
  if (error) return { error: error.message };
  return { data: true };
}

export async function getRoleWithPolicies(supabase: SupabaseClient, roleId: string) {
  const { data, error } = await supabase
    .from("roles")
    .select(`
      id, name, slug, description, is_system,
      role_policies(
        policy:policies(
          id, name, description, is_system,
          policy_permissions(resource_type, resource_id, permissions)
        )
      )
    `)
    .eq("id", roleId)
    .single();
  if (error) return { error: error.message };
  return { data };
}

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

export async function getPolicies(supabase: SupabaseClient, tenantId: string) {
  const { data, error } = await supabase
    .from("policies")
    .select(`
      id, name, description, is_system,
      policy_permissions(resource_type, resource_id, permissions)
    `)
    .or(`is_system.eq.true,tenant_id.eq.${tenantId}`)
    .order("is_system", { ascending: false })
    .order("name");
  if (error) return { error: error.message };
  return { data: data ?? [] };
}

export async function createPolicy(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    name: string;
    description?: string | null;
    userId: string;
    permissions: Array<{
      resource_type: "page" | "collection";
      resource_id: string;
      permissions: Record<string, boolean>;
    }>;
  }
) {
  const { tenantId, name, description = null, userId, permissions } = params;

  const { data: policy, error: policyError } = await supabase
    .from("policies")
    .insert({ tenant_id: tenantId, name, description, is_system: false, created_by: userId })
    .select("id")
    .single();
  if (policyError) return { error: policyError.message };

  if (permissions.length > 0) {
    const { error: permError } = await supabase
      .from("policy_permissions")
      .insert(permissions.map((p) => ({ ...p, policy_id: policy.id })));
    if (permError) return { error: permError.message };
  }

  return { data: policy };
}

export async function updatePolicyPermissions(
  supabase: SupabaseClient,
  params: {
    policyId: string;
    permissions: Array<{
      resource_type: "page" | "collection";
      resource_id: string;
      permissions: Record<string, boolean>;
    }>;
  }
) {
  const { policyId, permissions } = params;

  // Delete existing permissions and re-insert
  await supabase.from("policy_permissions").delete().eq("policy_id", policyId);

  if (permissions.length > 0) {
    const { error } = await supabase
      .from("policy_permissions")
      .insert(permissions.map((p) => ({ ...p, policy_id: policyId })));
    if (error) return { error: error.message };
  }

  return { data: true };
}

export async function deletePolicy(supabase: SupabaseClient, policyId: string) {
  const { error } = await supabase
    .from("policies")
    .delete()
    .eq("id", policyId)
    .eq("is_system", false);
  if (error) return { error: error.message };
  return { data: true };
}
