"use server";

import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";

export type RelationItem = {
  id: string;
  label: string;
};

const LABEL_KEYS = ["name", "title", "label", "full_name", "display_name", "code", "slug"];

function deriveLabel(data: Record<string, unknown>, id: string): string {
  for (const key of LABEL_KEYS) {
    const val = data[key];
    if (val && typeof val === "string" && val.trim()) return val.trim();
  }
  // Fallback: first string value found
  for (const val of Object.values(data)) {
    if (val && typeof val === "string" && val.trim()) return val.trim().slice(0, 60);
  }
  return id.slice(0, 8);
}

/**
 * Fetch items from a related collection for the relation picker.
 * Returns a flat list of { id, label } — at most 200 items.
 */
export type ChildCollection = {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  fieldSlug: string;  // the child_of relation field slug on the child collection
  metadata: Record<string, unknown>;
  childTabSortOrder: number;
};

/**
 * Get all collections that have a child_of relation field pointing to the given parent collection.
 * Used to render child tabs on the parent item detail page.
 */
export async function getChildCollections(
  parentCollectionId: string
): Promise<{ data?: ChildCollection[]; error?: string }> {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();

  // Find all relation fields with relationship_style = "child_of" pointing to this collection
  const { data: relFields, error: relErr } = await supabase
    .from("collection_fields")
    .select("collection_id, slug, options")
    .eq("field_type", "relation");

  if (relErr) return { error: relErr.message };

  const childLinks: { collectionId: string; fieldSlug: string }[] = [];
  for (const f of relFields ?? []) {
    const opts = f.options as Record<string, unknown>;
    if (
      opts?.relationship_style === "child_of" &&
      opts?.related_collection_id === parentCollectionId
    ) {
      childLinks.push({ collectionId: f.collection_id, fieldSlug: f.slug });
    }
  }

  if (childLinks.length === 0) return { data: [] };

  // Fetch collection details for the child collections
  const childColIds = childLinks.map((c) => c.collectionId);
  const { data: collections, error: colErr } = await supabase
    .from("collections")
    .select("id, slug, name, icon, metadata")
    .in("id", childColIds);

  if (colErr) return { error: colErr.message };

  const fieldSlugMap = new Map(childLinks.map((c) => [c.collectionId, c.fieldSlug]));

  const result: ChildCollection[] = (collections ?? []).map((col) => {
    const meta = (col.metadata ?? {}) as Record<string, unknown>;
    return {
      id: col.id,
      slug: col.slug,
      name: col.name,
      icon: col.icon,
      fieldSlug: fieldSlugMap.get(col.id) ?? "",
      metadata: meta,
      childTabSortOrder: (meta.child_tab_sort_order as number) ?? 999,
    };
  }).sort((a, b) => a.childTabSortOrder - b.childTabSortOrder);

  return { data: result };
}

/**
 * Grandchild data returned when expanding a Level 2 row.
 * Contains one entry per grandchild collection.
 */
export type GrandchildData = {
  collection: ChildCollection;
  items: { id: string; data: Record<string, unknown>; created_at: string; updated_at: string }[];
  total: number;
  fields: {
    id: string;
    slug: string;
    name: string;
    field_type: string;
    options: Record<string, unknown>;
    is_required: boolean;
    is_translatable: boolean;
    sort_order: number;
  }[];
  catalogItems: Record<string, { value: string; label: string; sort_order: number }[]>;
  effectiveDateField?: string;
};

/**
 * Fetch grandchild (Level 3) data for a given child item.
 * Called lazily when a Level 2 row is expanded.
 * Returns all grandchild collections with up to GRANDCHILD_PAGE_SIZE items each.
 */
const GRANDCHILD_PAGE_SIZE = 5;

