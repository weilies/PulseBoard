"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Building2, FlaskConical, Database,
  BookOpen, Layers, ChevronDown, Shield, FileKey, Folder, FolderOpen,
  Boxes, Box, Map, Lock, KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavFolder, NavItem } from "@/lib/services/nav.service";

// ---------------------------------------------------------------------------
// Page slug → config
// ---------------------------------------------------------------------------

const PAGE_CONFIG: Record<string, { href: string; label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  "dashboard":                   { href: "/dashboard",                               label: "Dashboard",           Icon: LayoutDashboard },
  "users":                       { href: "/dashboard/users",                         label: "Users",               Icon: Users },
  "tenants":                     { href: "/dashboard/tenants",                       label: "Tenants",             Icon: Building2 },
  "studio.system-collections":   { href: "/dashboard/studio/system-collections",     label: "System Collections",  Icon: Database },
  "studio.content-catalog":      { href: "/dashboard/studio/content-catalog",        label: "Content Catalog",     Icon: BookOpen },
  "studio.tenant-collections":   { href: "/dashboard/studio/tenant-collections",     label: "Tenant Collections",  Icon: Layers },
  "roles":                       { href: "/dashboard/roles",                         label: "Roles",               Icon: Shield },
  "policies":                    { href: "/dashboard/policies",                      label: "Policies",            Icon: FileKey },
  "apps":                        { href: "/dashboard/apps",                          label: "API Apps",            Icon: KeyRound },
};

const STUDIO_PAGES = ["studio.system-collections", "studio.content-catalog", "studio.tenant-collections"];

interface CollectionInfo { id: string; name: string; slug: string; type: string; }

