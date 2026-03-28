# Phase 1.5 — Task Inbox + Notification Bell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent `tasks` table, a bell icon in the header with unread-count badge, a dropdown inbox panel, a full inbox page, and the REST API backing them.

**Architecture:** Server-side API routes handle CRUD (using `resolveApiContext` for auth, admin client for DB); `NotificationBell` is a client component that polls every 60s via `fetch` with the user's Supabase session token; the full inbox page is a server component following the existing table/pagination pattern.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + RLS), shadcn/ui Popover (new), lucide-react `Bell` icon, existing `resolveApiContext` / `apiErr` utilities.

---

## File Map

| File | Action |
|------|--------|
| `supabase/migrations/00048_tasks.sql` | Create — tasks table + indexes + RLS |
| `src/app/api/tasks/route.ts` | Create — GET (list + unread_count) + POST (create, internal only) |
| `src/app/api/tasks/[id]/route.ts` | Create — PATCH (mark read/done) |
| `src/app/api/tasks/mark-all-read/route.ts` | Create — POST (mark all unread → read) |
| `src/components/notification-bell.tsx` | Create — bell icon + Popover dropdown |
| `src/app/dashboard/tasks/page.tsx` | Create — full inbox server page with tab filters |
| `src/components/task-tab-filter.tsx` | Create — client tab switcher (All / Unread / Done) |
| `src/components/header.tsx` | Modify — add `<NotificationBell tenantId={...} />` |

---

## Task 1: Migration — `tasks` table

**Files:**
- Create: `supabase/migrations/00048_tasks.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/00048_tasks.sql

CREATE TABLE public.tasks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id      UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  type         TEXT        NOT NULL CHECK (type IN ('notification','approval','reminder','alert')),
  title        TEXT        NOT NULL,
  body         TEXT,
  action_url   TEXT,
  action_label TEXT,
  status       TEXT        NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read','done')),
  priority     TEXT        NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  source       TEXT        CHECK (source IN ('system','rule','workflow','manual')),
  source_id    UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at      TIMESTAMPTZ
);

-- Performance indexes
CREATE INDEX idx_tasks_tenant_user_status ON public.tasks (tenant_id, user_id, status);
CREATE INDEX idx_tasks_tenant_created     ON public.tasks (tenant_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- SELECT: own tasks + broadcast (user_id IS NULL), scoped to user's tenants
CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND is_active = true
    )
    AND (user_id = auth.uid() OR user_id IS NULL)
  );

-- INSERT: blocked for regular auth users (service role bypasses RLS)
CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT WITH CHECK (false);

-- UPDATE: user can update their own tasks only
CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE USING (
    user_id = auth.uid()
    AND tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push --linked
```

Expected: `Applying migration 00048_tasks.sql... done`

- [ ] **Step 3: Verify table exists in Supabase dashboard**

Open Supabase > Table Editor > `tasks`. Confirm columns match the schema above.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00048_tasks.sql
git commit -m "feat: add tasks table with RLS for Phase 1.5 notification system"
```

---

## Task 2: Install Popover component

**Files:**
- (installs to `src/components/ui/popover.tsx`)

- [ ] **Step 1: Add Popover via shadcn CLI**

```bash
npx shadcn@latest add popover
```

Expected output includes: `✔ Installing dependencies.` and `✔ Created 1 file: src/components/ui/popover.tsx`

- [ ] **Step 2: Verify file exists**

```bash
ls src/components/ui/popover.tsx
```

Expected: file listed.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/popover.tsx
git commit -m "chore: add shadcn Popover component"
```

---

## Task 3: API — GET + POST `/api/tasks`

