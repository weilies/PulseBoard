"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import * as CollectionsService from "@/lib/services/collections.service";
import * as FieldsService from "@/lib/services/fields.service";
import * as ItemsService from "@/lib/services/items.service";

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export async function createCollection(formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const icon = (formData.get("icon") as string)?.trim() || null;
  const type = (formData.get("type") as string) || "tenant";

  if (!name) return { error: "Name is required" };
  if (!["system", "tenant"].includes(type)) return { error: "Invalid type" };

  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();
  const tenantId = type === "tenant" ? await resolveTenant(user.id) : null;
  if (type === "tenant" && !tenantId) return { error: "No active tenant" };

  // For system collections: verify super_admin role
  if (type === "system") {
    const { data: isSA } = await supabase.rpc("is_super_admin");
    if (!isSA) return { error: "Only super admins can create system collections" };
  }

  // Use admin client to bypass RLS INSERT policy (auth is validated above)
  const writeClient = createAdminClient();

  const result = await CollectionsService.createCollection(writeClient, {
    name, description, icon, type: type as "system" | "tenant", userId: user.id, tenantId,
    skipSuperAdminCheck: type === "system", // guard already done above
  });

  if (result.error) return { error: result.error };
  revalidatePath("/dashboard/studio");
  return { data: result.data };
}

export async function updateCollection(formData: FormData) {
  const collectionId = formData.get("collection_id") as string;
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const icon = (formData.get("icon") as string)?.trim() || null;

  if (!collectionId || !name) return { error: "ID and name are required" };

  const supabase = await createClient();
  const result = await CollectionsService.updateCollection(supabase, { collectionId, name, description, icon });

  if (result.error) return { error: result.error };
  revalidatePath("/dashboard/studio");
  return { data: result.data };
}

export async function updateCollectionTranslations(
  collectionId: string,
  nameTranslations: Record<string, string>,
  descriptionTranslations: Record<string, string>
) {
  if (!collectionId) return { error: "Collection ID is required" };

  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();

  // Clean empty values
  const cleanNames: Record<string, string> = {};
  for (const [k, v] of Object.entries(nameTranslations)) {
    if (v.trim()) cleanNames[k] = v.trim();
  }
  const cleanDescs: Record<string, string> = {};
  for (const [k, v] of Object.entries(descriptionTranslations)) {
    if (v.trim()) cleanDescs[k] = v.trim();
  }

  const result = await CollectionsService.updateCollectionMetadata(supabase, collectionId, {
    name_translations: cleanNames,
    description_translations: cleanDescs,
  });

  if (result.error) return { error: result.error };
  revalidatePath("/dashboard");
  return { data: true };
}

export async function deleteCollection(formData: FormData) {
  const collectionId = formData.get("collection_id") as string;
  if (!collectionId) return { error: "Collection ID is required" };

  const supabase = await createClient();
  const result = await CollectionsService.deleteCollection(supabase, collectionId);

  if (result.error) return { error: result.error };
  revalidatePath("/dashboard/studio");
  return { data: true };
}

/**
 * Update collection metadata (display_key_fields, unique_constraints, effective_date_field, cascade_rules).
 */