interface SidebarProps {
  accessiblePages: string[];
  rootFolders: NavFolder[];
  rootItems: NavItem[];
  collectionMap: Map<string, CollectionInfo>;
  onNavigate?: () => void;
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
          hasCollectionActive ? "text-blue-600" : "text-gray-500 hover:bg-gray-100 hover:text-blue-500",
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
        <div className={cn("mt-0.5 space-y-0.5 border-l border-gray-100", depth > 0 ? "ml-6 pl-2" : "ml-4 pl-2")}>
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
            ? "bg-blue-50 text-blue-600 border border-gray-300"
            : "text-gray-500 hover:bg-gray-100 hover:text-blue-500 border border-transparent",
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
    const Icon = col.type === "system" ? Database : Box;
    return (
      <Link
        href={href}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-200",
          isActive
            ? "bg-blue-50 text-blue-600 border border-gray-300"
            : "text-gray-500 hover:bg-gray-100 hover:text-blue-500 border border-transparent"
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
          ? "bg-blue-50 text-blue-600 border border-gray-300"
          : "text-gray-500 hover:bg-gray-100 hover:text-blue-500 border border-transparent"
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

export function Sidebar({ accessiblePages, rootFolders, rootItems, collectionMap, onNavigate }: SidebarProps) {
  const pathname = usePathname();

  const pageSet = new Set(accessiblePages);

  // Fixed top-level pages (Dashboard + Tenants only)
  const topPages = ["dashboard", "tenants"];
  // Studio sub-pages
  const visibleStudioPages = STUDIO_PAGES.filter((p) => pageSet.has(p));

  // Security folder: visible if user has Users, Roles, or Apps access
  const hasSecurityAccess = pageSet.has("users") || pageSet.has("roles") || pageSet.has("apps");
  const securityActive =
    pathname.startsWith("/dashboard/users") ||
    pathname.startsWith("/dashboard/roles") ||
    pathname.startsWith("/dashboard/policies") ||
    pathname.startsWith("/dashboard/apps");
  const [securityOpen, setSecurityOpen] = useState(securityActive);

  const studioActive = pathname.startsWith("/dashboard/studio");
  const [studioOpen, setStudioOpen] = useState(studioActive);

  // Separate root nav items into page items and collection items
  const rootPageItems = rootItems.filter((i) => i.resource_type === "page" && pageSet.has(i.resource_id));
  const rootCollectionItems = rootItems.filter((i) => i.resource_type === "collection");

  // Check if collections section has any items (including in folders)
  const hasCollections = rootCollectionItems.length > 0 || rootFolders.length > 0;

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-gray-50 border-gray-200">
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-gray-200 px-4">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="text-lg font-bold text-blue-600 tracking-tight"
        >
          PulseBoard
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">

        {/* Fixed top-level page links (Dashboard, Tenants) */}
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
                  ? "bg-blue-50 text-blue-600 border border-gray-300 shadow-lg"
                  : "text-gray-500 hover:bg-gray-100 hover:text-blue-500 border border-transparent"
              )}
              style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
            >
              <Icon className="h-4 w-4" />
              {navItem?.label ?? config.label}
            </Link>
          );
        })}

        {/* Security folder */}
        {hasSecurityAccess && (
          <div>
            <button
              onClick={() => setSecurityOpen((p) => !p)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                securityActive ? "text-blue-600" : "text-gray-500 hover:bg-gray-100 hover:text-blue-500",
                "border border-transparent"
              )}
              style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
            >
              <Lock className="h-4 w-4" />
              Security
              <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform duration-200", securityOpen ? "rotate-0" : "-rotate-90")} />
            </button>

            {securityOpen && (
              <div className="ml-4 mt-0.5 space-y-0.5 border-l border-gray-100 pl-2">
                {pageSet.has("users") && (
                  <SubNavLink href="/dashboard/users" icon={Users} label="Users" pathname={pathname} onNavigate={onNavigate} />
                )}
                {pageSet.has("roles") && (
                  <>
                    <SubNavLink href="/dashboard/roles" icon={Shield} label="Roles" pathname={pathname} onNavigate={onNavigate} />
                    <SubNavLink href="/dashboard/policies" icon={FileKey} label="Policies" pathname={pathname} onNavigate={onNavigate} />
                  </>
                )}
                {pageSet.has("apps") && (
                  <SubNavLink href="/dashboard/apps" icon={KeyRound} label="API Apps" pathname={pathname} onNavigate={onNavigate} />
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
                studioActive ? "text-blue-600" : "text-gray-500 hover:bg-gray-100 hover:text-blue-500",
                "border border-transparent"
              )}
              style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
            >
              <FlaskConical className="h-4 w-4" />
              Studio
              <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform duration-200", studioOpen ? "rotate-0" : "-rotate-90")} />
            </button>

            {studioOpen && (
              <div className="ml-4 mt-0.5 space-y-0.5 border-l border-gray-100 pl-2">
                {visibleStudioPages.map((pageSlug) => {
                  const config = PAGE_CONFIG[pageSlug];
                  if (!config) return null;
                  const Icon = config.Icon;
                  const isActive = pathname.startsWith(config.href);
                  return (
                    <Link
                      key={pageSlug}
                      href={config.href}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-200",
                        isActive
                          ? "bg-blue-50 text-blue-600 border border-gray-300"
                          : "text-gray-500 hover:bg-gray-100 hover:text-blue-500 border border-transparent"
                      )}
                      style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {config.label}
                    </Link>
                  );
                })}
                {/* Nav management link (only if user has roles access) */}
                {pageSet.has("roles") && (
                  <SubNavLink href="/dashboard/nav" icon={Map} label="Nav Management" pathname={pathname} onNavigate={onNavigate} />
                )}
              </div>
            )}
          </div>
        )}

        {/* Dynamic collections section */}
        {hasCollections && (
          <div className="pt-2">
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-blue-500/40 flex items-center gap-2">
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

      {/* Footer */}
      <div className="p-3 border-t border-gray-200">
        <div className="text-xs text-gray-400 text-center" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
          v1.0 Quantum
        </div>
      </div>
    </aside>
  );
}
