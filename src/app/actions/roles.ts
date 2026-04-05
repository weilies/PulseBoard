"use server";

import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { isSuperAdminUser } from "@/lib/services/permissions.service";
import { revalidatePath } from "next/cache";
import * as RolesService from "@/lib/services/roles.service";
import { logUserMgmtEvent } from "@/lib/audit";

async function getContext() {
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");
  const supabase = await createClient();
  const tenantId = await resolveTenant(user.id);
  if (!tenantId) throw new Error("No active tenant");
  return { user, supabase, tenantId };
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export async function createRole(formData: FormData) {
  try {
    const { user, supabase, tenantId } = await getContext();
    const name = (formData.get("name") as string)?.trim();
    const description = (formData.get("description") as string)?.trim() || null;
    if (!name) return { error: "Name is required" };

    const result = await RolesService.createRole(supabase, { tenantId, name, description, userId: user.id });
    if (result.error) return { error: result.error };

    await logUserMgmtEvent({
      tenantId,
      actorId:     user.id,
      targetType:  "role",
      targetId:    result.data!.id,
      targetLabel: result.data!.name,
      action:      "role.created",
      newData:     { name: result.data!.name, slug: result.data!.slug },
    });

    revalidatePath("/dashboard/roles");
    return { data: result.data };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function updateRole(formData: FormData) {
  try {
    const { user, supabase, tenantId } = await getContext();
    const roleId = formData.get("role_id") as string;
    const name = (formData.get("name") as string)?.trim();
    const description = (formData.get("description") as string)?.trim() || null;
    if (!roleId || !name) return { error: "Role ID and name are required" };

    const { data: current } = await supabase
      .from("roles")
      .select("name")
      .eq("id", roleId)
      .single();

    const result = await RolesService.updateRole(supabase, { roleId, name, description });
    if (result.error) return { error: result.error };

    await logUserMgmtEvent({
      tenantId,
      actorId:     user.id,
      targetType:  "role",
      targetId:    roleId,
      targetLabel: name,
      action:      "role.updated",
      oldData:     current ? { name: current.name } : undefined,
      newData:     { name },
    });

    revalidatePath("/dashboard/roles");
    return { data: result.data };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function deleteRole(formData: FormData) {
  try {
    const { user, supabase, tenantId } = await getContext();
    const roleId = formData.get("role_id") as string;
    if (!roleId) return { error: "Role ID is required" };

    const { data: current } = await supabase
      .from("roles")
      .select("name")
      .eq("id", roleId)
      .single();

    const result = await RolesService.deleteRole(supabase, roleId);
    if (result.error) return { error: result.error };

    await logUserMgmtEvent({
      tenantId,
      actorId:     user.id,
      targetType:  "role",
      targetId:    roleId,
      targetLabel: current?.name ?? roleId,
      action:      "role.deleted",
      oldData:     current ? { name: current.name } : undefined,
    });

    revalidatePath("/dashboard/roles");
    return { data: true };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function assignPolicyToRole(formData: FormData) {
  try {
    const { user, supabase, tenantId } = await getContext();
    const roleId = formData.get("role_id") as string;
    const policyId = formData.get("policy_id") as string;
    if (!roleId || !policyId) return { error: "Role ID and policy ID are required" };

    const [{ data: role }, { data: policy }] = await Promise.all([
      supabase.from("roles").select("name").eq("id", roleId).single(),
      supabase.from("policies").select("name").eq("id", policyId).single(),
    ]);

    const result = await RolesService.assignPolicyToRole(supabase, { roleId, policyId });
    if (result.error) return { error: result.error };

    await logUserMgmtEvent({
      tenantId,
      actorId:     user.id,
      targetType:  "role",
      targetId:    roleId,
      targetLabel: role?.name ?? roleId,
      action:      "role.policy_assigned",
      newData:     { role_name: role?.name, policy_name: policy?.name },
    });

    revalidatePath("/dashboard/roles");
    return { data: true };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function removePolicyFromRole(formData: FormData) {
  try {
    const { user, supabase, tenantId } = await getContext();
    const roleId = formData.get("role_id") as string;
    const policyId = formData.get("policy_id") as string;
    if (!roleId || !policyId) return { error: "Role ID and policy ID are required" };

    const [{ data: role }, { data: policy }] = await Promise.all([
      supabase.from("roles").select("name").eq("id", roleId).single(),
      supabase.from("policies").select("name").eq("id", policyId).single(),
    ]);

    const result = await RolesService.removePolicyFromRole(supabase, { roleId, policyId });
    if (result.error) return { error: result.error };

    await logUserMgmtEvent({
      tenantId,
      actorId:     user.id,
      targetType:  "role",
      targetId:    roleId,
      targetLabel: role?.name ?? roleId,
      action:      "role.policy_removed",
      oldData:     { role_name: role?.name, policy_name: policy?.name },
    });

    revalidatePath("/dashboard/roles");
    return { data: true };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

export async function createPolicy(formData: FormData) {
  try {
    const { user, supabase, tenantId } = await getContext();
    const name = (formData.get("name") as string)?.trim();
    const description = (formData.get("description") as string)?.trim() || null;
    const permissionsRaw = formData.get("permissions") as string;
    if (!name) return { error: "Name is required" };

    let permissions: Array<{ resource_type: "page" | "collection"; resource_id: string; permissions: Record<string, boolean> }> = [];
    try { permissions = permissionsRaw ? JSON.parse(permissionsRaw) : []; }
    catch { return { error: "Invalid permissions format" }; }

    const result = await RolesService.createPolicy(supabase, { tenantId, name, description, userId: user.id, permissions });
    if (result.error) return { error: result.error };

    await logUserMgmtEvent({
      tenantId,
      actorId:     user.id,
      targetType:  "policy",
      targetId:    result.data!.id,
      targetLabel: name,
      action:      "policy.created",
      newData:     { name },
    });

    revalidatePath("/dashboard/roles");
    return { data: result.data };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function updatePolicyPermissions(formData: FormData) {
  try {
    const { user, supabase, tenantId } = await getContext();
    const policyId = formData.get("policy_id") as string;
    const permissionsRaw = formData.get("permissions") as string;
    if (!policyId) return { error: "Policy ID is required" };

    // Check if this is a system policy
    const { data: policy } = await supabase
      .from("policies")
      .select("name, is_system")
      .eq("id", policyId)
      .single();

    if (policy?.is_system) {
      const [isSuper, { data: tenantInfo }] = await Promise.all([
        isSuperAdminUser(supabase),
        supabase.from("tenants").select("is_super").eq("id", tenantId).single(),
      ]);
      if (!isSuper || !tenantInfo?.is_super) {
        return { error: "Only super admins in the super tenant can edit system policies" };
      }
    }

    let permissions: Array<{ resource_type: "page" | "collection"; resource_id: string; permissions: Record<string, boolean>; conditions?: unknown[] }> = [];
    try { permissions = permissionsRaw ? JSON.parse(permissionsRaw) : []; }
    catch { return { error: "Invalid permissions format" }; }

    // Capture current permissions before overwrite for audit diff
    const { data: oldPerms } = await supabase
      .from("policy_permissions")
      .select("resource_type, resource_id, permissions")
      .eq("policy_id", policyId);

    const result = await RolesService.updatePolicyPermissions(supabase, { policyId, permissions });
    if (result.error) return { error: result.error };

    await logUserMgmtEvent({
      tenantId,
      actorId:     user.id,
      targetType:  "policy",
      targetId:    policyId,
      targetLabel: policy?.name ?? policyId,
      action:      "policy.updated",
      oldData:     { name: policy?.name, permissions: oldPerms ?? [] },
      newData:     { name: policy?.name, permissions },
    });

    revalidatePath("/dashboard/roles");
    return { data: true };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function deletePolicy(formData: FormData) {
  try {
    const { user, supabase, tenantId } = await getContext();
    const policyId = formData.get("policy_id") as string;
    if (!policyId) return { error: "Policy ID is required" };

    const { data: policy } = await supabase
      .from("policies")
      .select("name")
      .eq("id", policyId)
      .single();

    const result = await RolesService.deletePolicy(supabase, policyId);
    if (result.error) return { error: result.error };

    await logUserMgmtEvent({
      tenantId,
      actorId:     user.id,
      targetType:  "policy",
      targetId:    policyId,
      targetLabel: policy?.name ?? policyId,
      action:      "policy.deleted",
      oldData:     policy ? { name: policy.name } : undefined,
    });

    revalidatePath("/dashboard/roles");
    return { data: true };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}
