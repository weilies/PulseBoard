"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { revalidatePath } from "next/cache";

export type RbacCondition = {
  field: string;
  op: "eq" | "neq" | "lt" | "lte" | "gt" | "gte" | "in" | "not_in";
  val: unknown;  // literal, or "user.id", "user.<attr>"
};

export type CollectionRolePolicy = {
  id: string;
  tenant_id: string;
  collection_id: string;
  role_id: string;
  policy_name: string;
  actions: string[];
  conditions: RbacCondition[];
  visible_fields: string[] | null;
  created_at: string;
  updated_at: string;
};

export type PolicyWithRole = CollectionRolePolicy & {
  role: { id: string; name: string; slug: string };
};

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getCollectionPolicies(
  collectionId: string
): Promise<{ data?: PolicyWithRole[]; error?: string }> {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  const tenantId = await resolveTenant(user.id);
  if (!tenantId) return { error: "Tenant not found" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collection_role_policies")
    .select("*, role:roles(id, name, slug)")
    .eq("collection_id", collectionId)
    .eq("tenant_id", tenantId)          // strict tenant isolation
    .order("created_at", { ascending: true });

  if (error) return { error: error.message };
  return { data: (data ?? []) as PolicyWithRole[] };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createCollectionPolicy(formData: FormData): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  const tenantId = await resolveTenant(user.id);
  if (!tenantId) return { error: "Tenant not found" };

  const collectionId = formData.get("collection_id") as string;
  const roleId = formData.get("role_id") as string;
  const policyName = formData.get("policy_name") as string;
  const actionsRaw = formData.get("actions") as string;
  const conditionsRaw = formData.get("conditions") as string;
  const visibleFieldsRaw = formData.get("visible_fields") as string;

  if (!collectionId || !roleId || !policyName) {
    return { error: "collection_id, role_id and policy_name are required" };
  }

  let actions: string[];
  let conditions: RbacCondition[];
  let visibleFields: string[] | null;

  try {
    actions = JSON.parse(actionsRaw || '["read","create","update","delete"]');
    conditions = JSON.parse(conditionsRaw || "[]");
    visibleFields = visibleFieldsRaw ? JSON.parse(visibleFieldsRaw) : null;
  } catch {
    return { error: "Invalid JSON in actions, conditions, or visible_fields" };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("collection_role_policies").insert({
    tenant_id: tenantId,
    collection_id: collectionId,
    role_id: roleId,
    policy_name: policyName,
    actions,
    conditions,
    visible_fields: visibleFields,
    created_by: user.id,
  });

  if (error) return { error: error.message };

  // Audit log
  await admin.from("rbac_audit_log").insert({
    tenant_id: tenantId,
    event_type: "policy.created",
    user_id: user.id,
    collection_id: collectionId,
    role_id: roleId,
    action: null,
    was_allowed: null,
    details: { policy_name: policyName, actions, conditions },
  });

  revalidatePath(`/dashboard/studio/collections`);
  return {};
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateCollectionPolicy(formData: FormData): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  const tenantId = await resolveTenant(user.id);
  if (!tenantId) return { error: "Tenant not found" };

  const policyId = formData.get("policy_id") as string;
  const policyName = formData.get("policy_name") as string;
  const actionsRaw = formData.get("actions") as string;
  const conditionsRaw = formData.get("conditions") as string;
  const visibleFieldsRaw = formData.get("visible_fields") as string;

  if (!policyId) return { error: "policy_id is required" };

  let actions: string[];
  let conditions: RbacCondition[];
  let visibleFields: string[] | null;

  try {
    actions = JSON.parse(actionsRaw || '["read","create","update","delete"]');
    conditions = JSON.parse(conditionsRaw || "[]");
    visibleFields = visibleFieldsRaw ? JSON.parse(visibleFieldsRaw) : null;
  } catch {
    return { error: "Invalid JSON in actions, conditions, or visible_fields" };
  }

  const admin = createAdminClient();
  const { data: existing, error: fetchErr } = await admin
    .from("collection_role_policies")
    .select("collection_id, role_id")
    .eq("id", policyId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (fetchErr || !existing) return { error: "Policy not found" };

  const { error } = await admin
    .from("collection_role_policies")
    .update({ policy_name: policyName, actions, conditions, visible_fields: visibleFields, updated_at: new Date().toISOString() })
    .eq("id", policyId)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };

  await admin.from("rbac_audit_log").insert({
    tenant_id: tenantId,
    event_type: "policy.updated",
    user_id: user.id,
    collection_id: existing.collection_id,
    role_id: existing.role_id,
    policy_id: policyId,
    action: null,
    was_allowed: null,
    details: { policy_name: policyName, actions, conditions },
  });

  revalidatePath(`/dashboard/studio/collections`);
  return {};
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteCollectionPolicy(policyId: string): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  const tenantId = await resolveTenant(user.id);
  if (!tenantId) return { error: "Tenant not found" };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("collection_role_policies")
    .select("collection_id, role_id, policy_name")
    .eq("id", policyId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!existing) return { error: "Policy not found" };

  const { error } = await admin
    .from("collection_role_policies")
    .delete()
    .eq("id", policyId)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };

  await admin.from("rbac_audit_log").insert({
    tenant_id: tenantId,
    event_type: "policy.deleted",
    user_id: user.id,
    collection_id: existing.collection_id,
    role_id: existing.role_id,
    action: null,
    was_allowed: null,
    details: { policy_name: existing.policy_name },
  });

  revalidatePath(`/dashboard/studio/collections`);
  return {};
}

// ---------------------------------------------------------------------------
// Fetch roles for the tenant (for the policy editor dropdown)
// ---------------------------------------------------------------------------

export async function getTenantRoles(
  tenantId: string
): Promise<{ data?: { id: string; name: string; slug: string }[]; error?: string }> {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("roles")
    .select("id, name, slug")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });

  if (error) return { error: error.message };
  return { data: data ?? [] };
}

// ---------------------------------------------------------------------------
// Fetch field slugs for a collection (for condition builder field dropdown)
// ---------------------------------------------------------------------------

export async function getCollectionFieldSlugs(
  collectionId: string
): Promise<{ data?: { slug: string; name: string; field_type: string }[]; error?: string }> {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collection_fields")
    .select("slug, name, field_type")
    .eq("collection_id", collectionId)
    .order("sort_order", { ascending: true });

  if (error) return { error: error.message };
  return { data: data ?? [] };
}
