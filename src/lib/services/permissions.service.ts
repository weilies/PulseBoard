/**
 * PermissionsService
 *
 * Uses the new has_permission(), has_page_access(), get_accessible_collection_ids(),
 * and get_accessible_pages() DB functions added in migration 00013.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type CollectionPermission =
  | "read"
  | "create"
  | "update"
  | "delete"
  | "export"
  | "import"
  | "manage_schema";

export type PagePermission = "access";

export const PAGE_SLUGS = {
  DASHBOARD: "dashboard",
  USERS: "users",
  TENANTS: "tenants",
  STUDIO_SYSTEM_COLLECTIONS: "studio.system-collections",
  STUDIO_CONTENT_CATALOG: "studio.content-catalog",
  STUDIO_TENANT_COLLECTIONS: "studio.tenant-collections",
  STUDIO_NAVIGATIONS: "studio.navigations",
  STUDIO_QUERIES: "studio.queries",
  STUDIO_LOGS: "studio.logs",
  ROLES: "roles",
  POLICIES: "policies",
  APPS: "apps",
  WEBHOOKS: "webhooks",
  STUDIO_APP_STORE: "studio.app-store",
} as const;

export type PageSlug = (typeof PAGE_SLUGS)[keyof typeof PAGE_SLUGS];

/** All page slugs as an array — used by role/policy detail pages. */
export const ALL_PAGE_SLUGS: string[] = Object.values(PAGE_SLUGS);

/** Human-readable labels for page slugs. */
export const PAGE_LABELS: Record<string, string> = {
  "dashboard": "Dashboard",
  "users": "Users",
  "tenants": "Tenants",
  "studio.system-collections": "System Collections",
  "studio.content-catalog": "Content Catalog",
  "studio.tenant-collections": "Tenant Collections",
  "studio.navigations": "Navigations",
  "studio.queries": "Query Generator",
  "studio.logs": "Activity Log",
  "roles": "Roles",
  "policies": "Policies",
  "apps": "Applications",
  "webhooks": "Webhooks",
  "studio.app-store": "App Store",
};

/** Page sections for policy editor — mirrors sidebar grouping. */
export const PAGE_SECTIONS: Array<{ section: string; pages: string[] }> = [
  { section: "General", pages: ["dashboard"] },
  {
    section: "User Management",
    pages: ["users", "roles", "policies", "tenants"],
  },
  {
    section: "Studio",
    pages: [
      "studio.system-collections",
      "studio.tenant-collections",
      "studio.content-catalog",
      "studio.navigations",
      "studio.queries",
      "studio.logs",
    ],
  },
  {
    section: "Integration",
    pages: ["apps", "webhooks", "studio.app-store"],
  },
];

/** All collection permission keys. */
export const COLLECTION_PERMS = ["read", "create", "update", "delete", "export", "import", "manage_schema"] as const;

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/** True if current user is super_admin (Next Novas platform admin). */
export async function isSuperAdminUser(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.rpc("is_super_admin");
  return !!data;
}

/** Throw if user is not super_admin. */
export async function requireSuperAdmin(supabase: SupabaseClient): Promise<void> {
  const ok = await isSuperAdminUser(supabase);
  if (!ok) throw new Error("Only super admins can perform this action");
}

/**
 * Check if current user has a specific permission on a resource
 * (calls the DB has_permission() function).
 */
export async function checkPermission(
  supabase: SupabaseClient,
  resourceType: "page" | "collection",
  resourceId: string,
  permission: string
): Promise<boolean> {
  const { data } = await supabase.rpc("has_permission", {
    p_resource_type: resourceType,
    p_resource_id: resourceId,
    p_permission: permission,
  });
  return !!data;
}

/** Check if current user has 'access' on a page. */
export async function hasPageAccess(
  supabase: SupabaseClient,
  pageSlug: string
): Promise<boolean> {
  const { data } = await supabase.rpc("has_page_access", { p_page_slug: pageSlug });
  return !!data;
}

/** Throw if user does not have page access. */
export async function requirePageAccess(
  supabase: SupabaseClient,
  pageSlug: string
): Promise<void> {
  const ok = await hasPageAccess(supabase, pageSlug);
  if (!ok) throw new Error(`Access denied to page: ${pageSlug}`);
}

/**
 * Get all page slugs accessible to the current user.
 * Used for sidebar rendering.
 */
export async function getAccessiblePages(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase.rpc("get_accessible_pages");
  return (data as string[]) ?? [];
}

/**
 * Get all collection IDs the current user can perform p_permission on.
 * Used for sidebar (read) and UI button visibility.
 */
export async function getAccessibleCollectionIds(
  supabase: SupabaseClient,
  permission: CollectionPermission
): Promise<string[]> {
  const { data } = await supabase.rpc("get_accessible_collection_ids", {
    p_permission: permission,
  });
  return (data as string[]) ?? [];
}

/**
 * Get a permission map for all collections the user can at least read.
 * Returns Map<collectionId, Set<permission>> so UI can efficiently check
 * what actions to show per collection.
 */
export async function getCollectionPermissions(
  supabase: SupabaseClient
): Promise<Map<string, Set<CollectionPermission>>> {
  const permissions: CollectionPermission[] = [
    "read", "create", "update", "delete", "export", "import", "manage_schema",
  ];

  const results = await Promise.all(
    permissions.map((p) => getAccessibleCollectionIds(supabase, p).then((ids) => ({ perm: p, ids })))
  );

  const map = new Map<string, Set<CollectionPermission>>();
  for (const { perm, ids } of results) {
    for (const id of ids) {
      if (!map.has(id)) map.set(id, new Set());
      map.get(id)!.add(perm);
    }
  }
  return map;
}

/**
 * Check if user has a specific permission on a collection.
 * Throws if not authorized.
 */
export async function requireCollectionPermission(
  supabase: SupabaseClient,
  collectionId: string,
  permission: CollectionPermission
): Promise<void> {
  const ok = await checkPermission(supabase, "collection", collectionId, permission);
  if (!ok) throw new Error(`Permission denied: ${permission} on collection`);
}
