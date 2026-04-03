# Collection Layout Refinement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the Parent Record and Detail Form layout builders with a consistent card-per-element UX, drag-drop reorder in both, and Notion-style column containers in the detail form.

**Architecture:** Four independent sub-tasks: (1) Add "Add Element" drawer to parent-record-layout-builder; (2) unify visual card UX; (3) HTML5 drag-drop reorder in both builders; (4) column-group element type in form-builder + rendering in item-form-dialog.

**Tech Stack:** Next.js 15, TypeScript, React, Tailwind CSS

---

### Task 1: Add "Add Element" button/drawer to ParentRecordLayoutBuilder

**Files:**
- Modify: `src/components/parent-record-layout-builder.tsx`
- Modify: `src/types/form-layout.ts` (for password label)

- [ ] **Step 1: Add password label to FIELD_TYPE_LABELS in form-builder.tsx**

In `src/components/form-builder.tsx` (line 48), add password:

```typescript
const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Text", number: "Number", date: "Date", datetime: "DateTime",
  boolean: "Toggle", file: "File", select: "Select", multiselect: "Multi-Select",
  richtext: "Rich Text", json: "JSON", relation: "Relation", password: "Password / Secret",
};
```

- [ ] **Step 2: Replace the old dropdown Add Field in parent-record-layout-builder.tsx with a Sheet drawer**

In `src/components/parent-record-layout-builder.tsx`, add the Sheet import:

```tsx
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
```

Add drawer state:

```tsx
const [drawerOpen, setDrawerOpen] = useState(false);
```

Replace the existing `<DropdownMenu>` add-field section at the bottom of the form with a button and Sheet drawer:

```tsx
{/* Add Element button */}
<Button
  variant="outline"
  size="sm"
  onClick={() => setDrawerOpen(true)}
  disabled={availableFields.length === 0}
  className="gap-1.5 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400"
>
  <Plus className="h-3.5 w-3.5" />
  Add Element
</Button>

{/* Add Element Sheet */}
<Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
  <SheetContent side="right" className="w-80 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700">
    <SheetHeader>
      <SheetTitle className="text-gray-900 dark:text-gray-100 text-sm font-semibold">Add Field</SheetTitle>
    </SheetHeader>
    <div className="mt-4 space-y-1">
      {availableFields.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 py-4 text-center">All fields are placed.</p>
      ) : (
        availableFields.map((f) => (
          <button
            key={f.slug}
            onClick={() => { handleAddField(f.slug); setDrawerOpen(false); }}
            className="w-full flex items-start gap-2 px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-left transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{f.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{FIELD_TYPE_LABELS[f.field_type] ?? f.field_type}</p>
            </div>
          </button>
        ))
      )}
    </div>
  </SheetContent>
</Sheet>
```

- [ ] **Step 3: Build check**

```bash
cd c:/Projects/claude/pulsebox && npm run build 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
cd c:/Projects/claude/pulsebox
git add src/components/parent-record-layout-builder.tsx src/components/form-builder.tsx
git commit -m "feat: add 'Add Element' drawer to parent record layout builder"
```

---

### Task 2: Drag-drop reorder in ParentRecordLayoutBuilder

**Files:**
- Modify: `src/components/parent-record-layout-builder.tsx`

- [ ] **Step 1: Add drag state and handlers**

In `src/components/parent-record-layout-builder.tsx`, add drag state:

```tsx
const [dragIndex, setDragIndex] = useState<number | null>(null);
const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
```

Add a reorder handler:

```tsx
const handleDrop = (dropIndex: number) => {
  if (dragIndex === null || dragIndex === dropIndex) {
    setDragIndex(null);
    setDragOverIndex(null);
    return;
  }
  const newElements = [...elements];
  const [moved] = newElements.splice(dragIndex, 1);
  newElements.splice(dropIndex, 0, moved);
  setElements(newElements);
  setDragIndex(null);
  setDragOverIndex(null);
};
```

- [ ] **Step 2: Add draggable attributes to each element card**

In the element map (around line 140), update the element `<div>` to be draggable:

```tsx
<div
  key={idx}
  draggable
  onDragStart={() => setDragIndex(idx)}
  onDragOver={(e) => { e.preventDefault(); setDragOverIndex(idx); }}
  onDragLeave={() => setDragOverIndex(null)}
  onDrop={(e) => { e.preventDefault(); handleDrop(idx); }}
  onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
  className={cn(
    "flex items-center justify-between gap-2 p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 cursor-grab active:cursor-grabbing transition-all",
    dragOverIndex === idx && "border-blue-400 bg-blue-50 dark:bg-blue-950/30",
    dragIndex === idx && "opacity-50"
  )}
>
```

Add `GripVertical` icon to the card to indicate draggability:

```tsx
import { Plus, Trash2, ChevronUp, ChevronDown, Save, GripVertical } from "lucide-react";

// Inside the element card, before the field name:
<GripVertical className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500 cursor-grab shrink-0" />
```

