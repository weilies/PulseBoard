import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { validateItemData } from "@/lib/collection-validation";
import { runPreSaveWebhooks, firePostSaveWebhooks, fireWebhooks } from "@/lib/webhooks";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportField = {
  slug: string;
  name: string;
  field_type: string;
  options: Record<string, unknown>;
};

export type ExportItem = {
  id: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type ImportRow = Record<string, unknown>;

export type ImportError = {
  row: number;
  field: string;
  message: string;
};

type CollectionRecord = {
  id: string;
  slug: string;
  type: string;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function lookupCollection(collectionId: string): Promise<CollectionRecord | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("collections")
    .select("id, slug, type")
    .eq("id", collectionId)
    .maybeSingle();
  return data as CollectionRecord | null;
}

async function lookupItemWithCollection(itemId: string): Promise<{
  item: Record<string, unknown>;
  col: CollectionRecord;
} | null> {
  const db = createAdminClient();
  const { data: item } = await db
    .from("collection_items")
    .select("id, collection_id, data, created_at, updated_at")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return null;
  const col = await lookupCollection(item.collection_id as string);
  return col ? { item: item as Record<string, unknown>, col } : null;
}

/** Parse the error body returned by runPreSaveHook into a string. */
async function extractHookError(response: Response): Promise<string> {
  try {
    const json = await response.json();
    if (typeof json.message === "string") return json.message;
    if (typeof json.error === "string") return json.error;
    if (json.errors && typeof json.errors === "object") {
      return Object.values(json.errors as Record<string, string>).join("; ");
    }
  } catch { /* ignore */ }
  return "Pre-save hook rejected the request";
}

// ---------------------------------------------------------------------------
// Item CRUD — identical pipeline to the REST API routes
// ---------------------------------------------------------------------------

export async function createItem(
  supabase: SupabaseClient,
  params: {
    collectionId: string;
    data: Record<string, unknown>;
    userId: string;
    tenantId: string;
  }
) {
  const { collectionId, data, userId, tenantId } = params;

  const col = await lookupCollection(collectionId);
  if (!col) return { error: "Collection not found" };

  // 1. Field validation + rule engine
  const validation = await validateItemData(collectionId, data, false, undefined, tenantId, col.slug);
  if (!validation.valid) {
    return {
      error: validation.errors[0]?.message ?? "Validation failed",
      validationErrors: validation.errors,
    };
  }
  const itemData = validation.normalizedData;

  // 2. Pre-save webhooks — can block the save
  const blocked = await runPreSaveWebhooks(tenantId, col.slug, "create", itemData);
  if (blocked) return { error: await extractHookError(blocked) };

  // 3. Insert
  const { data: inserted, error } = await supabase
    .from("collection_items")
    .insert({
      collection_id: collectionId,
      tenant_id: tenantId,
      data: itemData,
      created_by: userId,
      updated_by: userId,
    })
    .select("id, data, created_at, updated_at")
    .single();

  if (error) return { error: error.message };

  // 4. Non-blocking post-save (outbound webhooks + post_save webhooks)
  after(() => {
    fireWebhooks(tenantId, col.slug, "item.created", inserted as Record<string, unknown>);
    firePostSaveWebhooks(tenantId, col.slug, "create", inserted, inserted.id);
  });

  return { data: true };
}

export async function updateItem(
  supabase: SupabaseClient,
  params: {
    itemId: string;
    data: Record<string, unknown>;
    userId: string;
    tenantId: string;
  }
) {
  const { itemId, data, userId, tenantId } = params;

  const resolved = await lookupItemWithCollection(itemId);
  if (!resolved) return { error: "Item not found" };
  const { col } = resolved;

  // 1. Field validation + rule engine
  const validation = await validateItemData(col.id, data, true, itemId, tenantId, col.slug);
  if (!validation.valid) {
    return {
      error: validation.errors[0]?.message ?? "Validation failed",
      validationErrors: validation.errors,
    };
  }
  const itemData = validation.normalizedData;

  // 2. Pre-save webhooks
  const blocked = await runPreSaveWebhooks(tenantId, col.slug, "update", itemData, itemId);
  if (blocked) return { error: await extractHookError(blocked) };

  // 3. Update
  const { data: updated, error } = await supabase
    .from("collection_items")
    .update({ data: itemData, updated_by: userId, updated_at: new Date().toISOString() })
    .eq("id", itemId)
    .select("id, data, updated_at")
    .single();

  if (error) return { error: error.message };

  // 4. Non-blocking post-save
  after(() => {
    fireWebhooks(tenantId, col.slug, "item.updated", updated as Record<string, unknown>);
    firePostSaveWebhooks(tenantId, col.slug, "update", updated, itemId);
  });

  return { data: true };
}

/**
 * Find all child items that reference the given parent item, across all collections
 * that have a relation field pointing to parentCollectionId.
 */
async function findChildRefs(
  db: ReturnType<typeof createAdminClient>,
  parentCollectionId: string,
  parentItemId: string
): Promise<{ collectionId: string; fieldSlug: string; itemId: string }[]> {
  const { data: relationFields } = await db
    .from("collection_fields")
    .select("collection_id, slug, options")
    .eq("field_type", "relation");

  const childRefs: { collectionId: string; fieldSlug: string; itemId: string }[] = [];

  for (const rf of relationFields ?? []) {
    const opts = (rf.options ?? {}) as Record<string, unknown>;
    if (opts.related_collection_id !== parentCollectionId) continue;

    // Correct PostgREST JSONB filter syntax: data->>fieldSlug (no quotes around key)
    const { data: childItems } = await db
      .from("collection_items")
      .select("id")
      .eq("collection_id", rf.collection_id)
      .eq(`data->>${rf.slug}`, parentItemId);

    for (const ci of childItems ?? []) {
      childRefs.push({ collectionId: rf.collection_id, fieldSlug: rf.slug, itemId: ci.id as string });
    }
  }

  return childRefs;
}

export async function deleteItem(
  supabase: SupabaseClient,
  itemId: string,
  tenantId?: string
): Promise<{ data: true } | { error: string }> {
  const db = createAdminClient();

  // Fetch item
  const { data: item } = await db
    .from("collection_items")
    .select("id, collection_id, data, created_at, updated_at")
    .eq("id", itemId)
    .maybeSingle();

  if (!item) return { data: true }; // already gone

  const col = await lookupCollection(item.collection_id as string);
  if (!col) return { error: "Collection not found" };

  // Read cascade rule from THIS collection's metadata
  const { data: fullCollection } = await db
    .from("collections")
    .select("metadata")
    .eq("id", col.id)
    .maybeSingle();

  const cascadeRules = ((fullCollection?.metadata as Record<string, unknown>)?.cascade_rules ?? {}) as { on_parent_delete?: string };
  const cascadeAction = cascadeRules.on_parent_delete ?? "restrict";

  // Find all child items referencing this item
  const childRefs = await findChildRefs(db, col.id, itemId);
  const hasChildren = childRefs.length > 0;

  if (cascadeAction === "restrict" && hasChildren) {
    return {
      error: `Cannot delete: child records exist. Change the "On Delete" setting to allow deletion.`,
    };
  }

  if (cascadeAction === "cascade" && hasChildren) {
    // Recursively delete each child — their own cascade rules apply to grandchildren
    for (const ref of childRefs) {
      const result = await deleteItem(supabase, ref.itemId, tenantId);
      if ("error" in result) return result;
    }
  }

  if (cascadeAction === "nullify" && hasChildren) {
    for (const ref of childRefs) {
      const { data: childItem } = await db
        .from("collection_items")
        .select("data")
        .eq("id", ref.itemId)
        .single();

      if (childItem) {
        const updatedData = { ...(childItem.data as Record<string, unknown>) };
        delete updatedData[ref.fieldSlug];
        await supabase
          .from("collection_items")
          .update({ data: updatedData })
          .eq("id", ref.itemId);
      }
    }
  }

  // Delete the item itself
  const { error } = await supabase.from("collection_items").delete().eq("id", itemId);
  if (error) return { error: error.message };

  // Non-blocking post-delete webhooks
  if (tenantId) {
    const snapshot = item as Record<string, unknown>;
    after(() => {
      fireWebhooks(tenantId, col.slug, "item.deleted", snapshot);
      firePostSaveWebhooks(tenantId, col.slug, "delete", snapshot, itemId);
    });
  }

  return { data: true };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function exportItems(
  supabase: SupabaseClient,
  params: { collectionSlug: string; tenantId: string }
) {
  const { collectionSlug, tenantId } = params;

  const { data: collection } = await supabase
    .from("collections")
    .select("id, slug, name, type, collection_fields(slug, name, field_type, options, sort_order)")
    .eq("slug", collectionSlug)
    .maybeSingle();

  if (!collection) return { error: "Collection not found" };

  const rawFields = collection.collection_fields as (ExportField & { sort_order: number })[];
  const fields: ExportField[] = rawFields
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(({ slug, name, field_type, options }) => ({ slug, name, field_type, options }));

  let query = supabase
    .from("collection_items")
    .select("id, data, created_at, updated_at")
    .eq("collection_id", collection.id)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  const { data: items, error } = await query;
  if (error) return { error: error.message };

  return {
    data: {
      collectionName: collection.name,
      fields,
      items: (items ?? []) as ExportItem[],
    },
  };
}

// ---------------------------------------------------------------------------
// Import — same pipeline as createItem, applied per row
// Errors from validation AND onPreSave hook are collected.
// If any row fails, the entire import is suspended (zero rows inserted).
// ---------------------------------------------------------------------------

export async function importItems(
  supabase: SupabaseClient,
  params: {
    collectionSlug: string;
    rows: ImportRow[];
    fieldMapping: Record<string, string>;
    userId: string | null;
    tenantId: string;
  }
) {
  const { collectionSlug, rows, fieldMapping, userId, tenantId } = params;

  const { data: collection } = await supabase
    .from("collections")
    .select("id, slug, type, collection_fields(slug, name, field_type, options, is_required, is_unique)")
    .eq("slug", collectionSlug)
    .maybeSingle();

  if (!collection) return { error: "Collection not found" };

  type FieldDef = {
    slug: string; name: string; field_type: string;
    options: Record<string, unknown>; is_required: boolean; is_unique: boolean;
  };
  const fields = collection.collection_fields as FieldDef[];
  const fieldMap = new Map(fields.map((f) => [f.slug, f]));
  const itemTenantId = tenantId;

  const errors: ImportError[] = [];
  // Within-batch duplicate tracker (catches duplicates within the file itself)
  const batchUniqueTracker: Record<string, Set<string>> = {};
  for (const f of fields) {
    if (f.is_unique) batchUniqueTracker[f.slug] = new Set();
  }

  // Phase 1: type-convert + within-batch unique check, build candidate data per row
  const candidates: Array<{ rowIndex: number; data: Record<string, unknown> } | null> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const itemData: Record<string, unknown> = {};
    let rowValid = true;

    // Convert values per mapped column
    for (const [csvCol, fieldSlug] of Object.entries(fieldMapping)) {
      if (!fieldSlug) continue;
      const field = fieldMap.get(fieldSlug);
      if (!field) continue;
      const converted = convertValue(row[csvCol], field.field_type);
      if (converted.error) {
        errors.push({ row: i + 1, field: field.name, message: converted.error });
        rowValid = false;
        continue;
      }
      itemData[fieldSlug] = converted.value;
    }

    // Within-batch duplicate check
    for (const f of fields) {
      if (
        f.is_unique &&
        itemData[f.slug] !== undefined &&
        itemData[f.slug] !== null &&
        itemData[f.slug] !== ""
      ) {
        const key = String(itemData[f.slug]);
        if (batchUniqueTracker[f.slug].has(key)) {
          errors.push({ row: i + 1, field: f.name, message: `Duplicate value "${key}" within import file` });
          rowValid = false;
        } else {
          batchUniqueTracker[f.slug].add(key);
        }
      }
    }

    candidates.push(rowValid ? { rowIndex: i, data: itemData } : null);
  }

  // Phase 2: validateItemData + onPreSave hook per valid candidate
  // Run sequentially to avoid overwhelming hook endpoints
  const validItems: { data: Record<string, unknown> }[] = [];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const { rowIndex, data: itemData } = candidate;

    // Full validation + rule engine
    const validation = await validateItemData(collection.id, itemData, false, undefined, tenantId, collectionSlug);
    if (!validation.valid) {
      for (const ve of validation.errors) {
        const fieldDef = fields.find((f) => f.slug === ve.field);
        errors.push({
          row: rowIndex + 1,
          field: fieldDef?.name ?? ve.field,
          message: ve.message,
        });
      }
      continue;
    }
    const normalizedData = validation.normalizedData;

    // Pre-save webhooks — if they reject, flag the row and continue checking others
    const blocked = await runPreSaveWebhooks(tenantId, collection.slug, "create", normalizedData);
    if (blocked) {
      const msg = await extractHookError(blocked);
      errors.push({ row: rowIndex + 1, field: "onPreSave hook", message: msg });
      continue;
    }

    validItems.push({ data: normalizedData });
  }

  // Phase 3: if any row failed, suspend the entire import
  if (errors.length > 0) {
    return {
      error: "Validation failed",
      validationErrors: errors,
      totalRows: rows.length,
      validCount: validItems.length,
    };
  }

  if (validItems.length === 0) return { error: "No valid rows to import" };

  // Phase 4: batch insert all valid rows
  const insertPayload = validItems.map((item) => ({
    collection_id: collection.id,
    tenant_id: itemTenantId,
    data: item.data,
    created_by: userId,
    updated_by: userId,
  }));

  const { data: insertedRows, error: insertError } = await supabase
    .from("collection_items")
    .insert(insertPayload)
    .select("id, data, created_at, updated_at");

  if (insertError) return { error: insertError.message };

  // Phase 5: fire outbound webhooks + post-save webhooks for each inserted row (non-blocking)
  if (insertedRows && insertedRows.length > 0) {
    after(() => {
      Promise.allSettled(
        (insertedRows as Record<string, unknown>[]).map((row) =>
          Promise.allSettled([
            fireWebhooks(tenantId, collection.slug, "item.created", row),
            firePostSaveWebhooks(tenantId, collection.slug, "create", row, row.id as string),
          ])
        )
      );
    });
  }

  return { data: { imported: validItems.length, total: rows.length } };
}

