# PulseBox ERP-OS — Phase 1.5 Design Spec

> **Status:** Ready for implementation
> **Date:** 2026-03-28
> **Scope:** Task Inbox + Notification Bell

---

## Context

Phase 1 shipped App Bundle Model + Rule Engine v1. Phase 1.5 adds the foundational notification layer that future workflow approvals (Phase 2) and ERP apps (Phase 3+) will depend on. It is intentionally narrow: a persistent `tasks` table, a bell icon in the header showing unread count, and a dropdown inbox panel. No workflow engine yet — just the ability to create and read tasks/notifications programmatically.

## Full Roadmap

```
Phase 1   — App Bundle Model + Rule Engine v1                ✅ done
Phase 1.5 — Task Inbox / Notifications (this spec)
Phase 2   — Workflow Engine (approval nodes, multi-level)
Phase 3   — First ERP Apps (Workforce, Leave, Clocking)
Phase 4   — Finance Apps (Expense, Books/Journal, GL)
Phase 5   — Script Layer + Marketplace
```

---

## What Phase 1.5 Delivers

1. **`tasks` DB table** — tenant-scoped, user-targeted notifications and actionable tasks
2. **Bell icon in header** — unread count badge, opens dropdown panel
3. **Inbox dropdown panel** — lists recent tasks, mark-as-read, optional action link
4. **Task creation API** — `POST /api/tasks` for internal services to create tasks
5. **Task management API** — `GET /api/tasks`, `PATCH /api/tasks/:id` (mark read/done)

---

## Data Model

### `tasks` table

| Column       | Type         | Description |
|-------------|--------------|-------------|
| id          | UUID PK      | |
| tenant_id   | UUID FK      | Scoped to tenant |
| user_id     | UUID FK NULL | Target user (NULL = all tenant users) |
| type        | TEXT         | `notification`, `approval`, `reminder`, `alert` |
| title       | TEXT         | Short summary, shown in bell dropdown |
| body        | TEXT NULL    | Optional longer description |
| action_url  | TEXT NULL    | Link to relevant record/page (e.g. `/dashboard/studio/collections/employees/items/uuid`) |
| action_label | TEXT NULL   | Button label for action_url (e.g. "Review") |
| status      | TEXT         | `unread`, `read`, `done` |
| priority    | TEXT         | `low`, `normal`, `high` |
| source      | TEXT NULL    | What created it: `system`, `rule`, `workflow`, `manual` |
| source_id   | UUID NULL    | ID of the triggering entity (e.g. rule_id, workflow_step_id) |
| created_at  | TIMESTAMPTZ  | |
| read_at     | TIMESTAMPTZ NULL | When user marked read |

### RLS

- Users read tasks where `user_id = auth.uid()` OR `user_id IS NULL` (broadcast to all tenant users) AND `tenant_id = current_tenant`
- `super_admin` reads all tasks
- Insert: server-side only (service role) — users cannot create their own tasks
- Update: user can update `status` and `read_at` on their own tasks

---

## API

### `GET /api/tasks`
- Query params: `?status=unread`, `?limit=20`, `?offset=0`
- Returns tasks for current user in current tenant, newest first
- Also returns `unread_count` in response envelope

### `POST /api/tasks` _(internal / super_admin only)_
- Creates a task for a user or broadcast (user_id: null)
- Body: `{ tenant_id, user_id?, type, title, body?, action_url?, action_label?, priority?, source?, source_id? }`

### `PATCH /api/tasks/:id`
- Allowed fields: `status` (`read` | `done`), sets `read_at` automatically
- User can only update their own tasks

### `POST /api/tasks/mark-all-read`
- Marks all `unread` tasks as `read` for current user + tenant

---

## Header Bell Icon

**Location:** `src/components/header.tsx` — added between `<LanguageSwitcher />` and `<DropdownMenu>` (avatar)

**Component:** `<NotificationBell />` — client component in `src/components/notification-bell.tsx`

**Behaviour:**
- On mount: fetches `GET /api/tasks?status=unread&limit=1` to get `unread_count`
- Shows `<Bell />` icon from lucide-react
- If `unread_count > 0`: shows a red badge with count (capped at `99+`)
- Click: opens dropdown panel (not a page navigation)
- Polling: re-fetches every 60 seconds (simple interval, no WebSocket in Phase 1.5)

---

## Inbox Dropdown Panel

Rendered inside `NotificationBell` as a `<Popover>` (shadcn/ui).

**Panel layout:**
```
┌─────────────────────────────────────┐
│ Notifications          Mark all read │
├─────────────────────────────────────┤
│ 🔴 [title]              2 min ago   │
│    [body truncated to 1 line]        │
│                        [Review →]   │
├─────────────────────────────────────┤
│ ✓  [title]              1 hr ago    │
│    [body]                           │
├─────────────────────────────────────┤
│           View all →                │
└─────────────────────────────────────┘
```

- Shows last 10 tasks (mixed statuses)
- Clicking a task row marks it as `read` (PATCH) and navigates to `action_url` if set
- "Mark all read" button hits `POST /api/tasks/mark-all-read`
- "View all →" links to `/dashboard/tasks` (full inbox page)

---

## Full Inbox Page

**Route:** `/dashboard/tasks`

Server component at `src/app/dashboard/tasks/page.tsx`

**Layout:**
- Tab filters: All | Unread | Done
- Table: title, type badge, priority, source, created_at, action button
- Matches existing table convention (20-row pagination, `bg-white`/`bg-gray-50` alternating rows)
- No sidebar entry needed (accessible via "View all →" from bell only, or direct URL)

---

## Migration

File: `supabase/migrations/00048_tasks.sql`

- Creates `tasks` table with indexes on `(tenant_id, user_id, status)` and `(tenant_id, created_at DESC)`
- RLS policies as described above
- No seed data needed

---

## What Phase 1.5 Does NOT Include

- Real-time WebSocket push (Supabase Realtime) — deferred to Phase 2
- Email / push notifications — deferred
- Task assignment between users — deferred (workflow handles this)
- Snooze / reminder scheduling — deferred
- In-app notification preferences — deferred
- Sidebar nav entry for Tasks — deferred (accessed from bell only)

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `supabase/migrations/00048_tasks.sql` | New — tasks table + RLS |
| `src/app/api/tasks/route.ts` | New — GET (list) + POST (create) |
| `src/app/api/tasks/[id]/route.ts` | New — PATCH (mark read/done) |
| `src/app/api/tasks/mark-all-read/route.ts` | New — POST mark all read |
| `src/components/notification-bell.tsx` | New — bell icon + dropdown panel |
| `src/app/dashboard/tasks/page.tsx` | New — full inbox page |
| `src/components/header.tsx` | Modify — add `<NotificationBell />` |
| `src/app/dashboard/layout.tsx` | Modify — pass nothing extra (bell fetches its own data) |

---

## Success Criteria

1. Bell icon appears in header for all authenticated users
2. Unread count badge updates within 60 seconds of a new task being created
3. Clicking bell shows last 10 tasks in dropdown; clicking a task marks it read and navigates to its action URL
4. "Mark all read" clears the badge
5. Full inbox page shows all tasks with filter tabs
6. `POST /api/tasks` (service role) successfully creates tasks that appear in the bell
7. `npm run build` passes clean
