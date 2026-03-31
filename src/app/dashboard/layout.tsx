import { redirect } from "next/navigation";
import { getUser, getUserTenants } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageTracker } from "@/components/page-tracker";
import { ErrorBoundary } from "@/components/error-boundary";
import { buildNavTree } from "@/lib/services/nav.service";
import type { NavFolder, NavItem } from "@/lib/services/nav.service";

export default async function DashboardLayout({
 children,
}: {
 children: React.ReactNode;
}) {
 const user = await getUser();
 if (!user) redirect("/login");

 const supabase = await createClient();
 const tenantId = await resolveTenant(user.id);
 const tenants = await getUserTenants(user.id);

 // Fetch accessible pages and collection permissions from DB
 const [pagesResult, collectionIdsResult, navResult, collectionsResult] = await Promise.all([
 supabase.rpc("get_accessible_pages"),
 supabase.rpc("get_accessible_collection_ids", { p_permission: "read" }),
 tenantId
 ? Promise.all([
 supabase.from("nav_folders").select("id, name, icon, parent_id, sort_order").eq("tenant_id", tenantId).order("sort_order"),
 supabase.from("nav_items").select("id, resource_type, resource_id, label, icon, folder_id, sort_order").eq("tenant_id", tenantId).order("sort_order"),
 ])
 : Promise.resolve([{ data: [] }, { data: [] }]),
 tenantId
 ? supabase.from("collections").select("id, name, slug, type, icon").eq("is_hidden", false).or(`type.eq.system,tenant_id.eq.${tenantId}`)
 : supabase.from("collections").select("id, name, slug, type, icon").eq("is_hidden", false).eq("type", "system"),
 ]);

 const accessiblePages = (pagesResult.data as string[]) ?? [];
 const accessibleCollectionIds = new Set<string>((collectionIdsResult.data as string[]) ?? []);

 const navFolders = (navResult[0].data ?? []) as NavFolder[];
 const navItemsRaw = (navResult[1].data ?? []) as NavItem[];

 // Filter nav items to only those the user can access
 const navItems = navItemsRaw.filter((item) => {
 if (item.resource_type === "page") return accessiblePages.includes(item.resource_id);
 if (item.resource_type === "collection") return accessibleCollectionIds.has(item.resource_id);
 return false;
 });

 // Build collection lookup map
 const collectionMap = new Map(
 (collectionsResult.data ?? []).map((c) => [c.id, { id: c.id, name: c.name, slug: c.slug, type: c.type, icon: c.icon ?? null }])
 );

 const { rootFolders, rootItems } = buildNavTree(navFolders, navItems);

 // Legacy role for Header compatibility
 const { data: superAdminCheck } = await supabase.rpc("is_super_admin");
 const effectiveRole = superAdminCheck ? "super_admin" : "tenant_admin";
 const isSuperAdmin = !!superAdminCheck;
 const currentTenantEntry = (tenants as any[]).find(t => t.tenant_id === tenantId);
 const isSuperTenant = (currentTenantEntry as any)?.tenants?.is_super ?? false;

 // User profile: timezone + avatar
 const { data: profileData } = await supabase
 .from("profiles")
 .select("timezone, avatar_path")
 .eq("id", user.id)
 .single();
 const userTimezone = profileData?.timezone ?? null;

 // Generate signed URL for avatar if present
 let avatarUrl: string | null = null;
 if (profileData?.avatar_path) {
 const { createAdminClient } = await import("@/lib/supabase/admin");
 const admin = createAdminClient();
 const { data: signed } = await admin.storage.from("media").createSignedUrl(profileData.avatar_path, 3600);
 avatarUrl = signed?.signedUrl ?? null;
 }

 return (
 <DashboardShell
 userEmail={user.email || ""}
 userName={user.user_metadata?.full_name || ""}
 userRole={effectiveRole}
 userId={user.id}
 userTimezone={userTimezone}
 avatarUrl={avatarUrl}
 tenants={tenants}
 currentTenantId={tenantId}
 isSuperAdmin={isSuperAdmin}
 isSuperTenant={isSuperTenant}
 accessiblePages={accessiblePages}
 rootFolders={rootFolders}
 rootItems={rootItems}
 collectionMap={collectionMap}
 >
 <PageTracker />
 <ErrorBoundary>{children}</ErrorBoundary>
 </DashboardShell>
 );
}