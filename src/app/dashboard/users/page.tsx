import { getUser } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import { CreateUserDialog } from "@/components/create-user-dialog";
import { AssignUserDialog } from "@/components/assign-user-dialog";
import { MemberActions } from "@/components/member-actions";
import { TenantSwitcher } from "@/components/tenant-switcher";
import { ROLES, STATUS_LABELS } from "@/lib/constants";
import { PAGE_SIZE, buildGridParams, type GridConfig } from "@/lib/data-grid";
import { SortableHead } from "@/components/sortable-head";
import { TablePagination } from "@/components/table-pagination";
import { TableFilters, type FilterColumn } from "@/components/table-filters";
import { Suspense } from "react";

const STATUS_STYLES: Record<string, string> = {
 active: "border-green-500/40 text-green-400",
 inactive: "border-zinc-600 text-gray-500 dark:text-gray-400",
 suspended: "border-orange-500/40 text-orange-400",
};

const gridConfig: GridConfig = {
 sortable: [
  { field: "full_name", defaultDir: "asc" },
  { field: "email", defaultDir: "asc" },
  { field: "role", defaultDir: "asc" },
 ],
 filterable: ["full_name", "email", "role", "status"],
};

export default async function UsersPage({
 searchParams,
}: {
 searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
 const user = await getUser();
 if (!user) return null;

 const supabase = await createClient();

 const { data: superAdminCheck } = await supabase
 .from("tenant_users")
 .select("role")
 .eq("user_id", user.id)
 .eq("role", "super_admin")
 .limit(1)
 .single();

 const isSuperAdmin = !!superAdminCheck;

 const resolvedParams = await searchParams;
 const { page, sortCol, ascending, filters } = buildGridParams(resolvedParams as Record<string, string | string[] | undefined>, gridConfig);
 const dirLabel = ascending ? "asc" : "desc" as const;

 const tenantId = (isSuperAdmin && resolvedParams.tenant)
 ? String(resolvedParams.tenant)
 : await resolveTenant(user.id);

 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 let members: any[] = [];
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 let allTenants: any[] = [];
 let isSuperTenant = false;
 let availableRoles: { slug: string; name: string }[] = [];

 if (user && tenantId) {
 const [tenantsResult, tenantDataResult, membersResult, rolesResult] = await Promise.all([
  isSuperAdmin
   ? supabase.from("tenants").select("id, name, slug, is_super")
   : Promise.resolve({ data: null }),
  supabase.from("tenants").select("is_super").eq("id", tenantId).single(),
  supabase.from("tenant_users").select("user_id, role, is_active, status, profiles(email, full_name)").eq("tenant_id", tenantId),
  supabase.from("roles").select("name, slug").eq("tenant_id", tenantId).eq("is_system", false).order("name"),
 ]);

 allTenants = tenantsResult.data || [];
 isSuperTenant = tenantDataResult.data?.is_super ?? false;
 members = membersResult.data ?? [];

 const customRoles = (rolesResult.data ?? []).map((r) => ({ slug: r.slug, name: r.name }));

 if (isSuperTenant) {
  availableRoles = [
   { slug: ROLES.SUPER_ADMIN, name: "Super Admin" },
   { slug: ROLES.TENANT_ADMIN, name: "Tenant Admin" },
   ...customRoles,
  ];
 } else {
  availableRoles = [
   { slug: ROLES.TENANT_ADMIN, name: "Tenant Admin" },
   ...customRoles,
  ];
 }
 }

 // Build a slug → name lookup from available roles
 const roleLabels = new Map(availableRoles.map((r) => [r.slug, r.name]));

 // Application-level filters
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 if (filters.full_name) members = members.filter((m: any) => (m.profiles?.full_name || "").toLowerCase().includes(filters.full_name.toLowerCase()));
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 if (filters.email) members = members.filter((m: any) => (m.profiles?.email || "").toLowerCase().includes(filters.email.toLowerCase()));
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 if (filters.role) members = members.filter((m: any) => m.role === filters.role);
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 if (filters.status) members = members.filter((m: any) => (m.status || (m.is_active ? "active" : "inactive")) === filters.status);

 // Application-level sort (tenant_users join doesn't support .order on foreign table profiles)
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 members.sort((a: any, b: any) => {
  let aVal: string, bVal: string;
  if (sortCol === "email") {
   aVal = (a.profiles?.email || "").toLowerCase();
   bVal = (b.profiles?.email || "").toLowerCase();
  } else if (sortCol === "role") {
   aVal = (a.role || "").toLowerCase();
   bVal = (b.role || "").toLowerCase();
  } else {
   aVal = (a.profiles?.full_name || "").toLowerCase();
   bVal = (b.profiles?.full_name || "").toLowerCase();
  }
  const cmp = aVal.localeCompare(bVal);
  return ascending ? cmp : -cmp;
 });

 const totalItems = members.length;
 const totalPages = Math.ceil(totalItems / PAGE_SIZE);
 const pagedMembers = members.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

 const userFilterColumns: FilterColumn[] = [
  { key: "full_name", type: "text", placeholder: "Filter name..." },
  { key: "email", type: "text", placeholder: "Filter email..." },
  { key: "role", type: "select", options: availableRoles.map((r) => ({ value: r.slug, label: r.name })) },
  { key: "status", type: "select", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "suspended", label: "Suspended" }] },
  { key: "_actions", type: "none" },
 ];

 return (
 <div className="p-6 space-y-6 max-w-5xl">
 {/* Header */}
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
 <div>
 <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
 Users
 </h1>
 <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
 {isSuperAdmin ? "Platform administration — manage users across tenants." : "Manage users in your organization."}
 </p>
 </div>
 </div>
 {tenantId && (
 <div className="flex flex-wrap gap-2">
 {isSuperAdmin && isSuperTenant && (
 <TenantSwitcher
 tenants={allTenants.map((t: { id: string; name: string; slug: string; is_super: boolean }) => ({ tenant_id: t.id, tenants: t }))}
 currentTenantId={tenantId}
 />
 )}
 {isSuperAdmin && isSuperTenant && <AssignUserDialog tenantId={tenantId} isSuperTenant={isSuperTenant} />}
 <CreateUserDialog tenantId={tenantId} availableRoles={availableRoles} />
 </div>
 )}
 </div>

 {/* Table */}
 <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
 <Table>
 <TableHeader className="bg-gray-100 dark:bg-gray-800">
 <TableRow className="border-gray-200 dark:border-gray-700 hover:bg-transparent">
 <SortableHead label="Name" field="full_name" currentSort={sortCol} currentDir={dirLabel} basePath="/dashboard/users" currentParams={tenantId && resolvedParams.tenant ? { tenant: String(resolvedParams.tenant) } : undefined} />
 <SortableHead label="Email" field="email" currentSort={sortCol} currentDir={dirLabel} basePath="/dashboard/users" currentParams={tenantId && resolvedParams.tenant ? { tenant: String(resolvedParams.tenant) } : undefined} />
 <SortableHead label="Role" field="role" currentSort={sortCol} currentDir={dirLabel} basePath="/dashboard/users" currentParams={tenantId && resolvedParams.tenant ? { tenant: String(resolvedParams.tenant) } : undefined} />
 <TableHead className="text-gray-500 dark:text-gray-400">Status</TableHead>
 <TableHead className="w-[80px]" />
 </TableRow>
 <Suspense><TableFilters columns={userFilterColumns} /></Suspense>
 </TableHeader>
 <TableBody>
 {pagedMembers.length === 0 && totalItems === 0 ? (
 <TableRow>
 <TableCell colSpan={5} className="text-center text-gray-500 dark:text-gray-400 py-10 bg-white dark:bg-gray-900">
 No members found.
 </TableCell>
 </TableRow>
 ) : (
 pagedMembers.map((m, i) => {
 const memberStatus = m.status || (m.is_active ? "active" : "inactive");
 const statusStyle = STATUS_STYLES[memberStatus] || STATUS_STYLES.inactive;
 return (
 <TableRow
 key={m.user_id}
 className={`border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${i % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800/50"}`}
 >
 <TableCell className="text-gray-900 dark:text-gray-100 font-medium">{m.profiles?.full_name || "—"}</TableCell>
 <TableCell className="text-gray-500 dark:text-gray-400">{m.profiles?.email || "—"}</TableCell>
 <TableCell>
 <Badge variant="outline" className="border-blue-500/40 text-blue-600 dark:text-blue-400 text-xs">
 {roleLabels.get(m.role) ?? m.role}
 </Badge>
 </TableCell>
 <TableCell>
 <Badge variant="outline" className={`${statusStyle} text-xs`}>
 {STATUS_LABELS[memberStatus] ?? memberStatus}
 </Badge>
 </TableCell>
 <TableCell>
 {tenantId && (
 <MemberActions
 userId={m.user_id}
 tenantId={tenantId}
 currentRole={m.role}
 fullName={m.profiles?.full_name || ""}
 email={m.profiles?.email || ""}
 status={memberStatus}
 isSuperAdmin={isSuperAdmin}
 isSuperTenant={isSuperTenant}
 allTenants={allTenants}
 availableRoles={availableRoles}
 />
 )}
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
 basePath="/dashboard/users"
 sortCol={sortCol}
 ascending={ascending}
 currentParams={tenantId && resolvedParams.tenant ? { tenant: String(resolvedParams.tenant) } : undefined}
 />

 <p className="text-xs text-gray-500 dark:text-gray-400">
 <strong className="text-gray-900 dark:text-gray-100">Note: </strong>
 Each user belongs to one or more tenants with an assigned role. Roles control what pages and data the user can access.
 </p>
 </div>
 );
}