- [ ] **Step 3: Commit**

```bash
cd c:/Projects/claude/pulsebox
git add src/components/parent-record-layout-builder.tsx
git commit -m "feat: drag-drop reorder in parent record layout builder"
```

---

### Task 3: Drag-drop reorder in FormBuilder (detail form)

**Files:**
- Modify: `src/components/form-builder.tsx`

- [ ] **Step 1: Add drag state to FormBuilder**

In `src/components/form-builder.tsx`, add drag state:

```tsx
const [dragIdx, setDragIdx] = useState<number | null>(null);
const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
```

Add drag reorder handler (operates on the active tab's elements):

```tsx
function handleElementDrop(tabId: string, dropIdx: number) {
  if (dragIdx === null || dragIdx === dropIdx) {
    setDragIdx(null);
    setDragOverIdx(null);
    return;
  }
  updateTab(tabId, (t) => {
    const arr = [...t.elements];
    const [moved] = arr.splice(dragIdx, 1);
    arr.splice(dropIdx, 0, moved);
    return { ...t, elements: arr };
  });
  setDragIdx(null);
  setDragOverIdx(null);
}
```

- [ ] **Step 2: Find the element card rendering loop in form-builder.tsx and add draggable**

Search for where elements are rendered (look for `el.type === "field"` and corresponding JSX, around line 200+). The outer element card `<div>` should become:

```tsx
<div
  key={idx}
  draggable
  onDragStart={() => setDragIdx(idx)}
  onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
  onDragLeave={() => setDragOverIdx(null)}
  onDrop={(e) => { e.preventDefault(); handleElementDrop(activeTab.id, idx); }}
  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
  className={cn(
    "... existing classes ...",
    dragOverIdx === idx && "border-blue-400 bg-blue-50 dark:bg-blue-950/30",
    dragIdx === idx && "opacity-50"
  )}
>
```

Add `GripVertical` icon at the start of each card (import it if not already imported).

- [ ] **Step 3: Commit**

```bash
cd c:/Projects/claude/pulsebox
git add src/components/form-builder.tsx
git commit -m "feat: drag-drop reorder in detail form layout builder"
```

---

### Task 4: Column-group element type (Notion-style columns) in detail form

**Files:**
- Modify: `src/types/form-layout.ts`
- Modify: `src/components/form-builder.tsx`
- Modify: `src/components/item-form-dialog.tsx`

- [ ] **Step 1: Add column-group to form layout types**

In `src/types/form-layout.ts`, add the new element type. First, read the file to see the existing structure, then add:

```typescript
export type FormElementColumnGroup = {
  type: "column-group";
  id: string;
  columns: 2 | 3;
  slots: FormElementField[][];  // Array of N arrays, one per column
};

// Add to the FormElement union:
export type FormElement =
  | FormElementField
  | FormElementNote
  | FormElementButton
  | FormElementDivider
  | FormElementTabGroup
  | FormElementColumnGroup;  // ADD THIS
```

- [ ] **Step 2: Add "2 Columns" and "3 Columns" options to the Add Element drawer in form-builder.tsx**

In the `form-builder.tsx` drawer content (the Sheet that opens when "Add Element" is clicked), add two new options after the existing element type choices:

```tsx
{/* Column layout options */}
<div className="pt-3 border-t border-gray-200 dark:border-gray-700">
  <p className="text-xs text-gray-500 dark:text-gray-400 px-3 pb-2 font-medium">LAYOUT</p>
  <button
    onClick={() => {
      drawerState?.addFn({
        type: "column-group",
        id: genId(),
        columns: 2,
        slots: [[], []],
      });
      setDrawerOpen(false);
    }}
    className="w-full flex items-start gap-2 px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-left transition-colors"
  >
    <div>
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">2 Columns</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">Side-by-side fields in two equal columns</p>
    </div>
  </button>
  <button
    onClick={() => {
      drawerState?.addFn({
        type: "column-group",
        id: genId(),
        columns: 3,
        slots: [[], [], []],
      });
      setDrawerOpen(false);
    }}
    className="w-full flex items-start gap-2 px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-left transition-colors"
  >
    <div>
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">3 Columns</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">Three equal columns</p>
    </div>
  </button>
</div>
```

- [ ] **Step 3: Render column-group elements in the form builder UI**

In `form-builder.tsx`, in the element rendering loop, add a case for `column-group`:

```tsx
{el.type === "column-group" && (
  <div key={idx} className="rounded-lg border border-blue-500/30 bg-blue-50/30 dark:bg-blue-950/20 p-3 space-y-2">
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
        {el.columns}-Column Layout
      </span>
      <button
        onClick={() => removeElement(activeTab.id, idx)}
        className="p-0.5 text-gray-500 dark:text-gray-400 hover:text-red-400 rounded"
        title="Remove column group"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
    <div className={`grid gap-2 ${el.columns === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
      {el.slots.map((slot, colIdx) => (
        <div
          key={colIdx}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // Move the dragged field from availableFields into this slot
            // dragIdx here refers to the top-level element index being dragged
            // For column-group slots, we use a separate drop mechanism:
            // Only accept field drags from the available fields picker
            const fieldSlug = e.dataTransfer.getData("fieldSlug");
            if (!fieldSlug) return;
            const field = fields.find((f) => f.slug === fieldSlug);
            if (!field) return;
            const newEl: FormElementField = { type: "field", fieldSlug: field.slug, width: "full" };
            const newSlots = el.slots.map((s, si) =>
              si === colIdx ? [...s, newEl] : s
            );
            patchElement(activeTab.id, idx, { slots: newSlots } as Partial<FormElement>);
          }}
          className="min-h-[60px] rounded border border-dashed border-gray-300 dark:border-gray-600 p-2 space-y-1"
        >
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">Col {colIdx + 1}</p>
          {slot.map((slotEl, slotIdx) => {
            const f = fields.find((fi) => fi.slug === slotEl.fieldSlug);
            return (
              <div key={slotIdx} className="flex items-center justify-between gap-1 bg-white dark:bg-gray-800 rounded px-2 py-1 border border-gray-200 dark:border-gray-700 text-xs">
                <span className="text-gray-900 dark:text-gray-100 truncate">{f?.name ?? slotEl.fieldSlug}</span>
                <button
                  onClick={() => {
                    const newSlots = el.slots.map((s, si) =>
                      si === colIdx ? s.filter((_, fi) => fi !== slotIdx) : s
                    );
                    patchElement(activeTab.id, idx, { slots: newSlots } as Partial<FormElement>);
                  }}
                  className="text-gray-500 dark:text-gray-400 hover:text-red-400 shrink-0"
                >
                  <Minus className="h-3 w-3" />
                </button>
              </div>
            );
          })}
          <p className="text-[10px] text-gray-500 dark:text-gray-400 italic">Drag field here</p>
        </div>
      ))}
    </div>
  </div>
)}
```

Update `collectPlacedSlugs` to also count slugs inside column-group slots:

```tsx
function collectPlacedSlugs(elements: FormElement[]): string[] {
  return elements.flatMap((el) => {
    if (el.type === "field") return [el.fieldSlug];
    if (el.type === "tab-group") return el.tabs.flatMap((t) => collectPlacedSlugs(t.elements));
    if (el.type === "column-group") return el.slots.flatMap((slot) => slot.map((s) => s.fieldSlug));
    return [];
  });
}
```

Make available fields draggable with `dataTransfer`:

```tsx
// In the available fields section of the drawer, add drag:
<button
  key={f.slug}
  draggable
  onDragStart={(e) => e.dataTransfer.setData("fieldSlug", f.slug)}
  onClick={() => { drawerState?.addFn({ type: "field", fieldSlug: f.slug, width: "full" }); setDrawerOpen(false); }}
  className="w-full flex items-start gap-2 px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-left transition-colors cursor-grab"
