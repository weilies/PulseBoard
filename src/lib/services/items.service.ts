import type { SupabaseClient } from "@supabase/supabase-js";

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

// ---------------------------------------------------------------------------
// Item CRUD
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

  // System collection items have no tenant_id (global)
  const { data: col } = await supabase
    .from("collections")
    .select("type")
    .eq("id", collectionId)
    .maybeSingle();
  const itemTenantId = col?.type === "system" ? null : tenantId;

  // Pre-save hook point (Phase 9+: run tenant scripts here)

  const { error } = await supabase.from("collection_items").insert({
    collection_id: collectionId,
    tenant_id: itemTenantId,
    data,
    created_by: userId,
    updated_by: userId,
  });

  if (error) return { error: error.message };

  // Post-save hook point

  return { data: true };
}

export async function updateItem(
  supabase: SupabaseClient,
  params: {
    itemId: string;
    data: Record<string, unknown>;
    userId: string;
  }
) {
  const { itemId, data, userId } = params;

  // Pre-save hook point

  const { error } = await supabase
    .from("collection_items")
    .update({ data, updated_by: userId, updated_at: new Date().toISOString() })
    .eq("id", itemId);

  if (error) return { error: error.message };

  // Post-save hook point

  return { data: true };
}

export async function deleteItem(
  supabase: SupabaseClient,
  itemId: string
) {
  // Pre-delete hook point

  const { error } = await supabase.from("collection_items").delete().eq("id", itemId);
  if (error) return { error: error.message };

  // Post-delete hook point

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

  const isSystem = collection.type === "system";
  let query = supabase
    .from("collection_items")
    .select("id, data, created_at, updated_at")
    .eq("collection_id", collection.id)
    .order("created_at", { ascending: true });

  if (!isSystem) query = query.eq("tenant_id", tenantId);

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
// Import
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
    .select("id, type, collection_fields(slug, name, field_type, options, is_required, is_unique)")
    .eq("slug", collectionSlug)
    .maybeSingle();

  if (!collection) return { error: "Collection not found" };

  type FieldDef = {
    slug: string; name: string; field_type: string;
    options: Record<string, unknown>; is_required: boolean; is_unique: boolean;
  };
  const fields = collection.collection_fields as FieldDef[];
  const fieldMap = new Map(fields.map((f) => [f.slug, f]));
  const itemTenantId = collection.type === "system" ? null : tenantId;

  const errors: ImportError[] = [];
  const validItems: { data: Record<string, unknown> }[] = [];
  const uniqueTracker: Record<string, Set<string>> = {};
  for (const f of fields) {
    if (f.is_unique) uniqueTracker[f.slug] = new Set();
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const itemData: Record<string, unknown> = {};
    let rowValid = true;

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

    for (const f of fields) {
      if (f.is_required) {
        const val = itemData[f.slug];
        if (val === undefined || val === null || val === "") {
          errors.push({ row: i + 1, field: f.name, message: "Required field is empty" });
          rowValid = false;
        }
      }
    }

    for (const f of fields) {
      if (f.is_unique && itemData[f.slug] !== undefined && itemData[f.slug] !== null && itemData[f.slug] !== "") {
        const key = String(itemData[f.slug]);
        if (uniqueTracker[f.slug].has(key)) {
          errors.push({ row: i + 1, field: f.name, message: `Duplicate value "${key}" in import` });
          rowValid = false;
        } else {
          uniqueTracker[f.slug].add(key);
        }
      }
    }

    if (rowValid) validItems.push({ data: itemData });
  }

  if (errors.length > 0) {
    return { error: "Validation failed", validationErrors: errors, totalRows: rows.length, validCount: validItems.length };
  }

  if (validItems.length === 0) return { error: "No valid rows to import" };

  const insertPayload = validItems.map((item) => ({
    collection_id: collection.id,
    tenant_id: itemTenantId,
    data: item.data,
    created_by: userId,
    updated_by: userId,
  }));

  const { error: insertError } = await supabase.from("collection_items").insert(insertPayload);
  if (insertError) return { error: insertError.message };

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
