# Navigation Enhancements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 sub-issues in the Studio Navigation manager: collapse-by-default, folder icon override, expand icon alignment, move-up/down correctness, folder-id tooltip, and super-admin-only write controls.

**Architecture:** All changes are in `src/components/nav-manager.tsx` and the `nav_folders` schema. The NavManager props will receive an `isSuperAdmin` flag to gate write controls.

**Tech Stack:** Next.js 15, TypeScript, React, Supabase

---

### Task 1: Collapse-by-default and folder-id tooltip

**Files:**
- Modify: `src/components/nav-manager.tsx`

- [ ] **Step 1: Change expandedFolders initial state to empty Set**

In `src/components/nav-manager.tsx`, find the line (around line 117):

```tsx
const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set(initialFolders.map((f) => f.id)));
```

Change to:

```tsx
const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
```

- [ ] **Step 2: Add folder-id tooltip on the folder header button**

In the `renderFolder` function (around line 341), the expand/collapse `<button>` currently has no title. Update it:

```tsx
<button
  onClick={() => setExpandedFolders((prev) => {
    const next = new Set(prev);
    if (next.has(folder.id)) next.delete(folder.id); else next.add(folder.id);
    return next;
  })}
  className="flex items-center gap-1.5 flex-1 text-left"
  title={`ID: ${folder.id}`}
>
```

- [ ] **Step 3: Fix expand icon alignment**

In the `renderFolder` function (around line 353), the chevron icon is rendered inside the button but has `ml-auto`. The issue is that it sits inside a flex row that also contains the folder name. Update the button to be `flex w-full` and ensure the chevron stays right-aligned:

```tsx
<button
  onClick={() => setExpandedFolders((prev) => {
    const next = new Set(prev);
    if (next.has(folder.id)) next.delete(folder.id); else next.add(folder.id);
    return next;
  })}
  className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
  title={`ID: ${folder.id}`}
>
  {/* icon rendered in Task 2 step */}
  {isEditing ? (
    <InlineInput
      value={folder.name}
      onSave={(name) => handleRenameFolder(folder.id, name)}
      onCancel={() => setEditingFolderId(null)}
    />
  ) : (
    <span className="text-gray-900 dark:text-gray-100 truncate flex-1">{folder.name}</span>
  )}
  {!isEditing && (
    <span className="ml-auto shrink-0">
      {isOpen
        ? <ChevronDown className="h-3 w-3 text-gray-500 dark:text-gray-400" />
        : <ChevronRight className="h-3 w-3 text-gray-500 dark:text-gray-400" />}
    </span>
  )}
</button>
```

- [ ] **Step 4: Commit**

```bash
cd c:/Projects/claude/pulsebox
git add src/components/nav-manager.tsx
git commit -m "fix: collapse folders by default, add folder-id tooltip, align expand icon"
```

---

### Task 2: Folder icon override

**Files:**
- Modify: `src/components/nav-manager.tsx`
- Create migration: `supabase/migrations/<timestamp>_nav_folder_icon.sql`

- [ ] **Step 1: Create the migration to add icon column to nav_folders**

Create the file `supabase/migrations/20260403000001_nav_folder_icon.sql`:

```sql
ALTER TABLE nav_folders ADD COLUMN IF NOT EXISTS icon text;
```

- [ ] **Step 2: Apply the migration**

```bash
cd c:/Projects/claude/pulsebox && npx supabase db push --linked
```

Expected: migration applied successfully.

- [ ] **Step 3: Update NavFolder type to include icon**

Check `src/lib/services/nav.service.ts` for the `NavFolder` type definition. Add `icon?: string | null`:

```typescript
export type NavFolder = {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  icon?: string | null;
  children?: NavFolder[];
  items?: NavItem[];
};
```

Also update the Supabase fetch query in `nav.service.ts` to include `icon` in the select.

- [ ] **Step 4: Render the folder icon from the icon field**

In `nav-manager.tsx` `renderFolder` function, replace the hardcoded `FolderOpen`/`Folder` icons:

```tsx
// At the top of renderFolder, resolve the icon:
const FolderIconComp = (() => {
  if (folder.icon) {
    const iconName = folder.icon.split("-").map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
    const Resolved = (LucideIcons as Record<string, unknown>)[iconName];
    if (Resolved) return Resolved as React.ComponentType<{ className?: string }>;
  }
  return isOpen ? FolderOpen : Folder;
})();
```

Then in the button JSX, replace the hardcoded icon with:

```tsx
<FolderIconComp className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
```

Add `import * as LucideIcons from "lucide-react";` at the top of the file if not already present (check — `sidebar.tsx` already has it; add to nav-manager too).

- [ ] **Step 5: Add icon name input to the folder rename inline form**

Update `InlineInput` usage in the rename flow to allow specifying an icon. After the rename save, also call `updateNavFolder` with the icon. The simplest approach: add a second optional field to the inline form. Update `handleRenameFolder` to also accept an icon:

```tsx
async function handleRenameFolder(folderId: string, name: string, icon?: string | null) {
  const fd = new FormData();
  fd.set("folder_id", folderId);
  fd.set("name", name);
  if (icon !== undefined) fd.set("icon", icon ?? "");
  startTransition(async () => {
    const result = await updateNavFolder(fd);
    if (result.error) toast.error(result.error);
    else { toast.success("Folder updated"); refresh(); }
  });
  setEditingFolderId(null);
}
```

Add a small text input for the lucide icon name beside the folder name inline input. Update the `InlineInput` component to optionally show an icon field:

```tsx
function InlineInput({
  value,
  iconValue,
  onSave,
  onCancel,
  placeholder,
  showIconField,
}: {
  value: string;
  iconValue?: string;
  onSave: (val: string, icon?: string) => void;
  onCancel: () => void;
  placeholder?: string;
  showIconField?: boolean;
}) {
  const [val, setVal] = useState(value);
  const [icon, setIcon] = useState(iconValue ?? "");
  return (
    <form
      className="flex items-center gap-1 flex-wrap"
      onSubmit={(e) => { e.preventDefault(); if (val.trim()) onSave(val.trim(), showIconField ? icon || undefined : undefined); }}
    >
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder={placeholder}
        className="bg-gray-100 dark:bg-gray-800 border border-blue-500/40 rounded px-2 py-0.5 text-xs text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400 w-36"
      />
      {showIconField && (
        <input
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder="lucide icon (e.g. star)"
          className="bg-gray-100 dark:bg-gray-800 border border-blue-500/40 rounded px-2 py-0.5 text-xs text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400 w-36"
        />
      )}
      <button type="submit" className="text-blue-600 dark:text-blue-400 hover:text-[#a8c4ff] text-xs px-1">Save</button>
      <button type="button" onClick={onCancel} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:text-gray-100 text-xs px-1">Cancel</button>
    </form>
  );
}
```

Update the `InlineInput` call in `renderFolder` to pass `showIconField` and `iconValue`:

```tsx
<InlineInput
  value={folder.name}
  iconValue={folder.icon ?? ""}
  showIconField
  onSave={(name, icon) => handleRenameFolder(folder.id, name, icon ?? null)}
  onCancel={() => setEditingFolderId(null)}
/>
```

- [ ] **Step 6: Commit**

```bash
cd c:/Projects/claude/pulsebox
git add supabase/migrations/20260403000001_nav_folder_icon.sql src/components/nav-manager.tsx src/lib/services/nav.service.ts
git commit -m "feat: folder icon override with lucide icon name picker"
```

---

### Task 3: Fix move-up/down sibling ordering

**Files:**
- Modify: `src/components/nav-manager.tsx`

- [ ] **Step 1: Fix the swap logic in handleMoveFolder**

The current `handleMoveFolder` (around line 141) swaps `sort_order` values with the target sibling. But if sort_orders are equal or gapped, the swap is unreliable. Fix by swapping the actual `sort_order` values between the two sibling records:

```tsx
const handleMoveFolder = async (
  folderId: string,
  parentId: string | null,
  direction: 'up' | 'down'
) => {
  startTransition(async () => {
    const siblings = getFolderSiblings(parentId);
    const currentIndex = siblings.findIndex(f => f.id === folderId);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= siblings.length) return;

    const current = siblings[currentIndex];
    const target = siblings[targetIndex];

    // Swap sort_orders between the two siblings
    const fd1 = new FormData();
    fd1.set("folder_id", current.id);
    if (parentId) fd1.set("parent_id", parentId);
    fd1.set("sort_order", String(target.sort_order));

    const fd2 = new FormData();
    fd2.set("folder_id", target.id);
    if (parentId) fd2.set("parent_id", parentId);
    fd2.set("sort_order", String(current.sort_order));

    const [r1, r2] = await Promise.all([
      moveNavFolderAction(fd1),
      moveNavFolderAction(fd2),
    ]);
    if (r1.error) toast.error(r1.error);
    else if (r2.error) toast.error(r2.error);
    else refresh();
  });
};
```

- [ ] **Step 2: Commit**

```bash
cd c:/Projects/claude/pulsebox
git add src/components/nav-manager.tsx
git commit -m "fix: swap both sort_orders in move-folder up/down so ordering is reliable"
```

---

### Task 4: Super-admin-only write controls

**Files:**
- Modify: `src/components/nav-manager.tsx`
- Modify: the page that renders NavManager (find it with grep)

- [ ] **Step 1: Find the page that renders NavManager**

```bash
cd c:/Projects/claude/pulsebox && grep -r "NavManager" src/ --include="*.tsx" -l
```

- [ ] **Step 2: Pass isSuperAdmin to NavManager**

In that page, retrieve the user role (it likely already has it) and pass it:

```tsx
<NavManager
  initialFolders={folders}
  initialItems={items}
  allCollections={collections}
  isSuperAdmin={isSuperAdmin}
/>
```

- [ ] **Step 3: Update NavManager props interface**

In `src/components/nav-manager.tsx`, update `NavManagerProps`:

```tsx
interface NavManagerProps {
  initialFolders: NavFolder[];
  initialItems: NavItem[];
  allCollections: Collection[];
  isSuperAdmin?: boolean;
}
```

Destructure it:

```tsx
export function NavManager({ initialFolders, initialItems, allCollections, isSuperAdmin = false }: NavManagerProps) {
```

- [ ] **Step 4: Gate write controls behind isSuperAdmin**

In `renderFolder`, wrap the action buttons (FolderPlus, Pencil, Trash2, ChevronUp, ChevronDown, GripVertical) with `{isSuperAdmin && ...}`:

```tsx
{/* Drag handle — only for super_admin */}
{isSuperAdmin && (
  <GripVertical className="h-3 w-3 text-blue-500 dark:text-blue-400/30 cursor-grab shrink-0" />
)}

{/* Action buttons — only for super_admin */}
{!isEditing && isSuperAdmin && (
  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all ml-1">
    {/* FolderPlus, Pencil, Trash2, ChevronUp, ChevronDown buttons */}
  </div>
)}
```

Also hide the "New Folder" button in the header:

```tsx
{isSuperAdmin && (
  <button
    onClick={() => setIsCreatingRootFolder(true)}
    className="..."
  >
    <Plus className="h-3 w-3" />
    New Folder
  </button>
)}
```

And hide the item remove (X) button on items:

```tsx
{isSuperAdmin && (
  <button
    onClick={() => handleRemoveItem(item.id)}
    disabled={isPending}
    className="opacity-0 group-hover:opacity-100 text-gray-500 dark:text-gray-400 hover:text-red-400 transition-all ml-1"
    title="Remove from nav"
  >
    <X className="h-3 w-3" />
  </button>
)}
```

- [ ] **Step 5: Build check**

```bash
cd c:/Projects/claude/pulsebox && npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
cd c:/Projects/claude/pulsebox
git add src/components/nav-manager.tsx
git commit -m "feat: gate nav-manager write controls to super_admin only"
```
