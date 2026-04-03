# Form Layout Bug Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Edit dialog opened from the parent-record view to respect the collection's configured form layout.

**Architecture:** The item detail page (`[id]/page.tsx`) already reads `collection.metadata` but doesn't extract `form_layout`. Adding two lines there and one prop in `ParentItemHeader` closes the gap.

**Tech Stack:** Next.js 15 App Router, TypeScript, React

---

### Task 1: Pass formLayout from item detail page → ParentItemHeader → EditItemDialog

**Files:**
- Modify: `src/app/dashboard/studio/collections/[slug]/items/[id]/page.tsx`
- Modify: `src/components/parent-item-header.tsx`

- [ ] **Step 1: Add formLayout extraction in the item detail page**

In `src/app/dashboard/studio/collections/[slug]/items/[id]/page.tsx`, add the import and extraction right after the existing `parentRecordLayout` extraction (around line 344):

```tsx
// existing import at top — add FormLayout to it:
import type { FormLayout } from "@/types/form-layout";

// existing line ~344:
const parentRecordLayout = (collection.metadata?.parent_record_layout ?? null) as ParentRecordLayout | null;
// ADD directly below:
const formLayout = (collection.metadata?.form_layout ?? null) as FormLayout | null;
```

- [ ] **Step 2: Pass formLayout prop to ParentItemHeader**

In the same file, in the `<ParentItemHeader>` JSX block (around line 359), add the prop:

```tsx
<ParentItemHeader
  item={item}
  fields={fields}
  displayTitle={displayTitle}
  collectionSlug={slug}
  collectionId={collection.id}
  collectionType={collection.type}
  catalogItems={catalogItems}
  relatedLabels={relatedLabels}
  timezone={timezone}
  currentLocale={currentLocale}
  canWrite={canWrite}
  tenantLanguages={tenantLanguages ?? []}
  displayKeyFields={displayKeyFields}
  parentLayout={parentRecordLayout}
  formLayout={formLayout}
/>
```

- [ ] **Step 3: Accept formLayout in ParentItemHeader props**

In `src/components/parent-item-header.tsx`, add the import and update the `Props` interface:

```tsx
// Add to existing imports at top:
import type { FormLayout } from "@/types/form-layout";

// Update Props interface (around line 21):
interface Props {
  item: Item;
  fields: Field[];
  displayTitle: string;
  collectionSlug: string;
  collectionId: string;
  collectionType: string;
  catalogItems: CatalogItems;
  relatedLabels: Record<string, Record<string, string>>;
  timezone: string;
  currentLocale: string;
  canWrite: boolean;
  tenantLanguages: TenantLanguage[];
  displayKeyFields: string[];
  parentLayout?: ParentRecordLayout | null;
  formLayout?: FormLayout | null;   // ADD THIS LINE
}
```

- [ ] **Step 4: Thread formLayout through the component function signature and to EditItemDialog**

Update the function signature to destructure the new prop, then pass it to `EditItemDialog`:

```tsx
// In the function body, destructure formLayout:
export function ParentItemHeader({
  item, fields, displayTitle, collectionSlug, collectionId, collectionType,
  catalogItems, relatedLabels, timezone, currentLocale, canWrite,
  tenantLanguages, displayKeyFields, parentLayout, formLayout,  // ADD formLayout here
}: Props) {
```

Then in the `<EditItemDialog>` JSX (around line 196), add the prop:

```tsx
{canWrite && (
  <EditItemDialog
    open={editOpen}
    onOpenChange={setEditOpen}
    item={{ id: item.id, data: item.data }}
    fields={fields}
    collectionId={collectionId}
    collectionSlug={collectionSlug}
    catalogItems={catalogItems}
    tenantLanguages={tenantLanguages}
    currentLocale={currentLocale}
    timezone={timezone}
    formLayout={formLayout}
  />
)}
```

- [ ] **Step 5: Build and verify no TypeScript errors**

```bash
cd c:/Projects/claude/pulsebox && npm run build 2>&1 | tail -20
```

Expected: Build completes with no type errors related to `formLayout`.

- [ ] **Step 6: Commit**

```bash
cd c:/Projects/claude/pulsebox
git add src/app/dashboard/studio/collections/\[slug\]/items/\[id\]/page.tsx src/components/parent-item-header.tsx
git commit -m "fix: pass formLayout to EditItemDialog in parent-record view"
```