**Files:**
- Create: `src/app/api/tasks/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
// src/app/api/tasks/route.ts
import { NextRequest } from "next/server";
import { resolveApiContext, apiErr } from "../_lib/api-auth";

/**
 * GET /api/tasks
 * Query params: status?, limit?, offset?
 * Returns tasks for the current user (or all tenant tasks for app-credential auth).
 * Also returns unread_count in the response envelope.
 */
export async function GET(request: NextRequest) {
  const auth = await resolveApiContext(request);
  if (!auth.ok) return auth.response;
  const { db, tenantId, userId, authMode } = auth.ctx;

  const sp = request.nextUrl.searchParams;
  const status = sp.get("status") ?? null;
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit") ?? 20)));
  const offset = Math.max(0, Number(sp.get("offset") ?? 0));

  let query = db
    .from("tasks")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  // User auth: filter to own + broadcast tasks
  if (authMode === "user" && userId) {
    query = query.or(`user_id.eq.${userId},user_id.is.null`);
  }

  if (status) query = query.eq("status", status);

  const { data, count, error } = await query;
  if (error) return apiErr(error.message, 500);

  // Unread count — only meaningful for user auth
  let unreadCount = 0;
  if (authMode === "user" && userId) {
    const { count: uc } = await db
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .or(`user_id.eq.${userId},user_id.is.null`)
      .eq("status", "unread");
    unreadCount = uc ?? 0;
  }

  return Response.json(
    { data: data ?? [], total: count ?? 0, unread_count: unreadCount },
    { headers: auth.ctx.rlHeaders }
  );
}

/**
 * POST /api/tasks
 * Internal use only — app credentials or super_admin users.
 * Body: { tenant_id, user_id?, type, title, body?, action_url?, action_label?, priority?, source?, source_id? }
 */
export async function POST(request: NextRequest) {
  const auth = await resolveApiContext(request);
  if (!auth.ok) return auth.response;
  const { db, tenantId, userId, authMode } = auth.ctx;

  // Restrict to app credentials or super_admin
  if (authMode === "user" && userId) {
    const { data: membership } = await db
      .from("tenant_users")
      .select("roles(slug)")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle();
    const rolesRaw = membership?.roles as { slug: string } | { slug: string }[] | null;
    const roleSlug = Array.isArray(rolesRaw) ? rolesRaw[0]?.slug : rolesRaw?.slug;
    if (roleSlug !== "super_admin") return apiErr("Forbidden — super_admin or app credentials required", 403);
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return apiErr("Invalid JSON body"); }

  const taskTenantId = (body.tenant_id as string | undefined) ?? tenantId;
  const type = body.type as string | undefined;
  const title = (body.title as string | undefined)?.trim();

  if (!type || !["notification","approval","reminder","alert"].includes(type))
    return apiErr("type must be one of: notification, approval, reminder, alert");
  if (!title) return apiErr("title is required");

  const { data: task, error } = await db
    .from("tasks")
    .insert({
      tenant_id:    taskTenantId,
      user_id:      (body.user_id as string | undefined) ?? null,
      type,
      title,
      body:         (body.body as string | undefined) ?? null,
      action_url:   (body.action_url as string | undefined) ?? null,
      action_label: (body.action_label as string | undefined) ?? null,
      status:       "unread",
      priority:     (body.priority as string | undefined) ?? "normal",
      source:       (body.source as string | undefined) ?? null,
      source_id:    (body.source_id as string | undefined) ?? null,
    })
    .select()
    .single();

  if (error) return apiErr(error.message, 500);
  return Response.json({ data: task }, { status: 201, headers: auth.ctx.rlHeaders });
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build 2>&1 | tail -20
```

Expected: `Route (app)` table shows `/api/tasks` with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tasks/route.ts
git commit -m "feat: add GET + POST /api/tasks route"
```

---

## Task 4: API — PATCH `/api/tasks/[id]`

**Files:**
- Create: `src/app/api/tasks/[id]/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
// src/app/api/tasks/[id]/route.ts
import { NextRequest } from "next/server";
import { resolveApiContext, apiErr } from "../../_lib/api-auth";

/**
 * PATCH /api/tasks/:id
 * Allowed fields: status ("read" | "done")
 * Sets read_at automatically when status → "read".
 * User can only update their own tasks.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await resolveApiContext(request);
  if (!auth.ok) return auth.response;
  const { db, tenantId, userId } = auth.ctx;

  const { id } = await params;

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return apiErr("Invalid JSON body"); }

  const status = body.status as string | undefined;
  if (!status || !["read","done"].includes(status))
    return apiErr("status must be 'read' or 'done'");

  // Fetch the task first to verify ownership
  const { data: existing, error: fetchErr } = await db
    .from("tasks")
    .select("id, user_id, tenant_id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (fetchErr) return apiErr(fetchErr.message, 500);
  if (!existing) return apiErr("Task not found", 404);

  // Only the target user (or broadcasts) can be updated by this user
  if (existing.user_id !== null && existing.user_id !== userId)
    return apiErr("Forbidden", 403);

  const updates: Record<string, unknown> = { status };
  if (status === "read") updates.read_at = new Date().toISOString();

  const { data: updated, error: updateErr } = await db
    .from("tasks")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (updateErr) return apiErr(updateErr.message, 500);
  return Response.json({ data: updated }, { headers: auth.ctx.rlHeaders });
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build 2>&1 | tail -20
```

Expected: `/api/tasks/[id]` appears in the route table with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tasks/[id]/route.ts
git commit -m "feat: add PATCH /api/tasks/[id] — mark task read/done"
```

---

## Task 5: API — POST `/api/tasks/mark-all-read`

**Files:**
- Create: `src/app/api/tasks/mark-all-read/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
// src/app/api/tasks/mark-all-read/route.ts
import { NextRequest } from "next/server";
import { resolveApiContext, apiErr } from "../../_lib/api-auth";

/**
 * POST /api/tasks/mark-all-read
 * Marks all unread tasks as read for the current user in the current tenant.
 */
