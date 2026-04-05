import { createClient } from "@/lib/supabase/server";
import { getUser, getUserRole } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CreateCollectionDialog } from "@/components/create-collection-dialog";
import { CollectionActions } from "@/components/collection-actions";
import { Layers } from "lucide-react";
import Link from "next/link";
import { PAGE_SIZE, buildGridParams, type GridConfig } from "@/lib/data-grid";
import { SortableHead } from "@/components/sortable-head";
import { TablePagination } from "@/components/table-pagination";
import { TableFilters, type FilterColumn } from "@/components/table-filters";
import { Suspense } from "react";
import { resolveCollectionIcon } from "@/lib/icons";
import { getAccessibleCollectionIds } from "@/lib/services/permissions.service";

type Collection = {
 id: string;
 slug: string;
 name: string;
 description: string | null;
 icon: string | null;
 type: string;
 is_hidden: boolean;
 created_at: string;
 metadata: Record<string, unknown> | null;
 collection_fields: { id: string }[];
};

const gridConfig: GridConfig = {
 sortable: [
  { field: "name", defaultDir: "asc" },
  { field: "created_at", defaultDir: "desc" },
 ],
 filterable: ["name", "slug"],
};

const filterColumns: FilterColumn[] = [
 { key: "name", type: "text", placeholder: "Filter name..." },
 { key: "slug", type: "text", placeholder: "Filter slug..." },
 { key: "_fields", type: "none" },
 { key: "_created", type: "none" },
 { key: "_actions", type: "none" },
];

export default async function TenantCollectionsPage({
 searchParams,
}: {
 searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
 const user = await getUser();
 if (!user) return null;

 const sp = await searchParams;
 const { page, sortCol, ascending, filters } = buildGridParams(sp as Record<string, string | string[] | undefined>, gridConfig);
 const dirLabel = ascending ? "asc" : "desc" as const;

 const supabase = await createClient();
 const tenantId = await resolveTenant(user.id);
 const role = tenantId ? await getUserRole(user.id, tenantId) : null;

 const { data: currentTenant } = tenantId
 ? await supabase.from("tenants").select("is_super").eq("id", tenantId).maybeSingle()
 : { data: null };
 const isSuperAdmin = role === "super_admin" && (currentTenant?.is_super === true);
 const isTenantAdmin = role === "tenant_admin";

 // Non-admin users: restrict to collections explicitly granted in their policy
 let accessibleIds: string[] | null = null;
 if (!isSuperAdmin && !isTenantAdmin) {
  accessibleIds = await getAccessibleCollectionIds(supabase, "read");
 }

 let q = supabase
 .from("collections")
 .select("*, collection_fields(id)", { count: "exact" })
 .eq("is_hidden", false)
 .eq("type", "tenant");

 if (accessibleIds !== null) q = q.in("id", accessibleIds.length ? accessibleIds : ["00000000-0000-0000-0000-000000000000"]);

 if (filters.name) q = q.ilike("name", `%${filters.name}%`);
 if (filters.slug) q = q.ilike("slug", `%${filters.slug}%`);

 q = q.order(sortCol, { ascending });

 if (tenantId) {
 q = q.eq("tenant_id", tenantId);
 }

 q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

 const { data: collections, count } = await q as { data: Collection[] | null; count: number | null };
 const rows = collections ?? [];
 const totalItems = count ?? 0;
 const totalPages = Math.ceil(totalItems / PAGE_SIZE);

 return (
 <div className="p-6 space-y-6 max-w-5xl">
 {/* Header */}
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <Layers className="h-6 w-6 text-blue-600 dark:text-blue-400" />
 <div>
 <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
 Tenant Collections
 </h1>
 <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
 Custom collections scoped to your tenant.
 </p>
 </div>
 </div>
 <CreateCollectionDialog isSuperAdmin={isSuperAdmin} defaultType="tenant" />
 </div>

 {/* Table */}
 <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
 <Table>
 <TableHeader className="bg-gray-100 dark:bg-gray-800">
 <TableRow className="border-gray-200 dark:border-gray-700 hover:bg-transparent">
 <SortableHead label="Name" field="name" currentSort={sortCol} currentDir={dirLabel} basePath="/dashboard/studio/tenant-collections" />
 <TableHead className="text-gray-500 dark:text-gray-400">Slug</TableHead>
 <TableHead className="text-center text-gray-500 dark:text-gray-400">Fields</TableHead>
 <SortableHead label="Created" field="created_at" currentSort={sortCol} currentDir={dirLabel} basePath="/dashboard/studio/tenant-collections" />
 <TableHead className="w-[120px] text-gray-500 dark:text-gray-400">Actions</TableHead>
 </TableRow>
 <Suspense><TableFilters columns={filterColumns} /></Suspense>
 </TableHeader>
 <TableBody>
 {rows.length === 0 ? (
 <TableRow>
 <TableCell colSpan={5} className="text-center text-gray-500 dark:text-gray-400 py-10 bg-white dark:bg-gray-900">
 No tenant collections yet. Create one to start modelling your data.
 </TableCell>
 </TableRow>
 ) : (
 rows.map((c, i) => (
 <TableRow
 key={c.id}
 className={`border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${i % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800/50"}`}
 >
 <TableCell>
 <Link
 href={`/dashboard/studio/collections/${c.slug}/items`}
 className="flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
 >
 {(() => {
   const Icon = resolveCollectionIcon(c.icon, false);
   return <Icon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400/50 shrink-0" />;
 })()}
 {c.name}
 </Link>
 </TableCell>
 <TableCell>
 <code className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-xs text-blue-600 dark:text-blue-400 font-mono">{c.slug}</code>
 </TableCell>
 <TableCell className="text-center">
 <Badge variant="outline" className="border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 text-xs">
 {c.collection_fields?.length ?? 0}
 </Badge>
 </TableCell>
 <TableCell className="text-gray-500 dark:text-gray-400 text-sm">
 {new Date(c.created_at).toLocaleDateString()}
 </TableCell>
 <TableCell>
 <div className="flex items-center gap-1">
 {(isSuperAdmin || c.type === "tenant") && (
 <CollectionActions
 collectionId={c.id}
 collectionName={c.name}
 collectionSlug={c.slug}
 description={c.description ?? ""}
 icon={c.icon ?? ""}
 metadata={c.metadata}
 />
 )}
 </div>
 </TableCell>
 </TableRow>
 ))
 )}
 </TableBody>
 </Table>
 </div>

 <TablePagination
 currentPage={page}
 totalPages={totalPages}
 totalItems={totalItems}
 basePath="/dashboard/studio/tenant-collections"
 sortCol={sortCol}
 ascending={ascending}
 />
 </div>
 );
}