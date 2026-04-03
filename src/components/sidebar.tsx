"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Building2, FlaskConical, Database,
  BookOpen, Layers, ChevronDown, ChevronLeft, ChevronRight, Shield, FileKey, Folder, FolderOpen,
  Boxes, Box, Map, Lock, KeyRound, Workflow, Plug2, Webhook, ScrollText, Store,
} from "lucide-react";
import * as LucideIcons from "lucide-react";

function resolveCollectionIcon(
  icon: string | null | undefined,
  type: string
): React.ComponentType<{ className?: string }> {
  if (icon) {
    const name = icon.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
    const Comp = (LucideIcons as Record<string, unknown>)[name];
    if (Comp) return Comp as React.ComponentType<{ className?: string }>;
  }
  return type === "system" ? Database : Box;
}
import { cn } from "@/lib/utils";
import type { NavFolder, NavItem } from "@/lib/services/nav.service";

// ---------------------------------------------------------------------------
// Page slug → config
// ---------------------------------------------------------------------------

const PAGE_CONFIG: Record<string, { href: string; label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  "dashboard": { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  "users": { href: "/dashboard/users", label: "Users", Icon: Users },
  "tenants": { href: "/dashboard/tenants", label: "Tenants", Icon: Building2 },
  "studio.system-collections": { href: "/dashboard/studio/system-collections", label: "System Collections", Icon: Database },
  "studio.content-catalog": { href: "/dashboard/studio/content-catalog", label: "Content Catalog", Icon: BookOpen },
  "studio.tenant-collections": { href: "/dashboard/studio/tenant-collections", label: "Tenant Collections", Icon: Layers },
  "studio.queries": { href: "/dashboard/studio/queries", label: "Query Generator", Icon: Workflow },
  "studio.app-store": { href: "/dashboard/studio/app-store", label: "App Store", Icon: Store },
  "roles": { href: "/dashboard/roles", label: "Roles", Icon: Shield },
  "policies": { href: "/dashboard/policies", label: "Policies", Icon: FileKey },
  "apps": { href: "/dashboard/apps", label: "Applications", Icon: KeyRound },
  "webhooks": { href: "/dashboard/webhooks", label: "Webhooks", Icon: Webhook },
  "studio.logs": { href: "/dashboard/studio/logs", label: "Activity Log", Icon: ScrollText },
};

const STUDIO_PAGES = ["studio.system-collections", "studio.content-catalog", "studio.tenant-collections", "studio.queries", "studio.logs"];

// Studio pages sorted alphabetically by label
const STUDIO_PAGES_SORTED = [...STUDIO_PAGES].sort((a, b) =>
  PAGE_CONFIG[a].label.localeCompare(PAGE_CONFIG[b].label)
);

interface CollectionInfo { id: string; name: string; slug: string; type: string; icon: string | null; }

interface SidebarProps {
  accessiblePages: string[];
  rootFolders: NavFolder[];
  rootItems: NavItem[];
  collectionMap: Map<string, CollectionInfo>;
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

// ---------------------------------------------------------------------------
// Recursive folder renderer
// ---------------------------------------------------------------------------

function NavFolderNode({
  folder,
  collectionMap,
  pathname,
  depth,
  onNavigate,
}: {
  folder: NavFolder;
  collectionMap: Map<string, CollectionInfo>;
  pathname: string;
  depth: number;
  onNavigate?: () => void;
}) {
  const hasCollectionActive = checkFolderActive(folder, collectionMap, pathname);
  const [open, setOpen] = useState(hasCollectionActive);

  const FolderIcon = open ? FolderOpen : Folder;

  return (
    <div>
      <button
        onClick={() => setOpen((p) => !p)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
          hasCollectionActive ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-500 dark:hover:text-blue-400 dark:text-blue-400 dark:text-gray-400 dark:hover:bg-gray-800",
          depth > 0 && "pl-6 text-xs"
        )}
        style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
      >
        <FolderIcon className="h-4 w-4 shrink-0" />
        <span className="truncate">{folder.name}</span>
        <ChevronDown
          className={cn("ml-auto h-3 w-3 shrink-0 transition-transform duration-200", open ? "rotate-0" : "-rotate-90")}
        />
      </button>

      {open && (
        <div className={cn("mt-0.5 space-y-0.5 border-l border-gray-100 dark:border-gray-700", depth > 0 ? "ml-6 pl-2" : "ml-4 pl-2")}>
          {/* Sub-folders */}
          {(folder.children ?? []).map((child) => (
            <NavFolderNode key={child.id} folder={child} collectionMap={collectionMap} pathname={pathname} depth={depth + 1} onNavigate={onNavigate} />
          ))}
          {/* Items in this folder */}
          {(folder.items ?? []).map((item) => (
            <NavItemNode key={item.id} item={item} collectionMap={collectionMap} pathname={pathname} isChild onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

function checkFolderActive(folder: NavFolder, collectionMap: Map<string, CollectionInfo>, pathname: string): boolean {
  if (folder.items?.some((item) => isItemActive(item, collectionMap, pathname))) return true;
  return folder.children?.some((child) => checkFolderActive(child, collectionMap, pathname)) ?? false;
}

function isItemActive(item: NavItem, collectionMap: Map<string, CollectionInfo>, pathname: string): boolean {
  if (item.resource_type === "page") {
    const config = PAGE_CONFIG[item.resource_id];
    return config ? (pathname === config.href || pathname.startsWith(config.href + "/")) : false;
  }
  if (item.resource_type === "collection") {
    const col = collectionMap.get(item.resource_id);
    if (!col) return false;
    return pathname.startsWith(`/dashboard/c/${col.slug}`);
  }
  return false;
}

function NavItemNode({
  item,
  collectionMap,
  pathname,
  isChild = false,
  onNavigate,
}: {
  item: NavItem;
  collectionMap: Map<string, CollectionInfo>;
  pathname: string;
  isChild?: boolean;
  onNavigate?: () => void;
}) {
  if (item.resource_type === "page") {
    const config = PAGE_CONFIG[item.resource_id];
    if (!config) return null;
    const Icon = config.Icon;
    const isActive = pathname === config.href || pathname.startsWith(config.href + "/");
    return (
      <Link
        href={config.href}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-200",
          isActive
            ? "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-gray-300 dark:border-gray-600 dark:bg-blue-950/50 dark:text-blue-400"
            : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-500 dark:hover:text-blue-400 dark:text-blue-400 dark:text-gray-400 dark:hover:bg-gray-800 border border-transparent",
          !isChild && "text-sm"
        )}
        style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{item.label ?? config.label}</span>
      </Link>
    );
  }

  if (item.resource_type === "collection") {
    const col = collectionMap.get(item.resource_id);
    if (!col) return null;
    const href = `/dashboard/c/${col.slug}`;
    const isActive = pathname.startsWith(href);
    const Icon = resolveCollectionIcon(col.icon, col.type);
    return (
      <Link
        href={href}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-200",
          isActive
            ? "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-gray-300 dark:border-gray-600 dark:bg-blue-950/50 dark:text-blue-400"
            : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-500 dark:hover:text-blue-400 dark:text-blue-400 dark:text-gray-400 dark:hover:bg-gray-800 border border-transparent"
        )}
        style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{item.label ?? col.name}</span>
      </Link>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Reusable sub-nav link
// ---------------------------------------------------------------------------

function SubNavLink({
  href,
  icon: Icon,
  label,
  pathname,
  onNavigate,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  pathname: string;
  onNavigate?: () => void;
}) {
  const isActive = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-200",
        isActive
          ? "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-gray-300 dark:border-gray-600 dark:bg-blue-950/50 dark:text-blue-400"
          : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-500 dark:hover:text-blue-400 dark:text-blue-400 dark:text-gray-400 dark:hover:bg-gray-800 border border-transparent"
      )}
      style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main Sidebar
// ---------------------------------------------------------------------------

export function Sidebar({ accessiblePages, rootFolders, rootItems, collectionMap, onNavigate, collapsed = false, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();

  const pageSet = new Set(accessiblePages);

  // Fixed top-level pages (Dashboard only)
  const topPages = ["dashboard"];

  // Studio sub-pages (alphabetically sorted)
  const visibleStudioPages = STUDIO_PAGES_SORTED.filter((p) => pageSet.has(p));

  // User Management folder (renamed from Security): Users, Roles, Policies, Tenants
  const hasUserMgmtAccess = pageSet.has("users") || pageSet.has("roles") || pageSet.has("tenants");
  const userMgmtActive =
    pathname.startsWith("/dashboard/users") ||
    pathname.startsWith("/dashboard/roles") ||
    pathname.startsWith("/dashboard/policies") ||
    pathname.startsWith("/dashboard/tenants");
  const [userMgmtOpen, setUserMgmtOpen] = useState(userMgmtActive);

  // Studio folder
  const studioActive = pathname.startsWith("/dashboard/studio");
  const [studioOpen, setStudioOpen] = useState(studioActive);

  // Integration folder: Applications (apps), Webhooks, App Store
  const hasIntegrationAccess = pageSet.has("apps") || pageSet.has("webhooks") || pageSet.has("studio.app-store");
  const integrationActive = pathname.startsWith("/dashboard/apps") || pathname.startsWith("/dashboard/webhooks") || pathname.startsWith("/dashboard/studio/app-store");
  const [integrationOpen, setIntegrationOpen] = useState(integrationActive);

  // Separate root nav items into page items and collection items
  const rootPageItems = rootItems.filter((i) => i.resource_type === "page" && pageSet.has(i.resource_id));
  const rootCollectionItems = rootItems.filter((i) => i.resource_type === "collection");

  // Check if collections section has any items (including in folders)
  const hasCollections = rootCollectionItems.length > 0 || rootFolders.length > 0;

  return (
    <aside className={cn("flex h-full flex-col border-r bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 dark:bg-gray-900 transition-all duration-200 overflow-hidden", collapsed ? "w-14" : "w-64")}>
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-gray-200 dark:border-gray-700 px-4 justify-between">
        {collapsed ? (
          <span className="text-lg font-bold text-blue-600 dark:text-blue-400 mx-auto">P</span>
        ) : (
          <Link
            href="/dashboard"
            onClick={onNavigate}
            className="text-lg font-bold text-blue-600 dark:text-blue-400 tracking-tight"
          >
            PulseBox
          </Link>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">

        {/* Fixed top-level page links (Dashboard only) */}
        {topPages.filter((p) => pageSet.has(p)).map((pageSlug) => {
          const navItem = rootPageItems.find((i) => i.resource_id === pageSlug);
          const config = PAGE_CONFIG[pageSlug];
          if (!config) return null;
          const Icon = config.Icon;
          const isActive = pathname === config.href || (config.href !== "/dashboard" && pathname.startsWith(config.href));
          return (
            <Link
              key={pageSlug}
              href={config.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-gray-300 dark:border-gray-600 dark:bg-blue-950/50 dark:text-blue-400 shadow-lg"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-500 dark:hover:text-blue-400 dark:text-blue-400 dark:text-gray-400 dark:hover:bg-gray-800 border border-transparent"
              )}
              style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
            >
              <Icon className="h-4 w-4" />
              {navItem?.label ?? config.label}
            </Link>
          );
        })}

        {/* User Management folder (Policies, Roles, Tenants, Users — alphabetical) */}
        {hasUserMgmtAccess && (
          <div>
            <button
              onClick={() => setUserMgmtOpen((p) => !p)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                userMgmtActive ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-500 dark:hover:text-blue-400 dark:text-blue-400 dark:text-gray-400 dark:hover:bg-gray-800",
                "border border-transparent"
              )}
              style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
            >
              <Lock className="h-4 w-4" />
              User Management
              <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform duration-200", userMgmtOpen ? "rotate-0" : "-rotate-90")} />
            </button>

            {userMgmtOpen && (
              <div className="ml-4 mt-0.5 space-y-0.5 border-l border-gray-100 dark:border-gray-700 pl-2">
                {/* Policies (alphabetically first) */}
                {pageSet.has("roles") && (
                  <SubNavLink href="/dashboard/policies" icon={FileKey} label="Policies" pathname={pathname} onNavigate={onNavigate} />
                )}
                {/* Roles */}
                {pageSet.has("roles") && (
                  <SubNavLink href="/dashboard/roles" icon={Shield} label="Roles" pathname={pathname} onNavigate={onNavigate} />
                )}
                {/* Tenants */}
                {pageSet.has("tenants") && (
                  <SubNavLink href="/dashboard/tenants" icon={Building2} label="Tenants" pathname={pathname} onNavigate={onNavigate} />
                )}
                {/* Users */}
                {pageSet.has("users") && (
                  <SubNavLink href="/dashboard/users" icon={Users} label="Users" pathname={pathname} onNavigate={onNavigate} />
                )}
              </div>
            )}
          </div>
        )}

        {/* Studio folder */}
        {visibleStudioPages.length > 0 && (
          <div>
            <button
              onClick={() => setStudioOpen((p) => !p)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                studioActive ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-500 dark:hover:text-blue-400 dark:text-blue-400 dark:text-gray-400 dark:hover:bg-gray-800",
                "border border-transparent"
              )}
              style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
            >
              <FlaskConical className="h-4 w-4" />
              Studio
              <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform duration-200", studioOpen ? "rotate-0" : "-rotate-90")} />
            </button>

            {studioOpen && (
              <div className="ml-4 mt-0.5 space-y-0.5 border-l border-gray-100 dark:border-gray-700 pl-2">
                {/* Studio items + Navigations, all sorted alphabetically */}
                {(() => {
                  type StudioEntry =
                    | { kind: "page"; slug: string }
                    | { kind: "nav" };
                  const entries: StudioEntry[] = [
                    ...visibleStudioPages.map((slug): StudioEntry => ({ kind: "page", slug })),
                    ...(pageSet.has("roles") ? [{ kind: "nav" } as StudioEntry] : []),
                  ];
                  entries.sort((a, b) => {
                    const labelA = a.kind === "page" ? PAGE_CONFIG[a.slug].label : "Navigations";
                    const labelB = b.kind === "page" ? PAGE_CONFIG[b.slug].label : "Navigations";
                    return labelA.localeCompare(labelB);
                  });
                  return entries.map((entry, i) => {
                    if (entry.kind === "nav") {
                      return (
                        <SubNavLink key="nav" href="/dashboard/nav" icon={Map} label="Navigations" pathname={pathname} onNavigate={onNavigate} />
                      );
                    }
                    const config = PAGE_CONFIG[entry.slug];
                    if (!config) return null;
                    const Icon = config.Icon;
                    const isActive = pathname.startsWith(config.href);
                    return (
                      <Link
                        key={entry.slug}
                        href={config.href}
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-200",
                          isActive
                            ? "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-gray-300 dark:border-gray-600 dark:bg-blue-950/50 dark:text-blue-400"
                            : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-500 dark:hover:text-blue-400 dark:text-blue-400 dark:text-gray-400 dark:hover:bg-gray-800 border border-transparent"
                        )}
                        style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {config.label}
                      </Link>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        )}

        {/* Integration folder */}
        {hasIntegrationAccess && (
          <div>
            <button
              onClick={() => setIntegrationOpen((p) => !p)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                integrationActive ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-500 dark:hover:text-blue-400 dark:text-blue-400 dark:text-gray-400 dark:hover:bg-gray-800",
                "border border-transparent"
              )}
              style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
            >
              <Plug2 className="h-4 w-4" />
              Integration
              <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform duration-200", integrationOpen ? "rotate-0" : "-rotate-90")} />
            </button>

            {integrationOpen && (
              <div className="ml-4 mt-0.5 space-y-0.5 border-l border-gray-100 dark:border-gray-700 pl-2">
                {pageSet.has("apps") && <SubNavLink href="/dashboard/apps" icon={KeyRound} label="Applications" pathname={pathname} onNavigate={onNavigate} />}
                {pageSet.has("studio.app-store") && <SubNavLink href="/dashboard/studio/app-store" icon={Store} label="App Store" pathname={pathname} onNavigate={onNavigate} />}
                {pageSet.has("webhooks") && <SubNavLink href="/dashboard/webhooks" icon={Webhook} label="Webhooks" pathname={pathname} onNavigate={onNavigate} />}
              </div>
            )}
          </div>
        )}

        {/* Dynamic collections section */}
        {hasCollections && (
          <div className="pt-2">
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-blue-500 dark:text-blue-400/40 flex items-center gap-2">
              <Boxes className="h-3 w-3" />
              Collections
            </div>

            <div className="mt-1 space-y-0.5">
              {/* Root-level folders */}
              {rootFolders.map((folder) => (
                <NavFolderNode key={folder.id} folder={folder} collectionMap={collectionMap} pathname={pathname} depth={0} onNavigate={onNavigate} />
              ))}

              {/* Root-level collection items (no folder) */}
              {rootCollectionItems.map((item) => (
                <NavItemNode key={item.id} item={item} collectionMap={collectionMap} pathname={pathname} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Footer + collapse toggle */}
      <div className="border-t border-gray-200 dark:border-gray-700">
        {onToggleCollapse && (
          <div className="flex justify-center p-2">
            <button
              onClick={onToggleCollapse}
              className="flex items-center justify-center h-8 w-8 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>
        )}
        {!collapsed && (
          <div className="px-3 pb-3 text-xs text-gray-400 dark:text-gray-400 text-center" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
            v1.0 Quantum
          </div>
        )}
      </div>
    </aside>
  );
}
