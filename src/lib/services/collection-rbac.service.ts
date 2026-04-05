/**
 * Collection Item-Level RBAC Enforcement Service
 *
 * STRICT MODE (deny-by-default):
 *   - A collection_role_policies row MUST exist for the user's role+collection.
 *   - If no policy exists → access denied (403 / empty list).
 *   - Super admins are exempt and bypass all item-level policies.
 *   - App credential auth is exempt (deferred to marketplace phase).
 *
 * When a policy exists:
 *   - Items that do NOT satisfy ALL conditions are filtered out of reads.
 *   - The `actions` array determines which CRUD operations are allowed.
 *   - The `visible_fields` array (if set) strips unlisted fields from the response.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type RbacCondition = {
  field: string;
  op: "eq" | "neq" | "lt" | "lte" | "gt" | "gte" | "in" | "not_in";
  val: unknown;
};

export type CollectionPolicy = {
  id: string;
  actions: string[];
  conditions: RbacCondition[];
  visible_fields: string[] | null;
};

// ---------------------------------------------------------------------------
// Resolve the active policy for a user in a collection
// ---------------------------------------------------------------------------

/**
 * Returns true if the user is a super_admin in the given tenant —
 * super admins bypass all item-level RBAC checks entirely.
 */
export async function isExemptFromItemPolicy(
  db: SupabaseClient,
  userId: string,
  tenantId: string
): Promise<boolean> {
  const { data: tu } = await db
    .from("tenant_users")
    .select("role_id")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();

  if (!tu?.role_id) return false;

  const { data: role } = await db
    .from("roles")
    .select("slug")
    .eq("id", tu.role_id)
    .maybeSingle();

  // super_admin (Next Novas) and tenant_admin (holds Tenant Management policy) are both exempt
  return role?.slug === "super_admin" || role?.slug === "tenant_admin";
}

export async function resolveItemPolicy(
  db: SupabaseClient,
  collectionId: string,
  tenantId: string,
  userId: string
): Promise<CollectionPolicy | null> {
  // Get user's role_id in this tenant
  const { data: tu } = await db
    .from("tenant_users")
    .select("role_id")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();

  if (!tu?.role_id) return null;

  // Get all policy IDs linked to this role
  const { data: rolePolicies } = await db
    .from("role_policies")
    .select("policy_id")
    .eq("role_id", tu.role_id);

  const policyIds = (rolePolicies ?? []).map((rp) => rp.policy_id as string);
  if (policyIds.length === 0) return null;

  // Find a policy_permissions row for this collection across the role's policies
  const { data: permRow } = await db
    .from("policy_permissions")
    .select("permissions, conditions")
    .in("policy_id", policyIds)
    .eq("resource_type", "collection")
    .eq("resource_id", collectionId)
    .maybeSingle();

  if (!permRow) return null;

  // Build CollectionPolicy from policy_permissions flags
  const perms = (permRow.permissions ?? {}) as Record<string, boolean>;
  const actions: string[] = [];
  for (const action of ["read", "create", "update", "delete"] as const) {
    if (perms[action]) actions.push(action);
  }

  return {
    id: `pp:${collectionId}`,
    actions,
    conditions: ((permRow.conditions ?? []) as RbacCondition[]),
    visible_fields: null,
  };
}

// ---------------------------------------------------------------------------
// Resolve user attributes used in dynamic conditions
// ---------------------------------------------------------------------------

type UserCtx = {
  id: string;
  [key: string]: unknown;
};

async function resolveUserCtx(
  db: SupabaseClient,
  userId: string,
  tenantId: string
): Promise<UserCtx> {
  // Base: user id always available
  const ctx: UserCtx = { id: userId };

  // Attempt to load user_attributes from tenant_users (if the column exists in future)
  // For now extend this when user profile collections are available
  const { data: tu } = await db
    .from("tenant_users")
    .select("*")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (tu) {
    // Spread any extra jsonb attributes stored on the tenant_users row
    const attrs = (tu.user_attributes ?? {}) as Record<string, unknown>;
    Object.assign(ctx, attrs);
  }

  return ctx;
}

// ---------------------------------------------------------------------------
// Evaluate a single condition against an item
// ---------------------------------------------------------------------------

