# TASKS.md — Active Work Log

> Keep track of active and completed tasks.
> Update this when starting/finishing a task so you have continuity across sessions.
> Keep it short — only active and recently completed work.

---

## How to Use

**When starting a task:**
> "Check TASKS.md for current context before starting."

**When finishing a task:**
> "Update TASKS.md to log what was done and what's next."

---

## Current Status

_Last updated: 2026-03-18_

### In Progress

_None — awaiting user decisions on complex bugs (see docs/BUG_FIX_PLAN.md)_

### Recently Completed

- **API App Credentials (18 Mar 26)** — dual-mode API auth: app credentials + user tokens
  - Migration `00023_tenant_apps.sql` — `tenant_apps` table with RLS, seeded RBAC page permissions + nav items
  - `POST /api/auth/token` — exchange `app_id` + `app_secret` for short-lived JWT (1hr, HS256)
  - `src/app/api/_lib/jwt.ts` — JWT sign/verify helpers using `jose` library
  - `src/app/api/_lib/api-auth.ts` — `resolveApiContext()` now supports dual-mode:
    - Mode A (app): Bearer JWT from `/api/auth/token` — tenant embedded, no `X-Tenant-Id` needed
    - Mode B (user): Supabase user token + `X-Tenant-Id` header (unchanged, backward compatible)
  - `ApiContext` type: `userId` now `string | null`, added `appId` and `authMode` fields
  - `src/app/actions/apps.ts` — server actions: `createApp`, `rotateAppSecret`, `toggleApp`, `deleteApp`, `getApps`
  - `src/app/dashboard/apps/page.tsx` — API Apps management page (table with create/rotate/deactivate/delete)
  - `src/components/create-app-dialog.tsx` — create app + show credentials once
  - `src/components/app-actions.tsx` — 3-dot menu (rotate secret, activate/deactivate, delete)
  - Sidebar: "API Apps" under Security folder, route `/dashboard/apps` guarded by `apps` page permission
  - `/developer` page: rewrote auth docs — Method A (app credentials, recommended) + Method B (user token)
  - Added `/api/auth/token` to endpoint reference
  - TypeScript clean (`tsc --noEmit` passes)
  - **Pending**: run migration `npx supabase db push --linked`


- **Bug Fix Session (18 Mar 26)** — resolved 7 issues from bug report PDF
  - Bug 1a: Removed star icon from "Current Tenant" section in header dropdown
  - Bug 1b: Toast now says "Default tenant updated to 'TenantName'" (includes name)
  - Bug 1c: Added `router.refresh()` after successful setDefaultTenant so star updates
  - Bug 3: Added "Edit Permissions" to PolicyActions (3-dot menu); created `/dashboard/policies/[id]` detail page using `PolicyPermissionsEditor`
  - Bug 4a: File cells in collection item grid now show filename (last path segment) instead of raw UUID path
  - Bug 4b: File cells now render as clickable `FileCellDownload` component that opens a signed URL in new tab
  - Bug 6a: Migration `00020_tenant_contact_fields.sql` — added `contact_name` + `contact_email` to `tenants` table; updated service, server actions, and both Create/Edit Tenant dialogs; Tenants grid shows new column
  - Bug 6b: Required fields (`Tenant Name *`, `Slug *`) now show red asterisk in Create/Edit Tenant dialogs
  - Bug 7: `deleteTenant` now cascades — checks each user's other tenant memberships; deletes auth users with no remaining tenants; updates confirmation dialog copy
  - Files changed: `header.tsx`, `policy-actions.tsx`, `policies/[id]/page.tsx`, `file-cell-download.tsx`, `items/page.tsx`, `00020_tenant_contact_fields.sql`, `tenants.service.ts`, `dashboard.ts` (actions), `create-tenant-dialog.tsx`, `edit-tenant-dialog.tsx`, `tenant-actions.tsx`, `tenants/page.tsx`
  - **Pending (awaiting user decisions)**: Bug 1d (avatar upload), Bug 2 (full i18n), Bug 4c (timezone), Bug 5 (console error — likely env issue)

### Recently Completed (older)