>
```

- [ ] **Step 4: Render column-group in item-form-dialog.tsx**

In `src/components/item-form-dialog.tsx`, in the `LayoutFormFields` component (around line 276), add rendering for `column-group` elements. Import the new type:

```tsx
import type { FormLayout, FormElement, FormElementField, FormElementTabGroup, FormElementColumnGroup, FieldWidget } from "@/types/form-layout";
```

In the element rendering section (in the grid map), add a case for `column-group`:

```tsx
{el.type === "column-group" && (
  <div key={idx} className="col-span-2">
    <div className={`grid gap-x-4 gap-y-4 ${el.columns === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
      {el.slots.map((slot, colIdx) =>
        slot.map((slotEl, slotIdx) => {
          const f = fields.find((fi) => fi.slug === slotEl.fieldSlug);
          if (!f) return null;
          const fieldValue = getFieldValue(f);
          return (
            <div key={`${colIdx}-${slotIdx}`} className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {getFieldLabel(f, currentLocale)}
                {f.is_required && <span className="text-red-500 ml-0.5">*</span>}
              </Label>
              <FieldInputControl
                field={f}
                value={fieldValue}
                opts={(f.options as Record<string, unknown>) ?? {}}
                onChange={onChange}
                collectionSlug={collectionSlug}
                catalogItems={catalogItems}
                widget={slotEl.widget}
              />
            </div>
          );
        })
      )}
    </div>
  </div>
)}
```

**Note:** `getFieldValue` and `onChange` are the same helpers already used in the surrounding `LayoutFormFields` component — do not create new ones.

- [ ] **Step 5: Build check**

```bash
cd c:/Projects/claude/pulsebox && npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
cd c:/Projects/claude/pulsebox
git add src/types/form-layout.ts src/components/form-builder.tsx src/components/item-form-dialog.tsx
git commit -m "feat: column-group element type for Notion-style column layouts in detail form"
```