export async function updateCollectionMetadata(
  collectionId: string,
  metadata: Record<string, unknown>
) {
  if (!collectionId) return { error: "Collection ID is required" };

  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  // Validate metadata shape
  const allowed = ["display_key_fields", "unique_constraints", "effective_date_field", "cascade_rules", "child_tab_sort_order"];
  const cleaned: Record<string, unknown> = {};
  for (const key of allowed) {
    if (metadata[key] !== undefined) cleaned[key] = metadata[key];
  }

  const supabase = await createClient();

  // Merge with existing metadata (don't clobber keys not sent)
  const { data: existing } = await supabase
    .from("collections")
    .select("metadata")
    .eq("id", collectionId)
    .maybeSingle();

  const merged = { ...((existing?.metadata ?? {}) as Record<string, unknown>), ...cleaned };

  const { error } = await supabase
    .from("collections")
    .update({ metadata: merged, updated_at: new Date().toISOString() })
    .eq("id", collectionId);

  if (error) return { error: error.message };
  revalidatePath("/dashboard/studio");
  return { data: true };
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

export async function createField(formData: FormData) {
  const collectionId = formData.get("collection_id") as string;
  const name = (formData.get("name") as string)?.trim();
  const fieldType = formData.get("field_type") as string;
  const isRequired = formData.get("is_required") === "true";
  const isUnique = formData.get("is_unique") === "true";
  const isTranslatable = formData.get("is_translatable") === "true";
  const optionsRaw = formData.get("options") as string;
  const collectionSlug = formData.get("collection_slug") as string;

  if (!collectionId || !name || !fieldType) {
    return { error: "Collection, name, and field type are required" };
  }

  let options: Record<string, unknown> = {};
  try {
    options = optionsRaw ? JSON.parse(optionsRaw) : {};
  } catch {
    return { error: "Invalid field options format" };
  }

  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();
  const result = await FieldsService.createField(supabase, {
    collectionId, name, fieldType, isRequired, isUnique, isTranslatable, options, userId: user.id,
  });

  if (result.error) return { error: result.error };
  revalidatePath(`/dashboard/studio/collections/${collectionSlug}/schema`);
  return { data: result.data };
}

export async function updateField(formData: FormData) {
  const fieldId = formData.get("field_id") as string;
  const collectionSlug = formData.get("collection_slug") as string;
  const isRequired = formData.get("is_required") === "true";
  const isUnique = formData.get("is_unique") === "true";
  const isTranslatable = formData.get("is_translatable") === "true";
  const optionsRaw = formData.get("options") as string;

  if (!fieldId) return { error: "Field ID is required" };

  let options: Record<string, unknown> = {};
  try {
    options = optionsRaw ? JSON.parse(optionsRaw) : {};
  } catch {
    return { error: "Invalid field options format" };
  }

  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();
  const result = await FieldsService.updateField(supabase, fieldId, { isRequired, isUnique, isTranslatable, options });

  if (result.error) return { error: result.error };
  revalidatePath(`/dashboard/studio/collections/${collectionSlug}/schema`);
  return { data: true };
}

export async function deleteField(formData: FormData) {
  const fieldId = formData.get("field_id") as string;
  const collectionSlug = formData.get("collection_slug") as string;
  if (!fieldId) return { error: "Field ID is required" };

  const supabase = await createClient();
  const result = await FieldsService.deleteField(supabase, fieldId);

  if (result.error) return { error: result.error };
  revalidatePath(`/dashboard/studio/collections/${collectionSlug}/schema`);
  return { data: true };
}

export async function updateFieldLabels(
  fieldId: string,
  collectionSlug: string,
  labels: Record<string, string>
) {
  if (!fieldId) return { error: "Field ID is required" };

  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();
  const result = await FieldsService.updateFieldLabels(supabase, fieldId, labels);

  if (result.error) return { error: result.error };
  revalidatePath(`/dashboard/studio/collections/${collectionSlug}/schema`);
  return { data: true };
}

export async function moveField(formData: FormData) {
  const fieldId = formData.get("field_id") as string;
  const direction = formData.get("direction") as "up" | "down";
  const collectionSlug = formData.get("collection_slug") as string;
  const currentOrder = Number(formData.get("sort_order"));
  const collectionId = formData.get("collection_id") as string;

  if (!fieldId || !direction || !collectionId) return { error: "Missing required params" };

  const supabase = await createClient();
  await FieldsService.moveField(supabase, { fieldId, direction, currentOrder, collectionId });

  revalidatePath(`/dashboard/studio/collections/${collectionSlug}/schema`);
  return { data: true };
}

export async function reorderFields(fieldIds: string[], collectionSlug: string) {
  if (!fieldIds?.length || !collectionSlug) {
    return { error: "Missing required params" };
  }

  const supabase = await createClient();

  for (let i = 0; i < fieldIds.length; i++) {
    await supabase
      .from("collection_fields")
      .update({ sort_order: i + 1 })
      .eq("id", fieldIds[i]);
  }

  revalidatePath(`/dashboard/studio/collections/${collectionSlug}/schema`);
  return { data: true };
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export async function createItem(formData: FormData) {
  const collectionId = formData.get("collection_id") as string;
  const collectionSlug = formData.get("collection_slug") as string;
  const dataRaw = formData.get("data") as string;

  if (!collectionId || !dataRaw) return { error: "Collection and data are required" };

  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  let data: Record<string, unknown>;
  try { data = JSON.parse(dataRaw); }
  catch { return { error: "Invalid data format" }; }

  const tenantId = await resolveTenant(user.id);
  if (!tenantId) return { error: "No active tenant" };

  const supabase = await createClient();
  const result = await ItemsService.createItem(supabase, { collectionId, data, userId: user.id, tenantId });

  if (result.error) return { error: result.error };
  revalidatePath(`/dashboard/studio/collections/${collectionSlug}/items`);
  return { data: true };
}

export async function updateItem(formData: FormData) {
  const itemId = formData.get("item_id") as string;
  const collectionSlug = formData.get("collection_slug") as string;
  const dataRaw = formData.get("data") as string;

  if (!itemId || !dataRaw) return { error: "Item ID and data are required" };

  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  let data: Record<string, unknown>;
  try { data = JSON.parse(dataRaw); }
  catch { return { error: "Invalid data format" }; }

  const tenantId = await resolveTenant(user.id);
  if (!tenantId) return { error: "No active tenant" };

  const supabase = await createClient();
  const result = await ItemsService.updateItem(supabase, { itemId, data, userId: user.id, tenantId });

  if (result.error) return { error: result.error };
  revalidatePath(`/dashboard/studio/collections/${collectionSlug}/items`);
  return { data: true };
}

export async function deleteItem(formData: FormData) {
  const itemId = formData.get("item_id") as string;
  const collectionSlug = formData.get("collection_slug") as string;
  if (!itemId) return { error: "Item ID is required" };

  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  const tenantId = await resolveTenant(user.id);

  const supabase = await createClient();
  const result = await ItemsService.deleteItem(supabase, itemId, tenantId ?? undefined);

  if (result.error) return { error: result.error };
  revalidatePath(`/dashboard/studio/collections/${collectionSlug}/items`);
  return { data: true };
}

// ---------------------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------------------

export async function exportItems(collectionSlug: string) {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  const tenantId = await resolveTenant(user.id);
  if (!tenantId) return { error: "No active tenant" };

  const supabase = await createClient();
  return ItemsService.exportItems(supabase, { collectionSlug, tenantId });
}

// ---------------------------------------------------------------------------
// Form Layout
// ---------------------------------------------------------------------------

export async function saveFormLayout(
  collectionId: string,
  layout: import("@/types/form-layout").FormLayout
) {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();

  const { data: col, error: fetchErr } = await supabase
    .from("collections")
    .select("metadata, slug")
    .eq("id", collectionId)
    .single();

  if (fetchErr || !col) return { error: "Collection not found" };

  const newMeta = { ...(col.metadata ?? {}), form_layout: layout };

  const { error } = await supabase
    .from("collections")
    .update({ metadata: newMeta })
    .eq("id", collectionId);

  if (error) return { error: error.message };

  revalidatePath(`/dashboard/studio/collections/${col.slug}/form`);
  revalidatePath(`/dashboard/studio/collections/${col.slug}/items`);
  return { data: true };
}

export async function toggleFieldShowInGrid(fieldId: string, showInGrid: boolean) {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();

  const { data: field, error: fetchErr } = await supabase
    .from("collection_fields")
    .select("id, collections(slug)")
    .eq("id", fieldId)
    .single();

  if (fetchErr || !field) return { error: "Field not found" };

  const { error } = await supabase
    .from("collection_fields")
    .update({ show_in_grid: showInGrid })
    .eq("id", fieldId);

  if (error) return { error: error.message };

  const slug = (field.collections as unknown as { slug: string } | null)?.slug;
  if (slug) {
    revalidatePath(`/dashboard/studio/collections/${slug}/schema`);
    revalidatePath(`/dashboard/studio/collections/${slug}/items`);
  }
  return { data: true };
}

export async function importItems(
  collectionSlug: string,
  rows: Record<string, unknown>[],
  fieldMapping: Record<string, string>
) {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  const tenantId = await resolveTenant(user.id);
  if (!tenantId) return { error: "No active tenant" };

  const supabase = await createClient();
  const result = await ItemsService.importItems(supabase, { collectionSlug, rows, fieldMapping, userId: user.id, tenantId });

  if (!result.error) {
    revalidatePath(`/dashboard/studio/collections/${collectionSlug}/items`);
  }
  return result;
}