// ---------------------------------------------------------------------------
// Value conversion helper (shared with import-dialog)
// ---------------------------------------------------------------------------

export function convertValue(
  raw: unknown,
  fieldType: string
): { value: unknown; error?: undefined } | { value?: undefined; error: string } {
  if (raw === undefined || raw === null || raw === "") return { value: null };
  const str = String(raw).trim();
  if (str === "") return { value: null };

  switch (fieldType) {
    case "text":
    case "richtext":
      return { value: str };
    case "number": {
      const num = Number(str);
      if (isNaN(num)) return { error: `"${str}" is not a valid number` };
      return { value: num };
    }
    case "date": {
      const d = new Date(str);
      if (isNaN(d.getTime())) return { error: `"${str}" is not a valid date` };
      return { value: d.toISOString().split("T")[0] };
    }
    case "datetime": {
      const dt = new Date(str);
      if (isNaN(dt.getTime())) return { error: `"${str}" is not a valid datetime` };
      return { value: dt.toISOString() };
    }
    case "boolean": {
      const lower = str.toLowerCase();
      if (["true", "yes", "1"].includes(lower)) return { value: true };
      if (["false", "no", "0"].includes(lower)) return { value: false };
      return { error: `"${str}" is not a valid boolean (use yes/no, true/false, 1/0)` };
    }
    case "select":
      return { value: str };
    case "multiselect": {
      const values = str.split(",").map((v) => v.trim()).filter(Boolean);
      return { value: values };
    }
    case "json": {
      try { return { value: JSON.parse(str) }; }
      catch { return { error: `"${str.slice(0, 30)}..." is not valid JSON` }; }
    }
    default:
      return { value: str };
  }
}