- **Studio Phase 9: API Routes** — build complete, TypeScript clean
  - Middleware: `/api/*` routes now bypass cookie-based auth (handle own Bearer token auth)
  - `src/app/api/_lib/api-auth.ts` — `resolveApiContext()`: validates `Authorization: Bearer <token>` + `X-Tenant-Id` header, checks tenant membership, returns admin DB client
  - `src/app/api/_lib/rate-limit.ts` — in-memory sliding window, 100 req/60s per token, returns `X-RateLimit-*` headers
  - `GET/POST /api/collections` — list (filter by type) + create
  - `GET/PUT/DELETE /api/collections/:slug` — schema with sorted fields, update, delete
  - `GET/POST /api/collections/:slug/items` — paginated list (`page`, `limit`, `sort`, `order`) + create
  - `GET/PUT/DELETE /api/collections/:slug/items/:id` — single item CRUD
  - `GET /api/collections/:slug/export` — CSV (`format=csv`) or JSON (`format=json`) download
  - `POST /api/collections/:slug/import` — bulk insert with field mapping + validation errors (422)
  - `GET /api/content-catalogs` — list all catalogs
  - `GET /api/content-catalogs/:slug` — catalog + active items sorted by sort_order

- **Studio Nav Restructure + Global Lists → Content Catalog** — complete, TypeScript clean
  - Sidebar: Studio is now a collapsible folder with sub-items (System Collections, Content Catalog, Tenant Collections)
  - Pages: split Studio into 3 separate pages under `/dashboard/studio/{system-collections,content-catalog,tenant-collections}`
  - `/dashboard/studio` redirects to `/dashboard/studio/system-collections`
  - DB migration `00012`: renamed `global_lists` → `content_catalogs`, `global_list_items` → `content_catalog_items`, `list_id` → `catalog_id`, `global_list_slug` → `catalog_slug` in field options
  - Renamed all actions, components, pages, types, and prop names to use `catalog`/`content-catalog` naming
  - Deleted old `global-lists` files
  - Types regenerated, `tsc --noEmit` clean

- **Studio Phase 8: Import/Export** — build complete, TypeScript clean
  - Packages: `papaparse` (CSV), `xlsx` (Excel/SheetJS)
  - Server actions: `exportItems` (fetch all items for export), `importItems` (bulk insert with validation)
  - `exportItems`: fetches all items (no pagination), respects tenant isolation, returns fields + items
  - `importItems`: accepts rows + field mapping, validates required/unique/type constraints, bulk inserts
  - `convertValue` helper: type coercion for number, date, datetime, boolean, multiselect, json
  - Component: `export-buttons.tsx` — CSV + Excel download buttons, client-side file generation
  - Component: `import-dialog.tsx` — 4-step wizard (upload → mapping → errors → success)
    - Auto-maps CSV columns to fields by name/slug matching
    - Field mapping UI with Select dropdowns
    - Preview of first 3 rows
    - Validation error table (row, field, message) capped at 100
    - Required field warning when unmapped
  - Wired into items page header alongside "Add Item" button
  - Export visible to all users, Import only for users with write access

