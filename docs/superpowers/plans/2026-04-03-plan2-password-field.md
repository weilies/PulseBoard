# Password Field Type — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a write-only "password" field type — masked in UI, accessible via content API, never exposed in logs.

**Architecture:** Four touch-points: (1) field type registration, (2) UI rendering as masked write-only input, (3) Query Generator masking, (4) log sanitizer utility applied before any audit write.

**Tech Stack:** Next.js 15, TypeScript, Supabase

---

### Task 1: Register the password field type

**Files:**
- Modify: `src/lib/services/fields.service.ts`
- Modify: `src/components/create-field-dialog.tsx`

- [ ] **Step 1: Add "password" to the valid types constant in fields.service.ts**

In `src/lib/services/fields.service.ts`, update the `VALID_FIELD_TYPES` array (line 4):

```typescript
const VALID_FIELD_TYPES = [
  "text", "number", "date", "datetime", "boolean", "file",
  "select", "multiselect", "richtext", "json", "relation", "password",
] as const;
```

- [ ] **Step 2: Add "password" option to the field type picker in create-field-dialog.tsx**

In `src/components/create-field-dialog.tsx`, update the `FIELD_TYPES` array (line 39):

```tsx
const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & Time" },
  { value: "boolean", label: "Toggle (Boolean)" },
  { value: "select", label: "Select (single)" },
  { value: "multiselect", label: "Multi-Select" },
  { value: "file", label: "File / Image" },
  { value: "richtext", label: "Rich Text" },
  { value: "json", label: "JSON" },
  { value: "relation", label: "Relation (link to another collection)" },
  { value: "password", label: "Password / Secret (write-only)" },
];
```

- [ ] **Step 3: Commit**

```bash
cd c:/Projects/claude/pulsebox
git add src/lib/services/fields.service.ts src/components/create-field-dialog.tsx
git commit -m "feat: register password field type"
```

---

### Task 2: Render password fields as masked write-only inputs in forms

**Files:**
- Modify: `src/components/item-form-dialog.tsx`

- [ ] **Step 1: Add masked write-only input rendering in FieldInputControl**

In `src/components/item-form-dialog.tsx`, inside the `FieldInputControl` function, find the `<>` return block (around line 585). Add the password rendering **before** the `{field.field_type === "text" && !useTextarea && (` block:

```tsx
{field.field_type === "password" && (
  <div className="space-y-1">
    <Input
      type="password"
      autoComplete="new-password"
      placeholder="Enter new value to update"
      value={(value as string) ?? ""}
      onChange={(e) => onChange(field.slug, e.target.value)}
      className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500/50 dark:placeholder:text-gray-400/50"
    />
    <p className="text-[11px] text-gray-500 dark:text-gray-400">
      Leave blank to keep existing value unchanged.
    </p>
  </div>
)}
```

- [ ] **Step 2: Ensure password fields are never pre-populated on edit**

Find the `EditItemDialog` function (around line 1165). Locate where `initialValues` or form state is initialised from `item.data`. Add a filter to strip password field values on load:

Search for the pattern where values are initialised from `item.data` in the edit dialog. It will look something like:
```tsx
const [values, setValues] = useState<ItemData>(item.data ?? {});
```

Change it to strip password field values:
```tsx
const [values, setValues] = useState<ItemData>(() => {
  const data = { ...(item.data ?? {}) };
  for (const f of fields) {
    if (f.field_type === "password") delete data[f.slug];
  }
  return data;
});
```

- [ ] **Step 3: Skip empty password values on submit**

Find the submit/save handler in `EditItemDialog`. Before the `updateItem` call, add logic to remove empty password fields from the payload (so empty = "no change"):

```tsx
// Inside the submit handler, before calling updateItem:
const submitValues = { ...values };
for (const f of fields) {
  if (f.field_type === "password" && (submitValues[f.slug] === "" || submitValues[f.slug] === undefined)) {
    delete submitValues[f.slug];
  }
}
// Use submitValues instead of values in the updateItem call
```

- [ ] **Step 4: Add "password" to FIELD_TYPE_LABELS in parent-record-layout-builder.tsx**

In `src/components/parent-record-layout-builder.tsx`, add to `FIELD_TYPE_LABELS` (line 26):