function resolveVal(val: unknown, userCtx: UserCtx): unknown {
  if (typeof val === "string" && val.startsWith("user.")) {
    const attr = val.slice(5); // strip "user."
    return userCtx[attr] ?? null;
  }
  return val;
}

function evalCondition(
  condition: RbacCondition,
  itemData: Record<string, unknown>,
  item: { id: string; created_by?: string | null },
  userCtx: UserCtx
): boolean {
  // "created_by" is a top-level column, not inside data
  const rawRecordVal =
    condition.field === "created_by"
      ? item.created_by
      : (itemData[condition.field] ?? null);

  const compareVal = resolveVal(condition.val, userCtx);

  switch (condition.op) {
    case "eq":    return rawRecordVal === compareVal;
    case "neq":   return rawRecordVal !== compareVal;
    case "lt":    return rawRecordVal != null && compareVal != null && (rawRecordVal as number) < (compareVal as number);
    case "lte":   return rawRecordVal != null && compareVal != null && (rawRecordVal as number) <= (compareVal as number);
    case "gt":    return rawRecordVal != null && compareVal != null && (rawRecordVal as number) > (compareVal as number);
    case "gte":   return rawRecordVal != null && compareVal != null && (rawRecordVal as number) >= (compareVal as number);
    case "in": {
      const arr = Array.isArray(compareVal) ? compareVal : [];
      return arr.includes(rawRecordVal);
    }
    case "not_in": {
      const arr = Array.isArray(compareVal) ? compareVal : [];
      return !arr.includes(rawRecordVal);
    }
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Filter a list of items by conditions
// ---------------------------------------------------------------------------

export async function filterItemsByPolicy<
  T extends { id: string; data: Record<string, unknown>; created_by?: string | null }
>(
  items: T[],
  policy: CollectionPolicy,
  db: SupabaseClient,
  userId: string,
  tenantId: string
): Promise<T[]> {
  if (!policy.conditions || policy.conditions.length === 0) return items;

  const userCtx = await resolveUserCtx(db, userId, tenantId);

  return items.filter((item) =>
    policy.conditions.every((c) => evalCondition(c, item.data, item, userCtx))
  );
}

// ---------------------------------------------------------------------------
// Check if a single item passes the policy conditions
// ---------------------------------------------------------------------------

export async function itemPassesPolicy<
  T extends { id: string; data: Record<string, unknown>; created_by?: string | null }
>(
  item: T,
  policy: CollectionPolicy,
  db: SupabaseClient,
  userId: string,
  tenantId: string
): Promise<boolean> {
  if (!policy.conditions || policy.conditions.length === 0) return true;
  const userCtx = await resolveUserCtx(db, userId, tenantId);
  return policy.conditions.every((c) => evalCondition(c, item.data, item, userCtx));
}

// ---------------------------------------------------------------------------
// Check if an action is allowed by the policy
// ---------------------------------------------------------------------------

export function actionAllowedByPolicy(policy: CollectionPolicy, action: string): boolean {
  return policy.actions.includes(action);
}

// ---------------------------------------------------------------------------
// Strip fields not in visible_fields from item data
// ---------------------------------------------------------------------------

export function applyFieldVisibility<
  T extends { data: Record<string, unknown> }
>(item: T, visibleFields: string[] | null): T {
  if (!visibleFields || visibleFields.length === 0) return item;
  const filtered: Record<string, unknown> = {};
  for (const f of visibleFields) {
    if (f in item.data) filtered[f] = item.data[f];
  }
  return { ...item, data: filtered };
}

// ---------------------------------------------------------------------------
// Combined: apply full policy to a list (filter + strip fields)
// ---------------------------------------------------------------------------

export async function applyPolicyToItems<
  T extends { id: string; data: Record<string, unknown>; created_by?: string | null }
>(
  items: T[],
  policy: CollectionPolicy | null,
  db: SupabaseClient,
  userId: string,
  tenantId: string
): Promise<T[]> {
  if (!policy) return items;

  const filtered = await filterItemsByPolicy(items, policy, db, userId, tenantId);
  return filtered.map((item) => applyFieldVisibility(item, policy.visible_fields));
}
