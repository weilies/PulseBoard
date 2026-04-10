"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { NavFolder, NavItem } from "@/lib/services/nav.service";

interface CollectionInfo { id: string; name: string; slug: string; type: string; icon: string | null; }

interface DashboardShellProps {
 // Header props
 userEmail: string;
 userName: string;
 userRole: string | null;
 userId: string;
 userTimezone: string | null;
 avatarUrl: string | null;
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 tenants: any[];
 currentTenantId: string | null;
 isSuperAdmin: boolean;
 isSuperTenant: boolean;
 // Sidebar props
 accessiblePages: string[];
 rootFolders: NavFolder[];
 rootItems: NavItem[];
 collectionMap: Map<string, CollectionInfo>;
 feedbackMode?: boolean;
 children: React.ReactNode;
}

export function DashboardShell({
 userEmail, userName, userRole, userId, userTimezone, avatarUrl, tenants, currentTenantId, isSuperAdmin, isSuperTenant,
 accessiblePages, rootFolders, rootItems, collectionMap, feedbackMode,
 children,
}: DashboardShellProps) {
 const [mobileOpen, setMobileOpen] = useState(false);
 const [collapsed, setCollapsed] = useState(false);

 useEffect(() => {
  const stored = localStorage.getItem("pb-sidebar-collapsed");
  if (stored === "true") setCollapsed(true);
 }, []);

 function toggleCollapsed() {
  setCollapsed((prev) => {
   const next = !prev;
   localStorage.setItem("pb-sidebar-collapsed", String(next));
   return next;
  });
 }

 return (
 <div className="flex h-screen overflow-hidden bg-white dark:bg-gray-950">
 {/* Desktop sidebar */}
 <div className="hidden md:block">
 <Sidebar
 accessiblePages={accessiblePages}
 rootFolders={rootFolders}
 rootItems={rootItems}
 collectionMap={collectionMap}
 feedbackMode={feedbackMode}
 collapsed={collapsed}
 onToggleCollapse={toggleCollapsed}
 />
 </div>

 {/* Mobile sidebar sheet */}
 <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
 <SheetContent side="left" showCloseButton={false} className="p-0 w-64 bg-transparent border-0">
 <Sidebar
 accessiblePages={accessiblePages}
 rootFolders={rootFolders}
 rootItems={rootItems}
 collectionMap={collectionMap}
 feedbackMode={feedbackMode}
 onNavigate={() => setMobileOpen(false)}
 />
 </SheetContent>
 </Sheet>

 {/* Main area */}
 <div className="flex flex-1 flex-col overflow-hidden">
 <Header
 userEmail={userEmail}
 userName={userName}
 userRole={userRole}
 userId={userId}
 userTimezone={userTimezone}
 avatarUrl={avatarUrl}
 tenants={tenants}
 currentTenantId={currentTenantId}
 isSuperAdmin={isSuperAdmin}
 isSuperTenant={isSuperTenant}
 onMobileMenuClick={() => setMobileOpen(true)}
 />
 <main className="flex-1 overflow-y-auto p-4 md:p-6">
 {children}
 </main>
 </div>
 </div>
 );
}