```typescript
const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  datetime: "DateTime",
  boolean: "Toggle",
  file: "File",
  select: "Select",
  multiselect: "Multi-Select",
  richtext: "Rich Text",
  json: "JSON",
  relation: "Relation",
  password: "Password / Secret",
};
```

- [ ] **Step 5: Build check**

```bash
cd c:/Projects/claude/pulsebox && npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
cd c:/Projects/claude/pulsebox
git add src/components/item-form-dialog.tsx src/components/parent-record-layout-builder.tsx
git commit -m "feat: render password fields as masked write-only inputs"
```

---

### Task 3: Create the log sanitizer utility

**Files:**
- Create: `src/lib/sanitize-log-payload.ts`

- [ ] **Step 1: Write the sanitizer**

Create `src/lib/sanitize-log-payload.ts`:

```typescript
/**
 * Replaces password field values with "<secret>" before any log write.
 * Call this on any data object before passing it to the activity logger.
 */
export type MinimalField = { slug: string; field_type: string };

export function sanitizePasswordFields(
  data: Record<string, unknown>,
  fields: MinimalField[]
): Record<string, unknown> {
  const passwordSlugs = new Set(
    fields.filter((f) => f.field_type === "password").map((f) => f.slug)
  );
  if (passwordSlugs.size === 0) return data;

  const sanitized = { ...data };
  for (const slug of passwordSlugs) {
    if (slug in sanitized) {
      sanitized[slug] = "<secret>";
    }
  }
  return sanitized;
}
```

- [ ] **Step 2: Find where item create/update is logged and apply the sanitizer**

Search for audit log writes in the studio actions:

```bash
cd c:/Projects/claude/pulsebox && grep -r "app_logs\|logActivity\|insertLog" src/app/actions/ --include="*.ts" -l
```

For each file found, import and apply `sanitizePasswordFields` on item data before the log insert. The pattern will be something like:

```typescript
import { sanitizePasswordFields } from "@/lib/sanitize-log-payload";

// Before logging:
const safeData = sanitizePasswordFields(itemData, fields);
// Use safeData in the log payload instead of itemData
```

- [ ] **Step 3: Commit**

```bash
cd c:/Projects/claude/pulsebox
git add src/lib/sanitize-log-payload.ts
git commit -m "feat: add sanitizePasswordFields utility for log safety"
```

---

### Task 4: Mask password fields in Query Generator results

**Files:**
- Modify: `src/lib/query-engine.ts`
- Modify: `src/app/api/queries/collections/route.ts`

- [ ] **Step 1: Fetch field types alongside items in the query engine**

In `src/lib/query-engine.ts`, in the `fetchAllCollections` function (around line 88), update the collection fetch to also get field types:

```typescript
// Replace the existing collections fetch:
const { data: colMeta } = await db
  .from("collections")
  .select("id, type, tenant_id, collection_fields(slug, field_type)")
  .eq("id", col.id)
  .single();

if (!colMeta) return { alias: col.alias, rows: [] };
```

Then after building `rows`, mask password field values:

```typescript
// After building the rows array, add masking:
const passwordSlugs = new Set(
  ((colMeta.collection_fields ?? []) as { slug: string; field_type: string }[])
    .filter((f) => f.field_type === "password")
    .map((f) => `${col.alias}.${f.slug}`)
);

const maskedRows = rows.map((row) => {
  if (passwordSlugs.size === 0) return row;
  const masked = { ...row };
  for (const key of passwordSlugs) {
    if (key in masked) masked[key] = "****";
  }
  return masked;
});

return { alias: col.alias, rows: maskedRows };
```

- [ ] **Step 2: Exclude password fields from the Query Generator schema endpoint**

In `src/app/api/queries/collections/route.ts`, update the field mapping (line 46) to exclude password fields:

```typescript
fields: (c.collection_fields ?? [])
  .filter((f: { slug: string; name: string; field_type: string }) => f.field_type !== "password")
  .map((f: { slug: string; name: string; field_type: string }) => ({
    slug: f.slug,
    name: f.name,
    field_type: f.field_type,
  })),
```

- [ ] **Step 3: Build check**

```bash
cd c:/Projects/claude/pulsebox && npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
cd c:/Projects/claude/pulsebox
git add src/lib/query-engine.ts src/app/api/queries/collections/route.ts
git commit -m "feat: mask password fields in query engine results and exclude from schema API"
```