export async function POST(request: NextRequest) {
  const auth = await resolveApiContext(request);
  if (!auth.ok) return auth.response;
  const { db, tenantId, userId } = auth.ctx;

  if (!userId) return apiErr("User auth required", 401);

  const now = new Date().toISOString();

  const { error } = await db
    .from("tasks")
    .update({ status: "read", read_at: now })
    .eq("tenant_id", tenantId)
    .or(`user_id.eq.${userId},user_id.is.null`)
    .eq("status", "unread");

  if (error) return apiErr(error.message, 500);

  return Response.json({ success: true }, { headers: auth.ctx.rlHeaders });
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build 2>&1 | tail -20
```

Expected: `/api/tasks/mark-all-read` appears in the route table with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tasks/mark-all-read/route.ts
git commit -m "feat: add POST /api/tasks/mark-all-read route"
```

---

## Task 6: `NotificationBell` component

**Files:**
- Create: `src/components/notification-bell.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/notification-bell.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface Task {
  id: string;
  title: string;
  body: string | null;
  action_url: string | null;
  action_label: string | null;
  status: "unread" | "read" | "done";
  created_at: string;
}

interface NotificationBellProps {
  tenantId: string;
}

export function NotificationBell({ tenantId }: NotificationBellProps) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState(false);

  const getHeaders = useCallback(async (): Promise<HeadersInit | null> => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    return {
      Authorization: `Bearer ${session.access_token}`,
      "X-Tenant-Id": tenantId,
    };
  }, [tenantId]);

  const fetchTasks = useCallback(async () => {
    const headers = await getHeaders();
    if (!headers) return;

    const res = await fetch("/api/tasks?limit=10", { headers });
    if (!res.ok) return;
    const json = await res.json();
    setTasks(json.data ?? []);
    setUnreadCount(json.unread_count ?? 0);
  }, [getHeaders]);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 60_000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  async function handleTaskClick(task: Task) {
    const headers = await getHeaders();
    if (!headers) return;

    // Only PATCH if currently unread
    if (task.status === "unread") {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "read" }),
      });
      await fetchTasks();
    }

    if (task.action_url) {
      setOpen(false);
      router.push(task.action_url);
    }
  }

  async function handleMarkAllRead() {
    setMarking(true);
    const headers = await getHeaders();
    if (headers) {
      await fetch("/api/tasks/mark-all-read", { method: "POST", headers });
      await fetchTasks();
    }
    setMarking(false);
  }

  function relativeTime(dateStr: string): string {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        >
          <Bell className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold text-white leading-none">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-80 p-0 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
      >
        {/* Header row */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <span
            className="text-sm font-semibold text-gray-900 dark:text-gray-100"
            style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
          >
            Notifications
          </span>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={marking}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 transition-opacity"
            >
              Mark all read
            </button>
          )}
        </div>

        {/* Task list */}
        <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
          {tasks.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-10 text-sm">
              No notifications
            </p>
          ) : (
            tasks.map((task) => (
              <div
                key={task.id}
                onClick={() => handleTaskClick(task)}
                className={`px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                  task.status === "unread" ? "bg-blue-50/50 dark:bg-blue-950/20" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  {task.status === "unread" && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate"
                        style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
                      >
                        {task.title}
                      </p>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap shrink-0 mt-0.5">
                        {relativeTime(task.created_at)}
                      </span>
                    </div>
                    {task.body && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        {task.body}
                      </p>
                    )}
                    {task.action_label && task.action_url && (
                      <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                        {task.action_label} →
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-center">
          <button
            onClick={() => { setOpen(false); router.push("/dashboard/tasks"); }}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            View all →
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build 2>&1 | tail -20
```

Expected: No TypeScript errors related to `notification-bell.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/notification-bell.tsx
git commit -m "feat: add NotificationBell component with Popover dropdown"
```

---

## Task 7: Wire bell into header

**Files:**
- Modify: `src/components/header.tsx`

The bell needs `tenantId` (already available as `currentTenantId` prop in Header).

- [ ] **Step 1: Add import at top of `src/components/header.tsx`**

Find the existing imports block and add:

```typescript
import { NotificationBell } from "@/components/notification-bell";
```

(Add after the `import { LanguageSwitcher }` line.)

- [ ] **Step 2: Render bell in the right-side controls**

Find this block in the JSX (around line 121):
```tsx
{/* Right: theme toggle + language switcher + avatar dropdown */}
<div className="flex items-center gap-1">
  <ThemeToggle />
  <LanguageSwitcher />
  <DropdownMenu>
```

Replace with:
```tsx
{/* Right: theme toggle + language switcher + bell + avatar dropdown */}
<div className="flex items-center gap-1">
  <ThemeToggle />
  <LanguageSwitcher />
  {currentTenantId && <NotificationBell tenantId={currentTenantId} />}
  <DropdownMenu>
```

- [ ] **Step 3: Verify build passes**

```bash
npm run build 2>&1 | tail -20
```

Expected: No errors. The `NotificationBell` is only rendered when `currentTenantId` is non-null (which is always true for logged-in users in a tenant).

- [ ] **Step 4: Manual smoke test**

```
1. Run: npm run dev
2. Open http://localhost:3000/dashboard
3. Confirm a Bell icon appears in the header between the language switcher and avatar
4. Confirm clicking the bell opens a "Notifications" popover (empty state: "No notifications")
5. Confirm polling doesn't throw console errors
```

- [ ] **Step 5: Commit**

```bash
git add src/components/header.tsx
git commit -m "feat: wire NotificationBell into dashboard header"
```

---

## Task 8: `TaskTabFilter` client component

**Files:**
- Create: `src/components/task-tab-filter.tsx`

This is a small client component used by the tasks page for tab-based filtering via URL params.

- [ ] **Step 1: Create the component**

```typescript
// src/components/task-tab-filter.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

const TABS = [
  { label: "All",    value: "" },
  { label: "Unread", value: "unread" },
  { label: "Done",   value: "done" },
] as const;

interface TaskTabFilterProps {
  activeStatus: string;
}

export function TaskTabFilter({ activeStatus }: TaskTabFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function navigate(status: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", "1");
    if (status) {
      params.set("status", status);
    } else {
      params.delete("status");
    }
    router.push(`/dashboard/tasks?${params.toString()}`);
  }

  return (
    <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-100 p-1 w-fit">
      {TABS.map((tab) => {
        const isActive = activeStatus === tab.value;
        return (
          <button
            key={tab.value}
            onClick={() => navigate(tab.value)}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
              isActive
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
            style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | grep -i "task-tab\|error" | head -10
```

Expected: No errors for `task-tab-filter.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/task-tab-filter.tsx
git commit -m "feat: add TaskTabFilter client component for inbox page"
```

---

## Task 9: Full Inbox Page `/dashboard/tasks`

**Files:**
- Create: `src/app/dashboard/tasks/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
// src/app/dashboard/tasks/page.tsx
import { getUser } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Bell } from "lucide-react";
import { PAGE_SIZE, buildGridParams, type GridConfig } from "@/lib/data-grid";
import { TablePagination } from "@/components/table-pagination";
import { TaskTabFilter } from "@/components/task-tab-filter";
import { Suspense } from "react";

const gridConfig: GridConfig = {
  sortable: [
    { field: "created_at", defaultDir: "desc" },
    { field: "title", defaultDir: "asc" },
  ],
  filterable: [],
};

const TYPE_COLORS: Record<string, string> = {
  notification: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  approval:     "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  reminder:     "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  alert:        "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

const PRIORITY_COLORS: Record<string, string> = {
  high:   "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  normal: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  low:    "bg-gray-50 text-gray-400 dark:bg-gray-900 dark:text-gray-500",
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) return null;

  const tenantId = await resolveTenant(user.id);
  if (!tenantId) return null;

  const sp = await searchParams;
  const { page, ascending } = buildGridParams(
    sp as Record<string, string | string[] | undefined>,
    gridConfig
  );

  const statusFilter = typeof sp.status === "string" ? sp.status : "";

  const db = createAdminClient();
  let q = db
    .from("tasks")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId)
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .order("created_at", { ascending })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (statusFilter) q = q.eq("status", statusFilter);

  const { data: tasks, count } = await q;
  const rows = tasks ?? [];
  const totalItems = count ?? 0;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          <div>
            <h1
              className="text-xl font-bold text-gray-900 dark:text-gray-100"
              style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
            >
              Task Inbox
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Notifications, approvals, and reminders for your account.
            </p>
          </div>
        </div>
      </div>

      {/* Tab filters */}
      <Suspense>
        <TaskTabFilter activeStatus={statusFilter} />
      </Suspense>

      {/* Table */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-100 dark:bg-gray-800">
            <TableRow className="border-gray-200 dark:border-gray-700 hover:bg-transparent">
              <TableHead className="text-gray-500 dark:text-gray-400">Title</TableHead>
              <TableHead className="text-gray-500 dark:text-gray-400">Type</TableHead>
              <TableHead className="text-gray-500 dark:text-gray-400">Priority</TableHead>
              <TableHead className="text-gray-500 dark:text-gray-400">Source</TableHead>
              <TableHead className="text-gray-500 dark:text-gray-400">Status</TableHead>
              <TableHead className="text-gray-500 dark:text-gray-400">Created</TableHead>
              <TableHead className="text-gray-500 dark:text-gray-400 w-24">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-gray-500 dark:text-gray-400 py-10">
                  No tasks found
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, i) => (
                <TableRow
                  key={row.id}
                  className={`border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                    i % 2 === 0
                      ? "bg-white dark:bg-gray-900"
                      : "bg-gray-50 dark:bg-gray-800/30"
                  } ${row.status === "unread" ? "font-medium" : ""}`}
                >
                  <TableCell className="text-gray-900 dark:text-gray-100 max-w-xs">
                    <div>
                      <p className="truncate">{row.title}</p>
                      {row.body && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                          {row.body}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                        TYPE_COLORS[row.type] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {row.type}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                        PRIORITY_COLORS[row.priority] ?? ""
                      }`}
                    >
                      {row.priority}
                    </span>
                  </TableCell>
                  <TableCell className="text-gray-500 dark:text-gray-400 text-sm">
                    {row.source ?? "—"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                        row.status === "unread"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                          : row.status === "done"
                          ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                      }`}
                    >
                      {row.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-gray-500 dark:text-gray-400 text-sm whitespace-nowrap">
                    {formatDate(row.created_at)}
                  </TableCell>
                  <TableCell>
                    {row.action_url && (
                      <a
                        href={row.action_url}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                      >
                        {row.action_label ?? "View"} →
                      </a>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <TablePagination page={page} totalPages={totalPages} totalItems={totalItems} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build 2>&1 | tail -30
```

Expected: `/dashboard/tasks` appears in the route table as a static/dynamic page with no TypeScript errors.

- [ ] **Step 3: Manual smoke test**

```
1. Run: npm run dev
2. Open http://localhost:3000/dashboard/tasks
3. Confirm the page renders with the Bell icon header, tab filter row, and empty table
4. Confirm the "All / Unread / Done" tabs render and clicking them changes the URL ?status= param
5. Confirm "View all →" in the bell dropdown navigates here
```

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/tasks/page.tsx src/components/task-tab-filter.tsx
git commit -m "feat: add full Task Inbox page at /dashboard/tasks"
```

---

## Task 10: End-to-end smoke test + final build

- [ ] **Step 1: Create a test task via API**

With the dev server running, call the POST endpoint using a Supabase service role JWT (or via the Supabase dashboard SQL editor as a workaround):

```sql
-- Run in Supabase SQL editor (replaces API call for smoke testing)
INSERT INTO public.tasks (tenant_id, user_id, type, title, body, action_url, action_label, status, priority, source)
SELECT
  t.id,
  NULL,  -- broadcast to all users
  'notification',
  'Welcome to Task Inbox',
  'Phase 1.5 is live. Tasks and notifications are now available.',
  '/dashboard/tasks',
  'View Inbox',
  'unread',
  'normal',
  'system'
FROM public.tenants t
LIMIT 1;
```

- [ ] **Step 2: Verify bell badge appears**

```
1. Reload http://localhost:3000/dashboard
2. Confirm the Bell icon shows a red badge with "1"
3. Click the bell — confirm the "Welcome to Task Inbox" task appears in the dropdown
4. Click the task row — confirm it navigates to /dashboard/tasks and the badge clears (or decrements)
5. Click "Mark all read" — confirm badge disappears
```

- [ ] **Step 3: Final production build**

```bash
npm run build
```

Expected: Exit code 0, no TypeScript errors, all routes compiled successfully.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Phase 1.5 complete — Task Inbox + Notification Bell"
```

---

## Success Criteria Checklist

- [ ] Bell icon visible in header for all authenticated users
- [ ] Unread count badge updates within 60 seconds of a new task being inserted
- [ ] Clicking bell shows last 10 tasks in dropdown; clicking a task marks it read and navigates to its `action_url`
- [ ] "Mark all read" clears the badge
- [ ] Full inbox page shows tasks with All / Unread / Done tab filters and 20-row pagination
- [ ] `POST /api/tasks` (app credentials or super_admin) creates tasks that appear in the bell
- [ ] `npm run build` passes clean