- **Studio isolation + module removal** — migration `00010_studio_isolation.sql` applied
  - `collection_items.tenant_id` now nullable (system items have no tenant)
  - `module_id` dropped from `collections` + CASCADE dropped dependent RLS policies
  - Recreated `collections_select` + `collection_fields_select` without module logic
  - System collections: visible to all tenants (read-only), writable only by BIPO super_admin
  - Tenant collections: isolated per tenant (MCD cannot see KFC's)
  - Schema + items pages: write controls hidden for non-BIPO on system collections
  - Studio list renamed "My Collections" → "Tenant Collections"
  - `create-collection-dialog.tsx`: module UI removed

- **Studio Phase 7: Content Catalogs UI** (formerly Global Lists) — build complete
  - Pages: `/dashboard/studio/content-catalog`, `/dashboard/studio/content-catalog/[slug]`
  - Actions: `src/app/actions/content-catalog.ts` (create/update/delete catalog + items, reorder)
  - Components: `create-catalog-dialog`, `catalog-actions`, `create-catalog-item-dialog`, `catalog-item-actions`
  - Sidebar: "Content Catalog" nav item under Studio folder (super_admin only)

- **Studio Phase 4: Cancelled** — modules feature removed from product

- **Studio Phase 3: Collection Item CRUD — Grid View** — build complete, TypeScript clean
  - Page: `src/app/dashboard/studio/collections/[slug]/items/page.tsx`
  - Components: `item-form-dialog.tsx` (create + edit), `item-row-actions.tsx`
  - Actions: `createItem`, `updateItem`, `deleteItem` added to `studio.ts`
  - Pagination (20/page, URL-based), sort by `created_at`/`updated_at`
  - Schema/Items tab bar on both schema page and items page
  - Studio list page: renamed "Fields" → "Schema", added "Items" link
  - Auto-generated form: text, number, date, datetime, boolean, select, multiselect, richtext, json (file + relation deferred to Phase 8/6)

- **Studio Phase 2: Collection Builder UI** — build complete, TypeScript clean
  - Files: `src/app/actions/studio.ts`, `src/app/dashboard/studio/page.tsx`, `src/app/dashboard/studio/collections/[slug]/schema/page.tsx`
  - Components: `create-collection-dialog.tsx`, `collection-actions.tsx`, `create-field-dialog.tsx`, `field-actions.tsx`
  - Sidebar: added Studio nav item (tenant_admin+)
  - Middleware: added `/dashboard/studio` route guard

- **Studio Phase 1: DB Schema + RLS + Seed** — `00009_studio_phase1.sql` pushed to Supabase cloud, TypeScript types regenerated
  - Tables: modules, tenant_modules, collections, collection_fields, collection_items, collection_items_audit, global_lists, global_list_items, collection_views
  - Helper functions: `is_super_admin()`, `get_my_licensed_module_ids()`
  - Audit trigger on collection_items
  - Seed: gender, country, marital status, race, religion, employment type, leave type

- **Workflow Optimization**: Removed Gemini integration, optimized for Claude Code only. Updated CLAUDE.md, TASKS.md, and deleted gemini.md.
- **Route & Naming Refinement**: Simplified routing structure:
  - `/dashboard/admin` → `/dashboard/users` (page title: "Users")
  - `/dashboard/admin/tenants` → `/dashboard/tenants` (page title: "Tenants")
  - Updated sidebar labels to match page titles
  - Updated middleware route guards
  - Created `src/app/actions/dashboard.ts` with server actions
  - Updated all component imports to new action location
- **Menu Group Context Error Fixed**: Resolved `MenuGroupRootContext is missing` error:
  - Fixed `tenant-switcher.tsx` — wrapped items and labels in `<DropdownMenuGroup>`
  - Fixed `member-actions.tsx` — merged empty label group with role items
  - Root cause: DropdownMenuItems/Labels must be direct children of DropdownMenuGroup, not DropdownMenuContent
- **Multi-Tenant Assignment Fixed**: Resolved stuck tenant switching issue:
  - **Gap 1**: Signup didn't auto-assign users to BIPO super tenant
    - Created migration `00007_auto_assign_bipo_on_signup.sql` — updated `handle_new_user()` trigger to auto-assign new users to BIPO as tenant_admin
  - **Gap 2**: Creating tenant didn't assign creator to new tenant
    - Updated `createTenant()` action to assign creator as tenant_admin with is_default=true
  - **Gap 3**: Historical data fix
    - Created migration `00008_fix_weilies_tenant_assignment.sql` — assigns weilies.chok@gmail.com to all existing tenants
  - Migrations pushed to cloud ✓

### Up Next / Backlog

- **Studio Phase 8**: Import/Export (CSV/Excel) ← **DONE**
- **Studio Phase 9**: API Routes ← **DONE**
- **Studio Phase 10**: Kanban + Saved Views ← **DROPPED** (out of scope)
- **Studio Phase 6**: Relations + File Upload ← **IN PROGRESS**

---

## Task Log Template

When logging a task, use this format:

```
### [TASK NAME]
- **Status**: in-progress | done | blocked
- **Who did it**: Claude | Gemini | Human
- **What was done**: Brief description of changes made
- **Files changed**: list of files
- **What's next**: what the next AI or human should do
- **Blockers**: any issues encountered
```
