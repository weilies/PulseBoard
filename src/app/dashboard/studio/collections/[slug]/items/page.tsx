import { createClient } from "@/lib/supabase/server";
import { getUser, getUserRole } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { Badge } from "@/components/ui/badge";
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from "@/components/ui/table";
import { CreateItemDialog } from "@/components/item-form-dialog";
import { ItemRowActions } from "@/components/item-row-actions";
import { FileCellDownload } from "@/components/file-cell-download";
import { ExportButtons } from "@/components/export-buttons";
import { ImportDialog } from "@/components/import-dialog";
import {
 ArrowLeft,
 ChevronRight,
 Database,
 Layers,
} from "lucide-react";
import Link from "next/link";
import { getChildCollections } from "@/app/actions/relations";
import type { Field, CatalogItems } from "@/components/item-form-dialog";
import type { FormLayout } from "@/types/form-layout";
import { getTenantLanguages } from "@/lib/services/translations.service";
import { getFieldLabel, getCollectionName } from "@/lib/i18n";
import { LANG_COOKIE } from "@/lib/constants";
import { resolveTimezone, formatDatetime, formatDate } from "@/lib/timezone";
import { PAGE_SIZE, buildGridParams, type GridConfig } from "@/lib/data-grid";
import { SortableHead } from "@/components/sortable-head";
import { TablePagination } from "@/components/table-pagination";

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

