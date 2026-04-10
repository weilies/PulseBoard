import { createClient } from "@/lib/supabase/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Building2 } from "lucide-react";
import { CreateTenantDialog } from "@/components/create-tenant-dialog";
import { TenantActions } from "@/components/tenant-actions";
import { PAGE_SIZE, buildGridParams, type GridConfig } from "@/lib/data-grid";
import { SortableHead } from "@/components/sortable-head";
import { TablePagination } from "@/components/table-pagination";
import { TableFilters, type FilterColumn } from "@/components/table-filters";
import { Suspense } from "react";

const gridConfig: GridConfig = {
 sortable: [
  { field: "created_at", defaultDir: "asc" },
  { field: "name", defaultDir: "asc" },
 ],
 filterable: ["name", "slug"],
};

const filterColumns: FilterColumn[] = [
 { key: "name", type: "text", placeholder: "Filter name..." },
 { key: "slug", type: "text", placeholder: "Filter slug..." },
 { key: "_pic", type: "none" },
 { key: "_type", type: "none" },
 { key: "_created", type: "none" },
 { key: "_actions", type: "none" },
];

export default async function TenantsPage({
 searchParams,
}: {
 searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
 const sp = await searchParams;
 const { page, sortCol, ascending, filters } = buildGridParams(sp as Record<string, string | string[] | undefined>, gridConfig);
 const dirLabel = ascending ? "asc" : "desc" as const;

 const supabase = await createClient();
 let q = supabase
 .from("tenants")
 .select("id, name, slug, is_super, created_at, contact_name, contact_email, timezone, feedback_mode", { count: "exact" });

 if (filters.name) q = q.ilike("name", `%${filters.name}%`);
 if (filters.slug) q = q.ilike("slug", `%${filters.slug}%`);

 const { data: tenants, count } = await q
 .order(sortCol, { ascending })
 .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

 const rows = tenants ?? [];
 const totalItems = count ?? 0;
 const totalPages = Math.ceil(totalItems / PAGE_SIZE);

 return (
 <div className="p-6 space-y-6 max-w-5xl">
 {/* Header */}
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <Building2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
 <div>
 <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
 Tenants
 </h1>
 <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
 Super admin view — manage all tenants on the platform.
 </p>
 </div>
 </div>
 <CreateTenantDialog />
 </div>

 {/* Table */}
 <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
 <Table>
 <TableHeader className="bg-gray-100 dark:bg-gray-800">
 <TableRow className="border-gray-200 dark:border-gray-700 hover:bg-transparent">
 <SortableHead label="Name" field="name" currentSort={sortCol} currentDir={dirLabel} basePath="/dashboard/tenants" />
 <TableHead className="text-gray-500 dark:text-gray-400">Slug</TableHead>
 <TableHead className="text-gray-500 dark:text-gray-400">Person In Charge</TableHead>
 <TableHead className="text-gray-500 dark:text-gray-400">Type</TableHead>
 <SortableHead label="Created" field="created_at" currentSort={sortCol} currentDir={dirLabel} basePath="/dashboard/tenants" />
 <TableHead className="w-[80px]" />
 </TableRow>
 <Suspense><TableFilters columns={filterColumns} /></Suspense>
 </TableHeader>
 <TableBody>
 {rows.length === 0 ? (
 <TableRow>
 <TableCell colSpan={6} className="text-center text-gray-500 dark:text-gray-400 py-10 bg-white dark:bg-gray-900">
 No tenants found.
 </TableCell>
 </TableRow>
 ) : (
 rows.map((t, i) => (
 <TableRow
 key={t.id}
 className={`border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${i % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800/50"}`}
 >
 <TableCell className="font-medium text-gray-900 dark:text-gray-100">{t.name}</TableCell>
 <TableCell>
 <code className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-xs text-blue-600 dark:text-blue-400 font-mono">{t.slug}</code>
 </TableCell>
 <TableCell className="text-gray-900 dark:text-gray-100 text-sm">
 {t.contact_name ? (
 <div>
 <div>{t.contact_name}</div>
 {t.contact_email && (
 <div className="text-xs text-gray-500 dark:text-gray-400">{t.contact_email}</div>
 )}
 </div>
 ) : (
 <span className="text-gray-400 dark:text-gray-500">—</span>
 )}
 </TableCell>
 <TableCell>
 <Badge
 variant="outline"
 className={t.is_super
 ? "border-yellow-500/50 text-yellow-400 text-xs"
 : "border-blue-500/40 text-blue-600 dark:text-blue-400 text-xs"}
 >
 {t.is_super ? "Super" : "Client"}
 </Badge>
 </TableCell>
 <TableCell className="text-gray-500 dark:text-gray-400 text-sm">
 {new Date(t.created_at).toLocaleDateString()}
 </TableCell>
 <TableCell>
 <TenantActions
 tenantId={t.id}
 tenantName={t.name}
 tenantSlug={t.slug}
 isSuper={t.is_super}
 contactName={t.contact_name}
 contactEmail={t.contact_email}
 timezone={t.timezone}
 feedbackMode={t.feedback_mode ?? false}
 />
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
 basePath="/dashboard/tenants"
 sortCol={sortCol}
 ascending={ascending}
 />

 <p className="text-xs text-gray-500 dark:text-gray-400">
 <strong className="text-gray-900 dark:text-gray-100">Super tenants</strong> have platform-wide admin access and manage system collections.
 Client tenants are isolated within their own data scope.
 </p>
 </div>
 );
}