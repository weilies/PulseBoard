import { getUser } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileKey } from "lucide-react";
import { CreatePolicyDialog } from "@/components/create-policy-dialog";
import { PolicyActions } from "@/components/policy-actions";
import Link from "next/link";
import { PAGE_SIZE, buildGridParams, type GridConfig } from "@/lib/data-grid";
import { SortableHead } from "@/components/sortable-head";
import { TablePagination } from "@/components/table-pagination";
import { TableFilters, type FilterColumn } from "@/components/table-filters";
import { Suspense } from "react";

const gridConfig: GridConfig = {
 sortable: [
  { field: "name", defaultDir: "asc" },
 ],
 filterable: ["name"],
};

const filterColumns: FilterColumn[] = [
 { key: "name", type: "text", placeholder: "Filter policy..." },
 { key: "_roles", type: "none" },
 { key: "_type", type: "none" },
 { key: "_actions", type: "none" },
];

export default async function PoliciesPage({
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
 if (!tenantId) return null;

 const [{ data: tenantInfo }, pqResult] = await Promise.all([
  supabase.from("tenants").select("is_super").eq("id", tenantId).single(),
  (async () => {
   let pq = supabase.from("policies").select(`
     id, name, description, is_system, created_at,
     role_policies(
      role:roles(id, name, tenant_id)
     )
    `, { count: "exact" }).or(`is_system.eq.true,tenant_id.eq.${tenantId}`);
   if (filters.name) pq = pq.ilike("name", `%${filters.name}%`);
   return pq.order("is_system", { ascending: false }).order(sortCol, { ascending }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  })(),
 ]);

 const isSuperTenant = !!tenantInfo?.is_super;

 // Non-super tenants do not see any system policies — they manage only their custom policies
 const rows = (pqResult.data ?? []).filter((p) =>
  !p.is_system || isSuperTenant
 );
 const count = pqResult.count;
 const totalItems = count ?? 0;
 const totalPages = Math.ceil(totalItems / PAGE_SIZE);

 return (
  <div className="p-6 space-y-6 max-w-4xl">
   {/* Header */}
   <div className="flex items-center justify-between">
    <div className="flex items-center gap-3">
     <FileKey className="h-6 w-6 text-blue-600 dark:text-blue-400" />
     <div>
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
       Policies
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
       Each policy defines a named set of permissions across pages and collections.
      </p>
     </div>
    </div>
    <CreatePolicyDialog />
   </div>

   {/* Table */}
   <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
    <Table>
     <TableHeader className="bg-gray-100 dark:bg-gray-800">
      <TableRow className="border-gray-200 dark:border-gray-700 hover:bg-transparent">
       <SortableHead label="Policy" field="name" currentSort={sortCol} currentDir={dirLabel} basePath="/dashboard/policies" />
       <TableHead className="text-gray-500 dark:text-gray-400">Roles</TableHead>
       <TableHead className="text-gray-500 dark:text-gray-400">Type</TableHead>
       <TableHead className="w-12" />
      </TableRow>
      <Suspense><TableFilters columns={filterColumns} /></Suspense>
     </TableHeader>
     <TableBody>
      {rows.length === 0 ? (
       <TableRow>
        <TableCell colSpan={4} className="text-center text-gray-500 dark:text-gray-400 py-10 bg-white dark:bg-gray-900">
         No policies yet. Create one to define access rules.
        </TableCell>
       </TableRow>
      ) : (
       rows.map((policy, i) => {
        const linkedRoles = (policy.role_policies ?? [])
         .map((rp) => rp.role as unknown as { id: string; name: string; tenant_id: string } | null)
         .filter((r): r is { id: string; name: string; tenant_id: string } =>
          r != null && r.tenant_id === tenantId
         );

        return (
         <TableRow
          key={policy.id}
          className={`border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${i % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800/50"}`}
         >
          <TableCell>
           <div className="font-medium text-gray-900 dark:text-gray-100">{policy.name}</div>
           {policy.description && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{policy.description}</div>
           )}
          </TableCell>
          <TableCell>
           {linkedRoles.length === 0 ? (
            <span className="text-xs text-gray-400 dark:text-gray-500 italic">No roles</span>
           ) : (
            <div className="flex flex-wrap gap-1">
             {linkedRoles.map((r) => (
              <Link key={r.id} href={`/dashboard/roles/${r.id}`}>
               <Badge variant="outline" className="border-blue-500/40 text-blue-600 dark:text-blue-400 text-xs hover:bg-blue-500/10 transition-colors cursor-pointer">
                {r.name}
               </Badge>
              </Link>
             ))}
            </div>
           )}
          </TableCell>
          <TableCell>
           {policy.is_system ? (
            <Badge variant="outline" className="border-yellow-500/50 text-yellow-400 text-xs">System</Badge>
           ) : (
            <Badge variant="outline" className="border-blue-500/50 text-blue-600 dark:text-blue-400 text-xs">Custom</Badge>
           )}
          </TableCell>
          <TableCell>
           <PolicyActions policyId={policy.id} policyName={policy.name} isSystem={policy.is_system} />
          </TableCell>
         </TableRow>
        );
       })
      )}
     </TableBody>
    </Table>
   </div>

   <TablePagination
    currentPage={page}
    totalPages={totalPages}
    totalItems={totalItems}
    basePath="/dashboard/policies"
    sortCol={sortCol}
    ascending={ascending}
   />

   {/* Footnote */}
   <p className="text-xs text-gray-500 dark:text-gray-400">
    <strong className="text-gray-900 dark:text-gray-100">How policies work: </strong>
    A policy grants permissions to specific pages or collections. Assign policies to roles, then assign roles to users.
    System policies are managed by Next Novas and cannot be deleted.
   </p>
  </div>
 );
}