export async function fetchGrandchildData(
  childItemId: string,
  childCollectionId: string,
): Promise<{ data?: GrandchildData[]; error?: string }> {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  const tenantId = await resolveTenant(user.id);
  const supabase = await createClient();

  // 1. Find grandchild collections (collections with child_of pointing to this child collection)
  const { data: grandchildCollections, error: gcErr } = await getChildCollections(childCollectionId);
  if (gcErr) return { error: gcErr };
  if (!grandchildCollections || grandchildCollections.length === 0) return { data: [] };

  // 2. For each grandchild collection, fetch fields + items filtered by childItemId
  const results: GrandchildData[] = [];

  await Promise.all(
    grandchildCollections.map(async (gc) => {
      // Fetch fields
      const { data: fieldsData } = await supabase
        .from("collection_fields")
        .select("id, slug, name, field_type, options, is_required, is_translatable, sort_order")
        .eq("collection_id", gc.id)
        .order("sort_order", { ascending: true });

      const fields = (fieldsData ?? []) as GrandchildData["fields"];

      // Fetch items
      let itemsQuery = supabase
        .from("collection_items")
        .select("id, data, created_at, updated_at", { count: "exact" })
        .eq("collection_id", gc.id)
        .eq(`data->>${gc.fieldSlug}`, childItemId)
        .order("created_at", { ascending: false })
        .limit(GRANDCHILD_PAGE_SIZE);

      if (tenantId) {
        itemsQuery = itemsQuery.eq("tenant_id", tenantId);
      }

      const { data: items, count } = await itemsQuery;

      // Resolve catalog items for grandchild fields
      const catalogSlugs = fields
        .filter((f) => f.options?.catalog_slug)
        .map((f) => f.options.catalog_slug as string);

      const catalogItems: Record<string, { value: string; label: string; sort_order: number }[]> = {};
      if (catalogSlugs.length > 0) {
        const { data: catalogs } = await supabase
          .from("content_catalogs")
          .select("slug, content_catalog_items(value, label, sort_order)")
          .in("slug", catalogSlugs);

        for (const catalog of catalogs ?? []) {
          catalogItems[catalog.slug] = (
            (catalog.content_catalog_items as { value: string; label: string; sort_order: number }[]) ?? []
          ).sort((a, b) => a.sort_order - b.sort_order);
        }
      }

      const meta = gc.metadata ?? {};
      results.push({
        collection: gc,
        items: (items ?? []) as GrandchildData["items"],
        total: count ?? 0,
        fields,
        catalogItems,
        effectiveDateField: meta.effective_date_field as string | undefined,
      });
    })
  );

  // Sort by childTabSortOrder
  results.sort((a, b) => a.collection.childTabSortOrder - b.collection.childTabSortOrder);

  return { data: results };
}

/**
 * Fetch a single page of grandchild items for pagination.
 * Lightweight — does not re-fetch fields or catalog data.
 */
export async function fetchGrandchildItems(
  childItemId: string,
  gcCollectionId: string,
  gcFieldSlug: string,
  page: number,
): Promise<{ data?: { items: GrandchildData["items"]; total: number }; error?: string }> {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  const tenantId = await resolveTenant(user.id);
  const supabase = await createClient();

  let query = supabase
    .from("collection_items")
    .select("id, data, created_at, updated_at", { count: "exact" })
    .eq("collection_id", gcCollectionId)
    .eq(`data->>${gcFieldSlug}`, childItemId)
    .order("created_at", { ascending: false })
    .range((page - 1) * GRANDCHILD_PAGE_SIZE, page * GRANDCHILD_PAGE_SIZE - 1);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data: items, count, error } = await query;
  if (error) return { error: error.message };

  return {
    data: {
      items: (items ?? []) as GrandchildData["items"],
      total: count ?? 0,
    },
  };
}

export async function fetchRelationItems(
  relatedCollectionId: string
): Promise<{ data?: RelationItem[]; error?: string }> {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();
  const tenantId = await resolveTenant(user.id);

  // Resolve collection to check tenant ownership
  const { data: collection } = await supabase
    .from("collections")
    .select("id, type, tenant_id")
    .eq("id", relatedCollectionId)
    .maybeSingle();

  if (!collection) return { error: "Related collection not found" };

  let query = supabase
    .from("collection_items")
    .select("id, data")
    .eq("collection_id", relatedCollectionId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (collection.type === "tenant" && tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data: items, error } = await query;
  if (error) return { error: error.message };

  const result: RelationItem[] = (items ?? []).map((item) => ({
    id: item.id,
    label: deriveLabel(item.data as Record<string, unknown>, item.id),
  }));

  return { data: result };
}
