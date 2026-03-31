import { notFound } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Shield } from "lucide-react";
import { RolePolicyAssignment } from "@/components/role-policy-assignment";
import { DeleteRoleButton } from "@/components/delete-role-button";
import { RolePolicyViewer } from "@/components/role-policy-viewer";
import { ALL_PAGE_SLUGS } from "@/lib/services/permissions.service";

export default async function RoleDetailPage({
 params,
}: {
 params: Promise<{ roleId: string }>;
}) {
 const { roleId } = await params;
 const user = await getUser();
 if (!user) return null;

 const supabase = await createClient();
 const tenantId = await resolveTenant(user.id);
 if (!tenantId) return null;

 const [{ data: tenantInfo }, { data: role }, { data: allPolicies }, { data: collections }] = await Promise.all([
  supabase.from("tenants").select("is_super").eq("id", tenantId).single(),
  supabase.from("roles").select(`
   id, name, slug, description, is_system,
   role_policies(
    policy:policies(
     id, name, description, is_system,
     policy_permissions(resource_type, resource_id, permissions)
    )
   )
  `).eq("id", roleId).eq("tenant_id", tenantId).single(),
  supabase.from("policies").select("id, name, is_system").or(`is_system.eq.true,tenant_id.eq.${tenantId}`).order("name"),
  supabase.from("collections").select("id, name, type").eq("is_hidden", false).or(`type.eq.system,tenant_id.eq.${tenantId}`).order("name"),
 ]);

 const isSuperTenant = !!tenantInfo?.is_super;
 if (!role) notFound();

 const availablePages = isSuperTenant ? ALL_PAGE_SLUGS : ALL_PAGE_SLUGS.filter((p) => p !== "tenants");

 // Build assigned policy IDs set
 type PolicyShape = { id: string; name: string; description: string | null; is_system: boolean; policy_permissions: Array<{ resource_type: string; resource_id: string; permissions: Record<string, boolean> }> };
 const assignedPolicies = (role.role_policies ?? [])
  .map((rp) => rp.policy as unknown as PolicyShape)
  .filter(Boolean);
 const assignedPolicyIds = assignedPolicies.map((p) => p.id);

 // Build summary data for the Summarize button
 const summaryData = {
  pages: availablePages.map((page) => {
   const hasAccess = assignedPolicies.some((p) =>
    p.policy_permissions?.some(
     (pp) => pp.resource_type === "page" && pp.resource_id === page && pp.permissions?.access
    )
   );
   return { slug: page, access: hasAccess };
  }),
  collections: (collections ?? []).map((col) => {
   const mergedPerms: Record<string, boolean> = {};
   for (const p of assignedPolicies) {
    for (const pp of p.policy_permissions ?? []) {
     if (pp.resource_type === "collection" && pp.resource_id === col.id) {
      for (const [k, v] of Object.entries(pp.permissions)) {
       if (v) mergedPerms[k] = true;
      }
     }
    }
   }
   return { id: col.id, name: col.name, type: col.type, permissions: mergedPerms };
  }),
 };

 return (
  <div className="p-6 space-y-6 max-w-5xl">
   {/* Back */}
   <Link
    href="/dashboard/roles"
    className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
   >
    <ArrowLeft className="h-4 w-4" />
    Back to Roles &amp; Policies
   </Link>

   {/* Header */}
   <div className="flex items-center justify-between">
    <div className="flex items-center gap-3">
     <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
     <div>
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
       {role.name}
      </h1>
      <div className="flex items-center gap-2 mt-1">
       <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{role.slug}</span>
       {role.is_system && (
        <Badge variant="outline" className="border-yellow-500/50 text-yellow-400 text-xs">System</Badge>
       )}
      </div>
     </div>
    </div>
    <div className="flex items-center gap-2">
     {!role.is_system && (
      <DeleteRoleButton roleId={roleId} roleName={role.name} />
     )}
    </div>
   </div>

   {/* Assigned Policies */}
   <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
    <CardHeader className="pb-3">
     <CardTitle className="text-gray-900 dark:text-gray-100 text-base">Assigned Policies</CardTitle>
     <CardDescription className="text-gray-500 dark:text-gray-400">
      Policies granted to this role. Users with this role inherit all these permissions.
     </CardDescription>
    </CardHeader>
    <CardContent>
     <RolePolicyAssignment
      roleId={roleId}
      allPolicies={(allPolicies ?? []).map((p) => ({ id: p.id, name: p.name, isSystem: p.is_system }))}
      assignedPolicyIds={assignedPolicyIds}
      isSystemRole={role.is_system}
     />
    </CardContent>
   </Card>

   {/* Policy Details / Policy Summary toggle viewer */}
   <RolePolicyViewer
    policies={assignedPolicies.map((p) => ({
     id: p.id,
     name: p.name,
     description: p.description,
     is_system: p.is_system,
     policy_permissions: (p.policy_permissions ?? []).map((pp) => ({
      resource_type: pp.resource_type as "page" | "collection",
      resource_id: pp.resource_id,
      permissions: pp.permissions as Record<string, boolean>,
     })),
    }))}
    summaryData={summaryData}
    pages={availablePages}
    collections={(collections ?? []).map((c) => ({ id: c.id, name: c.name, type: c.type }))}
    isSuperTenant={isSuperTenant}
   />
  </div>
 );
}
