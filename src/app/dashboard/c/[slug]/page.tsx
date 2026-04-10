import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
 Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CreateItemDialog } from "@/components/item-form-dialog";
import { ItemRowActions } from "@/components/item-row-actions";
import { ExportButtons } from "@/components/export-buttons";
import { ImportDialog } from "@/components/import-dialog";
import { FileCellDownload } from "@/components/file-cell-download";
import { ArrowLeft, ChevronRight, Database, Box } from "lucide-react";
import { getChildCollections } from "@/app/actions/relations";
import Link from "next/link";
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

export default async function CollectionItemsPage({
 params,
 searchParams,
}: {
 params: Promise<{ slug: string }>;
 searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
 const { slug } = await params;
 const sp = await searchParams;
 const user = await getUser();
 if (!user) notFound();

 const supabase = await createClient();
 const tenantId = await resolveTenant(user.id);
 if (!tenantId) notFound();

 // Fetch collection + fields
 const { data: collection } = (await supabase
 .from("collections")
 .select("*, collection_fields(*)")
 .eq("slug", slug)
 .eq("is_hidden", false)
 .maybeSingle()) as { data: Collection | null };

 if (!collection) notFound();

 const formLayout = (collection.metadata?.form_layout ?? null) as FormLayout | null;

 // Check permissions via RLS helper functions
 const [canCreateResult, canUpdateResult, canDeleteResult, canExportResult, canImportResult] = await Promise.all([
 supabase.rpc("has_permission", { p_resource_type: "collection", p_resource_id: collection.id, p_permission: "create" }),
 supabase.rpc("has_permission", { p_resource_type: "collection", p_resource_id: collection.id, p_permission: "update" }),
 supabase.rpc("has_permission", { p_resource_type: "collection", p_resource_id: collection.id, p_permission: "delete" }),
 supabase.rpc("has_permission", { p_resource_type: "collection", p_resource_id: collection.id, p_permission: "export" }),
 supabase.rpc("has_permission", { p_resource_type: "collection", p_resource_id: collection.id, p_permission: "import" }),
 ]);

 const canCreate = !!canCreateResult.data;
 const canUpdate = !!canUpdateResult.data;
 const canDelete = !!canDeleteResult.data;
 const canExport = !!canExportResult.data;
 const canImport = !!canImportResult.data;
 const canWrite = canCreate || canUpdate || canDelete;

 const fields = [...(collection.collection_fields ?? [])].sort((a, b) => a.sort_order - b.sort_order);
 const gridFields = fields.filter((f) => f.show_in_grid === true);

 // Build dynamic grid config
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
 const dirLabel = ascending ? "asc" : "desc" as const;

 // Fetch content catalog items for select/multiselect fields
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

 // Fetch items (paginated, with JSONB sort support)
 const isSystem = collection.type === "system";
 const isFieldSort = sortCol !== "created_at" && sortCol !== "updated_at";

 let items: Item[] | null = null;
 let count: number | null = null;

 if (isFieldSort) {
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

 const { data: tenantLanguages } = await getTenantLanguages(supabase, tenantId);
 const timezone = await resolveTimezone(user.id, tenantId);

 const cookieStore = await cookies();
 const currentLocale = cookieStore.get(LANG_COOKIE)?.value ?? "en";

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

 const totalItems = count ?? 0;
 const totalPages = Math.ceil(totalItems / PAGE_SIZE);
 const Icon = isSystem ? Database : Box;

 // Check if this collection has child collections (for drill-down links)
 const { data: childCollections } = await getChildCollections(collection.id);
 const hasChildren = (childCollections?.length ?? 0) > 0;

 return (
 <div className="space-y-6 p-6">
 {/* Collection header */}
 <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
 <div className="flex items-start gap-3">
 <div className="mt-0.5 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 p-2">
 <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
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
 <code className="text-xs text-gray-500 dark:text-gray-400">{collection.slug}</code>
 </div>
 </div>

 <div className="flex items-center gap-2 flex-wrap">
 {canExport && (
 <ExportButtons collectionSlug={collection.slug} collectionName={collection.name} />
 )}
 {canImport && !!(collection.metadata as Record<string, unknown> | null)?.allow_import && (
 <ImportDialog
 fields={gridFields.map((f) => ({ slug: f.slug, name: f.name, field_type: f.field_type, is_required: f.is_required }))}
 collectionSlug={collection.slug}
 />
 )}
 {canCreate && (
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

 {/* Table */}
 <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
 <CardContent className="p-0">
 {(items?.length ?? 0) === 0 ? (
 <div className="flex flex-col items-center justify-center py-16 text-center">
 <p className="text-gray-500 dark:text-gray-400 text-sm">No items yet.</p>
 {canCreate && (
 <p className="text-blue-500 dark:text-blue-400/40 text-xs mt-1">Click &ldquo;Add Item&rdquo; to create the first record.</p>
 )}
 </div>
 ) : (
 <div className="overflow-x-auto">
 <Table>
 <TableHeader>
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
  basePath={`/dashboard/c/${slug}`}
 />
 ) : (
 <TableHead key={f.id} className="text-gray-500 dark:text-gray-400 whitespace-nowrap">{getFieldLabel(f, currentLocale)}</TableHead>
 )
 )}
 {(canUpdate || canDelete) && <TableHead className="w-10" />}
 {hasChildren && <TableHead className="w-8" />}
 </TableRow>
 </TableHeader>
 <TableBody>
 {(items as Item[]).map((item, index) => (
 <TableRow key={item.id} className={`border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${hasChildren ? "cursor-pointer" : ""}`}>
 <TableCell className="text-gray-500 dark:text-gray-400 text-xs">
 {hasChildren ? (
 <Link href={`/dashboard/c/${slug}/${item.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
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
 <TableCell key={f.id} className="text-sm max-w-[160px] text-gray-900 dark:text-gray-100">
 {f.field_type === "file" && cellValue ? (
 <FileCellDownload path={String(cellValue)} />
 ) : (
 <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
 {renderCellValue(f.field_type, cellValue, f.options, catalogItems, timezone)}
 </span>
 )}
 </TableCell>
 );
 })}
 {(canUpdate || canDelete) && (
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
 <Link href={`/dashboard/c/${slug}/${item.id}`} className="inline-flex items-center text-gray-400 hover:text-blue-600 transition-colors" title="View details">
 <ChevronRight className="h-4 w-4" />
 </Link>
 </TableCell>
 )}
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 )}
 </CardContent>
 </Card>

 {/* Pagination */}
 <TablePagination
 currentPage={page}
 totalPages={totalPages}
 totalItems={totalItems}
 basePath={`/dashboard/c/${slug}`}
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
 timezone = "Asia/Singapore"
): string {
 if (value === null || value === undefined || value === "") return "—";
 switch (fieldType) {
 case "boolean": return value ? "Yes" : "No";
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
 case "json": return JSON.stringify(value).slice(0, 60);
 default: return String(value).slice(0, 80);
 }
}