export default async function ItemsPage({
 params,
 searchParams,
}: {
 params: Promise<{ slug: string }>;
 searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
 const { slug } = await params;
 const sp = await searchParams;
 // Load collection first so we can build dynamic sort config
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

 const { data: collection } = (await supabase
 .from("collections")
 .select("*, collection_fields(*)")
 .eq("slug", slug)
 .maybeSingle()) as { data: Collection | null };

 if (!collection) notFound();

 const formLayout = (collection.metadata?.form_layout ?? null) as FormLayout | null;

 const fields = [...(collection.collection_fields ?? [])].sort(
 (a, b) => a.sort_order - b.sort_order
 );
 const gridFields = fields.filter((f) => f.show_in_grid === true);

 // Build dynamic grid config: system columns + sortable field columns
 const SORTABLE_FIELD_TYPES = new Set(["text", "number", "date", "datetime", "select", "boolean"]);
 const fieldSortable = fields
  .filter((f) => SORTABLE_FIELD_TYPES.has(f.field_type))
  .map((f) => ({
   field: f.slug,
   defaultDir: (["date", "datetime"].includes(f.field_type) ? "desc" : "asc") as "asc" | "desc",
  }));

 const gridConfig: GridConfig = {
  sortable: [
   { field: "created_at", defaultDir: "desc" },
   { field: "updated_at", defaultDir: "desc" },
   ...fieldSortable,
  ],
 };
 const { page, sortCol, ascending } = buildGridParams(sp as Record<string, string | string[] | undefined>, gridConfig);
 const dirLabel = ascending ? "asc" : "desc";

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
 (catalog.content_catalog_items as {
 value: string;
 label: string;
 sort_order: number;
 }[]) ?? []
 ).sort((a, b) => a.sort_order - b.sort_order);
 }
 }

 const isSystem = collection.type === "system";
 const isFieldSort = sortCol !== "created_at" && sortCol !== "updated_at";

 let items: Item[] | null = null;
 let count: number | null = null;

 if (isFieldSort) {
  // Use RPC for JSONB field sorting
  const { data: rpcResult } = await supabase.rpc("get_collection_items_sorted", {
   p_collection_id: collection.id,
   p_tenant_id: tenantId,
   p_sort_field: sortCol,
   p_sort_ascending: ascending,
   p_offset: (page - 1) * PAGE_SIZE,
   p_limit: PAGE_SIZE,
  });
  if (rpcResult && rpcResult.length > 0) {
   count = Number(rpcResult[0].total_count);
   items = rpcResult.map((r: { id: string; data: Record<string, unknown>; created_at: string; updated_at: string }) => ({
    id: r.id, data: r.data, created_at: r.created_at, updated_at: r.updated_at,
   }));
  } else {
   items = [];
   count = 0;
  }
 } else {
  const { data, count: c } = await supabase
   .from("collection_items")
   .select("id, data, created_at, updated_at", { count: "exact" })
   .eq("collection_id", collection.id)
   .eq("tenant_id", tenantId)
   .order(sortCol, { ascending })
   .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  items = data;
  count = c;
 }

 // Fetch tenant languages for the locale tab UI in EditItemDialog
 const { data: tenantLanguages } = await getTenantLanguages(supabase, tenantId);

 const cookieStore = await cookies();
 const currentLocale = cookieStore.get(LANG_COOKIE)?.value ?? "en";
 const timezone = await resolveTimezone(user.id, tenantId);

 // Bulk-fetch translations for translatable fields in the current locale
 const translatableFieldSlugs = fields.filter((f) => f.is_translatable).map((f) => f.slug);
 const itemIds = (items ?? []).map((i: Item) => i.id);
 let translationsMap: Record<string, Record<string, string>> = {};

 if (currentLocale !== "en" && translatableFieldSlugs.length > 0 && itemIds.length > 0) {
 const { data: translations } = await supabase
 .from("collection_item_translations")
 .select("item_id, field_slug, value")
 .in("item_id", itemIds)
 .eq("language_code", currentLocale)
 .in("field_slug", translatableFieldSlugs);

 for (const t of translations ?? []) {
 if (!translationsMap[t.item_id]) translationsMap[t.item_id] = {};
 if (t.value) translationsMap[t.item_id][t.field_slug] = t.value;
 }
 }


 // Resolve relation field values: UUID -> display label
 const relationFields = fields.filter(
  (f) => f.field_type === 'relation' && (f.options?.relation_type as string) !== 'm2m'
 );
 const relatedLabels: Record<string, Record<string, string>> = {};

 if (relationFields.length > 0 && (items?.length ?? 0) > 0) {
  const idsToFetch: Record<string, Set<string>> = {};
  for (const field of relationFields) {
   const relColId = field.options?.related_collection_id as string | undefined;
   if (!relColId) continue;
   if (!idsToFetch[relColId]) idsToFetch[relColId] = new Set();
   for (const item of items as Item[]) {
    const val = item.data?.[field.slug];
    if (val && typeof val === 'string') idsToFetch[relColId].add(val);
   }
  }

  // Look up collection types so we know which need tenant scoping
  const relColIds = Object.keys(idsToFetch);
  const { data: relColTypes } = await supabase
   .from('collections')
   .select('id, type')
   .in('id', relColIds);
  const relColTypeMap: Record<string, string> = {};
  for (const rc of relColTypes ?? []) relColTypeMap[rc.id] = rc.type;

  const fetchedData: Record<string, Record<string, Record<string, unknown>>> = {};
  await Promise.all(
   Object.entries(idsToFetch).map(async ([colId, ids]) => {
    if (ids.size === 0) return;
    const q = supabase
     .from('collection_items')
     .select('id, data')
     .eq("collection_id", colId)
     .eq("tenant_id", tenantId)
     .in("id", [...ids]);
    const { data: relItems } = await q;
    fetchedData[colId] = {};
    for (const ri of relItems ?? []) {
     fetchedData[colId][ri.id] = ri.data as Record<string, unknown>;
    }
   })
  );

  const LABEL_KEYS = ['name', 'title', 'label', 'full_name', 'display_name', 'code', 'slug'];
  function deriveRelatedLabel(data: Record<string, unknown>, id: string, displayField?: string): string {
   if (displayField && data[displayField]) return String(data[displayField]).slice(0, 80);
   for (const key of LABEL_KEYS) {
    const val = data[key];
    if (val && typeof val === 'string' && val.trim()) return val.trim();
   }
   for (const val of Object.values(data)) {
    if (val && typeof val === 'string' && val.trim()) return val.trim().slice(0, 60);
   }
   return id.slice(0, 8);
  }

  for (const field of relationFields) {
   const relColId = field.options?.related_collection_id as string | undefined;
   if (!relColId || !fetchedData[relColId]) continue;
   const displayField = field.options?.display_field as string | undefined;
   relatedLabels[field.slug] = {};
   for (const [itemId, data] of Object.entries(fetchedData[relColId])) {
    relatedLabels[field.slug][itemId] = deriveRelatedLabel(data, itemId, displayField);
   }
  }
 }
 const totalItems = count ?? 0;
 const totalPages = Math.ceil(totalItems / PAGE_SIZE);

 // For tenant collections: always writable (RLS enforces tenant scope).
 // For system collections: check if the user has policy-granted create permission.
 let canWrite: boolean;
 if (isSuperAdmin) {
   canWrite = true;
 } else if (!isSystem) {
   canWrite = true;
 } else {
   const { data: writableIds } = await supabase.rpc("get_accessible_collection_ids", { p_permission: "create" });
   canWrite = ((writableIds as string[]) ?? []).includes(collection.id);
 }

 // Check if this collection has child collections (for drill-down links)
 const { data: childCollections } = await getChildCollections(collection.id);
 const hasChildren = (childCollections?.length ?? 0) > 0;

 return (
 <div className="p-6 space-y-6 max-w-6xl">
 {/* Back nav */}
 <Link
 href={isSystem ? "/dashboard/studio/system-collections" : "/dashboard/studio/tenant-collections"}
 className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 dark:text-blue-400 transition-colors"
 >
 <ArrowLeft className="h-3.5 w-3.5" />
 {isSystem ? "Back to System Collections" : "Back to Tenant Collections"}
 </Link>

 {/* Header */}
 <div className="flex items-center justify-between flex-wrap gap-3">
 <div className="flex items-center gap-3">
 <div className="rounded-md border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 p-2">
 {isSystem ? (
 <Database className="h-4 w-4 text-blue-600 dark:text-blue-400" />
 ) : (
 <Layers className="h-4 w-4 text-blue-600 dark:text-blue-400" />
 )}
 </div>
 <div>
 <div className="flex items-center gap-2">
 <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
 {getCollectionName(collection, currentLocale)}
 </h1>
 <Badge
 variant="outline"
 className={isSystem
 ? "border-blue-500/40 text-blue-600 dark:text-blue-400 text-xs"
 : "border-violet-500/40 text-violet-400 text-xs"}
 >
 {isSystem ? "System" : "Tenant"}
 </Badge>
 </div>
 <code className="text-xs text-gray-500 dark:text-gray-400 font-mono">{collection.slug}</code>
 </div>
 </div>

 <div className="flex items-center gap-2 flex-wrap">
 <ExportButtons collectionSlug={collection.slug} collectionName={collection.name} />
 {canWrite && !!(collection.metadata as Record<string, unknown> | null)?.allow_import && (
 <ImportDialog
 fields={gridFields.map((f) => ({
 slug: f.slug,
 name: f.name,
 field_type: f.field_type,
 is_required: f.is_required,
 }))}
 collectionSlug={collection.slug}
 />
 )}
 {canWrite && (
 <CreateItemDialog
 fields={fields}
 collectionId={collection.id}
 collectionSlug={collection.slug}
 catalogItems={catalogItems}
 timezone={timezone}
 formLayout={formLayout}
 />
 )}
 </div>
 </div>

 {/* Tab bar */}
 <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700">
 <Link
 href={`/dashboard/studio/collections/${slug}/schema`}
 className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 dark:text-blue-400 transition-colors"
 >
 Schema
 </Link>
 <Link
 href={`/dashboard/studio/collections/${slug}/items`}
 className="px-4 py-2 text-sm text-blue-600 dark:text-blue-400 border-b-2 border-blue-400 font-medium"
 >
 Items
 </Link>
 <Link
 href={`/dashboard/studio/collections/${slug}/settings`}
 className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
 >
 Settings
 </Link>
 <Link
 href={`/dashboard/studio/collections/${slug}/form`}
 className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
 >
 Layout
 </Link>
 <Link
 href={`/dashboard/studio/collections/${slug}/rules`}
 className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
 >
 Rules
 </Link>
 </div>

 {/* Table */}
 <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden overflow-x-auto">
 <Table className="min-w-full">
 <TableHeader className="bg-gray-100 dark:bg-gray-800">
 <TableRow className="border-gray-200 dark:border-gray-700 hover:bg-transparent">
 <TableHead className="w-10 text-gray-500 dark:text-gray-400">#</TableHead>
 {gridFields.map((f) =>
 SORTABLE_FIELD_TYPES.has(f.field_type) ? (
 <SortableHead
  key={f.id}
  label={getFieldLabel(f, currentLocale)}
  field={f.slug}
  currentSort={sortCol}
  currentDir={dirLabel}
  basePath={`/dashboard/studio/collections/${slug}/items`}
 />
 ) : (
 <TableHead key={f.id} className="text-gray-500 dark:text-gray-400 whitespace-nowrap">{getFieldLabel(f, currentLocale)}</TableHead>
 )
 )}
 <SortableHead
 label="Created"
 field="created_at"
 currentSort={sortCol}
 currentDir={dirLabel}
 basePath={`/dashboard/studio/collections/${slug}/items`}
 />
 {canWrite && <TableHead className="w-10" />}
 {hasChildren && <TableHead className="w-8" />}
 </TableRow>
 </TableHeader>
 <TableBody>
 {(items?.length ?? 0) === 0 ? (
 <TableRow>
 <TableCell colSpan={gridFields.length + (canWrite ? 3 : 2) + (hasChildren ? 1 : 0)} className="text-center text-gray-500 dark:text-gray-400 py-10 bg-white dark:bg-gray-900">
 No items yet. {canWrite ? "Click \"Add Item\" to create the first record." : ""}
 </TableCell>
 </TableRow>
 ) : (
 (items as Item[]).map((item, index) => (
 <TableRow
 key={item.id}
 className={`border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${index % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800/50"} ${hasChildren ? "cursor-pointer" : ""}`}
 >
 <TableCell className="text-gray-500 dark:text-gray-400 text-xs">
 {hasChildren ? (
 <Link href={`/dashboard/studio/collections/${slug}/items/${item.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
 {(page - 1) * PAGE_SIZE + index + 1}
 </Link>
 ) : (
 (page - 1) * PAGE_SIZE + index + 1
 )}
 </TableCell>
 {gridFields.map((f) => {
 const cellValue = (f.is_translatable && translationsMap[item.id]?.[f.slug])
 ? translationsMap[item.id][f.slug]
 : item.data?.[f.slug];
 return (
 <TableCell key={f.id} className="text-gray-900 dark:text-gray-100 text-sm max-w-[160px]">
 {f.field_type === "file" && cellValue ? (
 <FileCellDownload path={String(cellValue)} />
 ) : (
 <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
 {renderCellValue(f.field_type, cellValue, f.options, catalogItems, timezone, relatedLabels[f.slug])}
 </span>
 )}
 </TableCell>
 );
 })}
 <TableCell className="text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
 {formatDate(item.created_at)}
 </TableCell>
 {canWrite && (
 <TableCell>
 <ItemRowActions
 item={{ id: item.id, data: item.data ?? {} }}
 fields={fields}
 collectionId={collection.id}
 collectionSlug={collection.slug}
 catalogItems={catalogItems}
 tenantLanguages={tenantLanguages ?? []}
 currentLocale={currentLocale}
 timezone={timezone}
 formLayout={formLayout}
 />
 </TableCell>
 )}
 {hasChildren && (
 <TableCell className="text-right">
 <Link href={`/dashboard/studio/collections/${slug}/items/${item.id}`} className="inline-flex items-center text-gray-400 hover:text-blue-600 transition-colors" title="View details">
 <ChevronRight className="h-4 w-4" />
 </Link>
 </TableCell>
 )}
 </TableRow>
 ))
 )}
 </TableBody>
 </Table>
</div>

 {/* Pagination */}
 <TablePagination
 currentPage={page}
 totalPages={totalPages}
 totalItems={totalItems}
 basePath={`/dashboard/studio/collections/${slug}/items`}
 sortCol={sortCol}
 ascending={ascending}
 />
 </div>
 );
}

function renderCellValue(
 fieldType: string,
 value: unknown,
 options: Record<string, unknown>,
 catalogItems: CatalogItems,
 timezone = "Asia/Singapore",
 relatedItemLabels?: Record<string, string>
): string {
 if (value === null || value === undefined || value === "") return "—";

 switch (fieldType) {
 case "boolean":
 return value ? "Yes" : "No";
 case "date":
 return formatDate(value as string);
 case "datetime":
 return formatDatetime(value as string, timezone);
 case "select": {
 const listSlug = options?.catalog_slug as string | undefined;
 if (listSlug && catalogItems[listSlug]) {
 const found = catalogItems[listSlug].find((i) => i.value === value);
 return found?.label ?? String(value);
 }
 return String(value);
 }
 case "multiselect": {
 const arr = Array.isArray(value) ? value : [value];
 const listSlug = options?.catalog_slug as string | undefined;
 if (listSlug && catalogItems[listSlug]) {
 return arr.map((v) => {
 const found = catalogItems[listSlug].find((i) => i.value === v);
 return found?.label ?? String(v);
 }).join(", ");
 }
 return (arr as string[]).join(", ");
 }
 case "file": {
 // Extract the original filename from the storage path
 // Path format: {tenant_id}/{collection_slug}/{field_slug}/{uuid}-{filename} or just {uuid}.ext
 const path = String(value);
 const parts = path.split("/");
 return parts[parts.length - 1] || path;
 }
 case "relation": {
  if (!value) return "—";
  const id = String(value);
  return relatedItemLabels?.[id] ?? id.slice(0, 8);
 }
 case "json":
 return JSON.stringify(value).slice(0, 60);
 default:
 return String(value).slice(0, 80);
 }
}