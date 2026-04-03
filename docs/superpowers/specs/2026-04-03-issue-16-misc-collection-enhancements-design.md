---
title: Issue #16 — Misc Collection Enhancements
date: 2026-04-03
status: approved
github_issue: https://github.com/weilies/PulseBox/issues/16
---

# Issue #16 — Misc Collection Enhancements

Five independent features resolved in priority order: layout bug → password field → sidebar collapse → navigation enhancements → layout refinement.

---

## Item 1: Form Layout Respected in Parent-View Edit Dialog (Bug Fix)

### Root Cause
`src/components/parent-item-header.tsx:195–208` opens `EditItemDialog` without passing `formLayout`. The same dialog in `src/app/dashboard/studio/collections/[slug]/items/page.tsx:468` passes it correctly. Result: fields render top-down instead of in the configured column layout.

### Fix
In `parent-item-header.tsx`:
- Fetch `formLayout` from collection metadata (same query pattern as `items/page.tsx`)
- Pass `formLayout` as a prop to `EditItemDialog`

No schema changes. One prop addition + one data fetch.

---

## Item 2: Password Field Type (UI-Masked, API-Accessible)

### Behaviour by Surface

| Surface | Behaviour |
|---|---|
| UI form — create | Masked input (`type="password"`) |
| UI form — edit | Always empty; hint: *"Enter new value to update"*; empty submit = no change |
| Query Generator column | Selectable; value returned as `****` |
| Content API | Returns actual value (for server-side integrations, e.g. LarkSuite) |
| Activity log | Value replaced with `<secret>` before write |
| Outbound webhook / integration log | Payload sanitized — `<secret>` substituted for password field values |

### Implementation

**Field type registration:**
- Add `"password"` to the valid types array in `src/lib/services/fields.service.ts`
- Add Password option (with `Lock` icon) to type picker in `src/components/create-field-dialog.tsx`

**UI rendering (`src/components/item-form-dialog.tsx` — `FieldInputControl`):**
- Detect `field.field_type === "password"`
- Render `<input type="password" autoComplete="new-password">`
- On edit mode: never pre-populate (always render empty)
- On submit: if value is empty string, omit field from update payload entirely

**Query Generator (`src/lib/query-engine.ts` + `/api/queries/collections/route.ts`):**
- In query results: replace password field values with `"****"` before returning
- Field remains selectable in the Query Generator UI (not hidden)

**Log sanitizer (new shared utility):**
- Create `src/lib/sanitize-log-payload.ts` — exports `sanitizePasswordFields(data: Record<string, unknown>, fields: Field[]): Record<string, unknown>`
- Walks `data`, replaces any key whose corresponding field has `field_type === "password"` with `"<secret>"`
- Call this utility before any write to `app_logs` that includes item data
- Call before logging outbound webhook/integration request bodies

---

## Item 3: Sidebar Collapse/Expand

### Behaviour
- Collapse toggle button anchored at the sidebar bottom (chevron-left / chevron-right icon)
- **Collapsed state:** sidebar narrows to ~56px; only icons visible, labels hidden
- **Hover-to-expand:** hovering the collapsed sidebar temporarily expands it (CSS `group-hover` + transition)
- Preference persisted in `localStorage` key `pb-sidebar-collapsed`
- Mobile sidebar: unchanged (uses sheet overlay, no collapse button)

### Implementation
- `src/components/sidebar.tsx` + `src/components/dashboard-shell.tsx`
- Add `collapsed` boolean state, initialised from `localStorage`
- Width: `w-56` (expanded) → `w-14` (collapsed), animated with `transition-all duration-200`
- Collapsed: hide text labels with `hidden group-hover:block` or conditional render
- Toggle button at bottom of sidebar: `<button onClick={() => setCollapsed(!collapsed)}>`
- On collapse state change: persist to `localStorage`

---

## Item 4: Studio Navigation Enhancements

All changes in `src/components/nav-manager.tsx` and `src/app/actions/nav.ts`.

### Sub-items

**4a. Expand icon alignment**
Fix flex alignment on folder header row so `ChevronRight` icon is visually flush with other icons.

**4b. Collapse-by-default**
Initialise folder open state to `false`. Currently defaults to `true`.

**4c. Folder icon override**
- Add optional `icon?: string` field to `NavFolder` (stored in `metadata` JSONB or new column)
- Default renders `Folder` / `FolderOpen` icon
- Icon override: small lucide icon name picker (text input with preview) on folder rename/settings popover
- Migration: add `icon` column to `nav_folders` table (nullable text)

**4d. Fix move up/down**
- Rewrite sibling-only reorder: when moving up/down, only swap `sort_order` with the adjacent sibling **at the same `parent_id` level**
- Guard: if no sibling exists above/below, button is disabled

**4e. Folder-id tooltip**
- Add `title={folder.id}` to folder header element (native browser tooltip)
- Or wrap in shadcn `<Tooltip>` for styled display

**4f. Drag-drop between any folder level**
- Items can be dragged into any folder at any nesting level
- Folders can be dragged to reparent under any other folder
- A non-folder item **cannot** be dropped onto another non-folder item (only onto folder drop zones)
- Drop zone highlights shown during drag

**4g. Tenant permission guard**
- Detect user role; if not `super_admin`, hide/disable: Add Folder button, rename input, delete button, all drag handles
- Read-only view for non-super-admin users who have been granted access to the nav screen

---

## Item 5: Collection Layout Refinement

### Sub-items

**5a. Add Element to Parent Record Layout**
- Add the same "Add Element" drawer from `src/components/form-builder.tsx` to `src/components/parent-record-layout-builder.tsx`
- Elements available in parent record: field, divider (note/button/tab-group are detail-form only for now)

**5b. Unified visual UX**
- Rework `parent-record-layout-builder.tsx` to match `form-builder.tsx` card-per-element style
- Consistent: move-up/move-down buttons, width badge (1/2/3), remove button per element

**5c. Drag-drop reorder**
- Add HTML5 `draggable` reorder to both `form-builder.tsx` and `parent-record-layout-builder.tsx`
- Same pattern already in `nav-manager.tsx` (no new library)
- Move-up/move-down buttons remain as fallback

**5d. Column containers (Notion-style) — Detail Form only**
- Add `column-group` element type to `src/types/form-layout.ts`
- `FormElementColumnGroup`: `{ type: "column-group"; columns: 2 | 3; slots: FormElementField[][] }`
- "Add Element" drawer gains options: "2 Columns", "3 Columns"
- Inserting a column-group creates a container with N empty slots; user drags fields into slots
- Rendered in `item-form-dialog.tsx` as a CSS grid with `grid-cols-2` or `grid-cols-3`
- Parent Record layout keeps its existing width-1/2/3 model (simpler, appropriate for the grid widget)

---

## Execution Order

1. Item 1 — Form layout bug fix (smallest, immediate UX win)
2. Item 2 — Password field type + log sanitizer
3. Item 3 — Sidebar collapse/expand
4. Item 4 — Navigation enhancements (nav-manager)
5. Item 5 — Layout refinement (largest, drag-drop + column-group)
