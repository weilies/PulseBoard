import { createClient } from "@/lib/supabase/server";
import { getUser, getUserRole } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { ArrowLeft, Database, Layers, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getChildCollections } from "@/app/actions/relations";
import { getFieldLabel, getCollectionName } from "@/lib/i18n";
import { LANG_COOKIE } from "@/lib/constants";
import { resolveTimezone, formatDatetime, formatDate } from "@/lib/timezone";
import { ChildCollectionTabs } from "@/components/child-collection-tabs";
import { ParentItemHeader } from "@/components/parent-item-header";
import type { Field, CatalogItems } from "@/components/item-form-dialog";
import type { ParentRecordLayout } from "@/types/parent-record-layout";
import { getTenantLanguages } from "@/lib/services/translations.service";

type Collection = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: string;
  metadata: Record<string, unknown> | null;
  collection_fields: Field[];
};

type Item = {
  id: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export default async function ItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ child_tab?: string; child_page?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;

  const user = await getUser();
  if (!user) notFound();
  const tenantId = await resolveTenant(user.id);
  if (!tenantId) notFound();

  const supabase = await createClient();

  const role = await getUserRole(user.id, tenantId);
  const { data: currentTenant } = await supabase
    .from("tenants")
    .select("is_super")
    .eq("id", tenantId)
    .maybeSingle();
  const isSuperAdmin = role === "super_admin" && (currentTenant?.is_super === true);

  // Fetch collection + fields
  const { data: collection } = (await supabase
    .from("collections")
    .select("id, slug, name, description, type, metadata, collection_fields(*)")
    .eq("slug", slug)
    .maybeSingle()) as { data: Collection | null };

  if (!collection) notFound();

  const fields = [...(collection.collection_fields ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order
  );

  // Fetch the item — always scope to current tenant (system collections share schema, data is per-tenant)
  const isSystem = collection.type === "system";
  const itemQuery = supabase
    .from("collection_items")
    .select("id, data, created_at, updated_at")
    .eq("id", id)
    .eq("collection_id", collection.id)
    .eq("tenant_id", tenantId);

  const { data: item } = (await itemQuery.maybeSingle()) as { data: Item | null };
  if (!item) notFound();

  // Resolve catalog items for display
  const catalogSlugs = fields
    .filter((f) => f.options?.catalog_slug)
    .map((f) => f.options.catalog_slug as string);

  const catalogItems: CatalogItems = {};
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

  // Resolve relation field labels for display
  const relationFields = fields.filter(
    (f) => f.field_type === "relation" && (f.options?.relation_type as string) !== "m2m"
  );
  const relatedLabels: Record<string, Record<string, string>> = {};

  if (relationFields.length > 0) {
    const idsToFetch: Record<string, Set<string>> = {};
    for (const field of relationFields) {
      const relColId = field.options?.related_collection_id as string | undefined;
      if (!relColId) continue;
      if (!idsToFetch[relColId]) idsToFetch[relColId] = new Set();
      const val = item.data?.[field.slug];
      if (val && typeof val === "string") idsToFetch[relColId].add(val);
    }

    const LABEL_KEYS = ["name", "title", "label", "full_name", "display_name", "code", "slug"];
    function deriveLabel(data: Record<string, unknown>, itemId: string): string {
      for (const key of LABEL_KEYS) {
        const val = data[key];
        if (val && typeof val === "string" && val.trim()) return val.trim();
      }
      for (const val of Object.values(data)) {
        if (val && typeof val === "string" && val.trim()) return val.trim().slice(0, 60);
      }
      return itemId.slice(0, 8);
    }

    await Promise.all(
      Object.entries(idsToFetch).map(async ([colId, ids]) => {
        if (ids.size === 0) return;
        const { data: relItems } = await supabase
          .from("collection_items")
          .select("id, data")
          .eq("collection_id", colId)
          .in("id", [...ids]);

        for (const ri of relItems ?? []) {
          for (const field of relationFields) {
            if ((field.options?.related_collection_id as string) !== colId) continue;
            if (!relatedLabels[field.slug]) relatedLabels[field.slug] = {};
            relatedLabels[field.slug][ri.id] = deriveLabel(ri.data as Record<string, unknown>, ri.id);
          }
        }
      })
    );
  }

  // Fetch child collections
  const { data: childCollections } = await getChildCollections(collection.id);

  // Resolve child tab counts
  const childCounts: Record<string, number> = {};
  if (childCollections && childCollections.length > 0) {
    await Promise.all(
      childCollections.map(async (child) => {
        const { count } = await supabase
          .from("collection_items")
          .select("id", { count: "exact", head: true })
          .eq("collection_id", child.id)
          .eq(`data->>${child.fieldSlug}`, id);
        childCounts[child.slug] = count ?? 0;
      })
    );
  }

  const cookieStore = await cookies();
  const currentLocale = cookieStore.get(LANG_COOKIE)?.value ?? "en";
  const timezone = await resolveTimezone(user.id, tenantId);
  // Permission checks: which collections can the user read/create?
  let canWrite: boolean;
  let readableSet = new Set<string>();
  let creatableSet = new Set<string>();
  if (isSuperAdmin) {
    canWrite = true;
  } else {
    const [{ data: readIds }, { data: createIds }] = await Promise.all([
      supabase.rpc("get_accessible_collection_ids", { p_permission: "read" }),
      supabase.rpc("get_accessible_collection_ids", { p_permission: "create" }),
    ]);
    readableSet = new Set<string>((readIds as string[]) ?? []);
    creatableSet = new Set<string>((createIds as string[]) ?? []);
    canWrite = creatableSet.has(collection.id);
  }

  // Fetch tenant languages for edit dialogs
  const { data: tenantLanguages } = await getTenantLanguages(supabase, tenantId);

  // Determine display key
  const metadata = (collection.metadata ?? {}) as Record<string, unknown>;
  const displayKeyFields = (metadata.display_key_fields ?? []) as string[];

  // Build display title from display key fields or first text field
  let displayTitle = "";
  if (displayKeyFields.length > 0) {
    displayTitle = displayKeyFields
      .map((slug) => item.data[slug])
      .filter(Boolean)
      .map(String)
      .join(" · ");
  }
  if (!displayTitle) {
    // Fallback: use first text field value or first non-empty value
    for (const f of fields) {
      if (f.field_type === "text" && item.data[f.slug]) {
        displayTitle = String(item.data[f.slug]);
        break;
      }
    }
  }
  if (!displayTitle) {
    displayTitle = id.slice(0, 8);
  }

  // Active child tab
  const activeChildTab = sp.child_tab ?? childCollections?.[0]?.slug ?? null;
  const childPage = Math.max(1, parseInt(sp.child_page ?? "1"));

  // Fetch child items for active tab
  let activeChildItems: Item[] = [];
  let activeChildTotal = 0;
  let activeChildFields: Field[] = [];
  let activeChildCatalogItems: CatalogItems = {};
  let activeChildRelatedLabels: Record<string, Record<string, string>> = {};
  const activeChild = childCollections?.find((c) => c.slug === activeChildTab);
  const CHILD_PAGE_SIZE = 10;

  if (activeChild) {
    // Fetch child collection fields
    const { data: childFieldsData } = await supabase
      .from("collection_fields")
      .select("id, slug, name, field_type, options, is_required, is_translatable, sort_order")
      .eq("collection_id", activeChild.id)
      .order("sort_order", { ascending: true });

    activeChildFields = (childFieldsData ?? []) as Field[];

    // Fetch child items filtered by parent — always scope to current tenant
    const childQuery = supabase
      .from("collection_items")
      .select("id, data, created_at, updated_at", { count: "exact" })
      .eq("collection_id", activeChild.id)
      .eq(`data->>${activeChild.fieldSlug}`, id)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range((childPage - 1) * CHILD_PAGE_SIZE, childPage * CHILD_PAGE_SIZE - 1);

    const { data: childItems, count: childCount } = await childQuery;
    activeChildItems = (childItems ?? []) as Item[];
    activeChildTotal = childCount ?? 0;

    // Resolve catalogs for child fields
    const childCatalogSlugs = activeChildFields
      .filter((f) => f.options?.catalog_slug)
      .map((f) => f.options.catalog_slug as string);

    if (childCatalogSlugs.length > 0) {
      const { data: catalogs } = await supabase
        .from("content_catalogs")
        .select("slug, content_catalog_items(value, label, sort_order)")
        .in("slug", childCatalogSlugs);

      for (const catalog of catalogs ?? []) {
        activeChildCatalogItems[catalog.slug] = (
          (catalog.content_catalog_items as { value: string; label: string; sort_order: number }[]) ?? []
        ).sort((a, b) => a.sort_order - b.sort_order);
      }
    }

    // Resolve relation field labels for child items
    const childRelationFields = activeChildFields.filter(
      (f) => f.field_type === "relation" && (f.options?.relation_type as string) !== "m2m"
    );
    if (childRelationFields.length > 0 && activeChildItems.length > 0) {
      const LABEL_KEYS = ["name", "title", "label", "full_name", "display_name", "code", "slug"];
      function deriveChildLabel(data: Record<string, unknown>, itemId: string): string {
        for (const key of LABEL_KEYS) {
          const v = data[key];
          if (v && typeof v === "string" && v.trim()) return v.trim();
        }
        for (const v of Object.values(data)) {
          if (v && typeof v === "string" && v.trim()) return v.trim().slice(0, 60);
        }
        return itemId.slice(0, 8);
      }

      const idsToFetch: Record<string, Set<string>> = {};
      for (const field of childRelationFields) {
        const relColId = field.options?.related_collection_id as string | undefined;
        if (!relColId) continue;
        if (!idsToFetch[relColId]) idsToFetch[relColId] = new Set();
        for (const ci of activeChildItems) {
          const val = ci.data?.[field.slug];
          if (val && typeof val === "string") idsToFetch[relColId].add(val);
        }
      }

      await Promise.all(
        Object.entries(idsToFetch).map(async ([colId, ids]) => {
          if (ids.size === 0) return;
          const { data: relItems } = await supabase
            .from("collection_items")
            .select("id, data")
            .eq("collection_id", colId)
            .in("id", [...ids]);
          for (const ri of relItems ?? []) {
            for (const field of childRelationFields) {
              if ((field.options?.related_collection_id as string) !== colId) continue;
              if (!activeChildRelatedLabels[field.slug]) activeChildRelatedLabels[field.slug] = {};
              activeChildRelatedLabels[field.slug][ri.id] = deriveChildLabel(ri.data as Record<string, unknown>, ri.id);
            }
          }
        })
      );
    }
  }

  // Effective date info for child
  const activeChildEffectiveDateField = activeChild
    ? (activeChild.metadata?.effective_date_field as string | undefined)
    : undefined;

  // Determine which child collections have grandchildren (for expand/collapse chevrons)
  const childHasGrandchildren: Record<string, boolean> = {};
  if (activeChild) {
    const { data: gcCollections } = await getChildCollections(activeChild.id);
    childHasGrandchildren[activeChild.slug] = (gcCollections && gcCollections.length > 0) || false;
  }

  // Filter child collections by read permission; compute per-child write permission
  const accessibleChildren = isSuperAdmin
    ? (childCollections ?? [])
    : (childCollections ?? []).filter((c) => readableSet.has(c.id));
  const childCanWriteMap: Record<string, boolean> = {};
  for (const child of accessibleChildren) {
    childCanWriteMap[child.slug] = isSuperAdmin || creatableSet.has(child.id);
  }

  // Extract parent record layout from metadata
  const parentRecordLayout = (collection.metadata?.parent_record_layout ?? null) as ParentRecordLayout | null;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Back nav */}
      <Link
        href={`/dashboard/studio/collections/${slug}/items`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to {getCollectionName(collection, currentLocale)}
      </Link>

      {/* Parent item header */}
      <ParentItemHeader
        item={item}
        fields={fields}
        displayTitle={displayTitle}
        collectionSlug={slug}
        collectionId={collection.id}
        collectionType={collection.type}
        catalogItems={catalogItems}
        relatedLabels={relatedLabels}
        timezone={timezone}
        currentLocale={currentLocale}
        canWrite={canWrite}
        tenantLanguages={tenantLanguages ?? []}
        displayKeyFields={displayKeyFields}
        parentLayout={parentRecordLayout}
      />

      {/* Child collection tabs — filtered by read permission */}
      {accessibleChildren.length > 0 && (
        <ChildCollectionTabs
          parentItemId={id}
          parentCollectionSlug={slug}
          childCollections={accessibleChildren}
          childCounts={childCounts}
          activeTab={activeChildTab}
          activeChildItems={activeChildItems}
          activeChildTotal={activeChildTotal}
          activeChildFields={activeChildFields}
          activeChildCatalogItems={activeChildCatalogItems}
          activeChildRelatedLabels={activeChildRelatedLabels}
          activeChild={activeChild ?? null}
          childPage={childPage}
          childPageSize={CHILD_PAGE_SIZE}
          canWrite={canWrite}
          childCanWriteMap={childCanWriteMap}
          timezone={timezone}
          currentLocale={currentLocale}
          tenantLanguages={tenantLanguages ?? []}
          effectiveDateField={activeChildEffectiveDateField}
          hasGrandchildren={childHasGrandchildren[activeChild?.slug ?? ""] ?? false}
        />
      )}

      {/* Item metadata */}
      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">
        <span>Created: {formatDatetime(item.created_at, timezone)}</span>
        <span>Updated: {formatDatetime(item.updated_at, timezone)}</span>
        <span className="font-mono text-gray-400">{item.id}</span>
      </div>
    </div>
  );
}
