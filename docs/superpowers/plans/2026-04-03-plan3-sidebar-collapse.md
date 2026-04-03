# Sidebar Collapse/Expand — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapse toggle to the desktop sidebar so it narrows to icon-only (~56px), with hover-to-expand and localStorage persistence.

**Architecture:** Collapse state lives in `DashboardShell` and is passed to `Sidebar`. The sidebar uses Tailwind group and transition classes for smooth animation. Mobile sidebar is unchanged.

**Tech Stack:** Next.js 15, React, Tailwind CSS v4

---

### Task 1: Add collapse state and toggle to DashboardShell

**Files:**
- Modify: `src/components/dashboard-shell.tsx`
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Thread collapsed state from DashboardShell to Sidebar**

In `src/components/dashboard-shell.tsx`, add collapsed state initialised from localStorage:

```tsx
"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { NavFolder, NavItem } from "@/lib/services/nav.service";

interface CollectionInfo { id: string; name: string; slug: string; type: string; icon: string | null; }

interface DashboardShellProps {
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
  accessiblePages: string[];
  rootFolders: NavFolder[];
  rootItems: NavItem[];
  collectionMap: Map<string, CollectionInfo>;
  children: React.ReactNode;
}

export function DashboardShell({
  userEmail, userName, userRole, userId, userTimezone, avatarUrl, tenants, currentTenantId, isSuperAdmin, isSuperTenant,
  accessiblePages, rootFolders, rootItems, collectionMap,
  children,
}: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Load persisted preference after mount (avoid SSR mismatch)
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
```

- [ ] **Step 2: Update Sidebar props interface to accept collapsed and onToggleCollapse**

In `src/components/sidebar.tsx`, update the `SidebarProps` interface (around line 56):

```tsx
interface SidebarProps {
  accessiblePages: string[];
  rootFolders: NavFolder[];
  rootItems: NavItem[];
  collectionMap: Map<string, CollectionInfo>;
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}
```

Update the `Sidebar` function signature to destructure the new props:

```tsx
export function Sidebar({
  accessiblePages, rootFolders, rootItems, collectionMap, onNavigate,
  collapsed = false, onToggleCollapse,
}: SidebarProps) {
```

- [ ] **Step 3: Apply collapsed width and transition to the sidebar aside element**

In the `Sidebar` function, update the `<aside>` element (around line 279) to apply dynamic width:

```tsx
<aside
  className={cn(
    "group/sidebar flex h-full flex-col border-r bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 dark:bg-gray-900 transition-all duration-200",
    collapsed ? "w-14" : "w-64"
  )}
>
```

- [ ] **Step 4: Hide text labels when collapsed**

Throughout the sidebar, any `<span>` that renders text labels needs to be hidden when collapsed. Use conditional rendering based on `collapsed`:

In the logo area (around line 281), hide the text when collapsed:

```tsx
{/* Logo */}
<div className="flex h-14 items-center border-b border-gray-200 dark:border-gray-700 px-4">
  <Link
    href="/dashboard"
    onClick={onNavigate}
    className={cn(
      "text-lg font-bold text-blue-600 dark:text-blue-400 tracking-tight transition-opacity duration-200",
      collapsed && "hidden"
    )}
  >
    PulseBox
  </Link>
  {collapsed && (
    <span className="text-lg font-bold text-blue-600 dark:text-blue-400">P</span>
  )}
</div>
```

For nav links, wrap each `<span className="truncate">` with a conditional:

```tsx
{!collapsed && <span className="truncate">{label}</span>}
```

Apply this pattern to:
- `NavFolderNode` — hide folder name and chevron when `collapsed` is passed down
- `NavItemNode` — hide item label
- `SubNavLink` — hide label
- Fixed top-level page links — hide label

**Note:** `NavFolderNode` and `NavItemNode` need `collapsed` threaded through as a prop. Update their prop types to include `collapsed?: boolean`.

- [ ] **Step 5: Add collapse toggle button at the bottom of the sidebar**

Add a collapse toggle button inside the `<aside>`, after the `<nav>` block:

```tsx
{/* Collapse toggle */}
{onToggleCollapse && (
  <div className="border-t border-gray-200 dark:border-gray-700 p-2 flex justify-center">
    <button
      onClick={onToggleCollapse}
      className="flex items-center justify-center h-8 w-8 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
    >
      {collapsed ? (
        <ChevronRight className="h-4 w-4" />
      ) : (
        <ChevronLeft className="h-4 w-4" />
      )}
    </button>
  </div>
)}
```

Add `ChevronLeft` and `ChevronRight` to the lucide-react imports at the top of `sidebar.tsx`.

- [ ] **Step 6: Build check**

```bash
cd c:/Projects/claude/pulsebox && npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
cd c:/Projects/claude/pulsebox
git add src/components/sidebar.tsx src/components/dashboard-shell.tsx
git commit -m "feat: add collapsible sidebar with icon-only mode and localStorage persistence"
```
