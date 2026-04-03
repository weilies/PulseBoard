import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify, generateUniqueSlug } from "./slugify";

const VALID_FIELD_TYPES = [
  "text", "number", "date", "datetime", "boolean", "file",
  "select", "multiselect", "richtext", "json", "relation", "password",
] as const;

export async function createField(
  supabase: SupabaseClient,
  params: {
    collectionId: string;
    name: string;
    fieldType: string;
    isRequired: boolean;
    isUnique: boolean;
    isTranslatable: boolean;
    options: Record<string, unknown>;
    userId: string;
  }
) {
  const { collectionId, name, fieldType, isRequired, isUnique, isTranslatable, options, userId } = params;

  // Only text and richtext support translation (enforced by DB constraint too)
  const canBeTranslatable = ["text", "richtext"].includes(fieldType);
  const finalIsTranslatable = canBeTranslatable && isTranslatable;

  if (!VALID_FIELD_TYPES.includes(fieldType as typeof VALID_FIELD_TYPES[number])) {
    return { error: "Invalid field type" };
  }

  // Get highest current sort_order
  const { data: lastField } = await supabase
    .from("collection_fields")
    .select("sort_order")
    .eq("collection_id", collectionId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOrder = (lastField?.sort_order ?? -1) + 1;
  const fieldSlug = slugify(name);
  let finalOptions = { ...options };

  // Default relationship_style to "reference" for relation fields if not specified
  if (fieldType === "relation" && !finalOptions.relationship_style) {
    finalOptions.relationship_style = "reference";
  }

  // Validate relationship_style values
  if (fieldType === "relation" && finalOptions.relationship_style) {
    const validStyles = ["child_of", "reference", "link"];
    if (!validStyles.includes(finalOptions.relationship_style as string)) {
      return { error: `Invalid relationship_style. Must be one of: ${validStyles.join(", ")}` };
    }
    // child_of only makes sense with m2o
    if (finalOptions.relationship_style === "child_of" && finalOptions.relation_type !== "m2o") {
      return { error: "child_of relationship style is only valid with m2o relation type" };
    }
  }

  // Handle M2M: auto-create hidden junction collection
  if (fieldType === "relation" && options.relation_type === "m2m") {
    const relatedCollectionId = options.related_collection_id as string;
    if (!relatedCollectionId) return { error: "Related collection is required for M2M relation" };

    const { data: collections } = await supabase
      .from("collections")
      .select("id, slug, type, tenant_id")
      .in("id", [collectionId, relatedCollectionId]);

    const colA = collections?.find((c) => c.id === collectionId);
    const colB = collections?.find((c) => c.id === relatedCollectionId);
    if (!colA || !colB) return { error: "Could not find collections for junction" };

    const junctionBase = slugify(`${colA.slug}_${colB.slug}`);
    let junctionSlug: string;
    try {
      junctionSlug = await generateUniqueSlug(junctionBase, supabase);
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : "Junction slug generation failed" };
    }

    const { data: junction, error: junctionError } = await supabase
      .from("collections")
      .insert({
        name: `${colA.slug}_${colB.slug}`,
        slug: junctionSlug,
        type: colA.type,
        tenant_id: colA.tenant_id,
        is_hidden: true,
        created_by: userId,
      })
      .select("id")
      .single();

    if (junctionError) return { error: `Could not create junction collection: ${junctionError.message}` };

    await supabase.from("collection_fields").insert([
      {
        collection_id: junction.id,
        slug: colA.slug,
        name: colA.slug,
        field_type: "relation",
        options: { related_collection_id: collectionId, relation_type: "m2o" },
        sort_order: 0,
      },
      {
        collection_id: junction.id,
        slug: colB.slug,
        name: colB.slug,
        field_type: "relation",
        options: { related_collection_id: relatedCollectionId, relation_type: "m2o" },
        sort_order: 1,
      },
    ]);

    finalOptions = { ...options, junction_collection_id: junction.id };
  }

  const { data, error } = await supabase
    .from("collection_fields")
    .insert({
      collection_id: collectionId,
      slug: fieldSlug,
      name,
      field_type: fieldType,
      options: finalOptions,
      is_required: isRequired,
      is_unique: isUnique,
      is_translatable: finalIsTranslatable,
      sort_order: sortOrder,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { data };
}

export async function deleteField(
  supabase: SupabaseClient,
  fieldId: string
) {
  // If M2M, also delete the auto-created junction collection
  const { data: field } = await supabase
    .from("collection_fields")
    .select("options")
    .eq("id", fieldId)
    .single();

  const opts = field?.options as Record<string, unknown> | null;
  if (opts?.relation_type === "m2m" && opts?.junction_collection_id) {
    await supabase
      .from("collections")
      .delete()
      .eq("id", opts.junction_collection_id as string);
  }

  const { error } = await supabase.from("collection_fields").delete().eq("id", fieldId);
  if (error) return { error: error.message };
  return { data: true };
}

export async function updateField(
  supabase: SupabaseClient,
  fieldId: string,
  params: {
    isRequired: boolean;
    isUnique: boolean;
    isTranslatable: boolean;
    options: Record<string, unknown>;
  }
) {
  const { isRequired, isUnique, isTranslatable, options } = params;

  const { data: existing, error: fetchError } = await supabase
    .from("collection_fields")
    .select("options, field_type")
    .eq("id", fieldId)
    .single();

  if (fetchError) return { error: fetchError.message };

  const currentOptions = (existing?.options as Record<string, unknown>) ?? {};
  // Preserve labels (managed separately via Edit Labels)
  // Preserve relation metadata keys that may not be sent in every update
  const mergedOptions = {
    ...options,
    labels: currentOptions.labels,
    // Keep relationship_style and display_field_slug if not explicitly provided
    ...(currentOptions.relationship_style && !options.relationship_style
      ? { relationship_style: currentOptions.relationship_style } : {}),
    ...(currentOptions.display_field_slug && !options.display_field_slug
      ? { display_field_slug: currentOptions.display_field_slug } : {}),
  };

  const canBeTranslatable = ["text", "richtext"].includes(existing?.field_type ?? "");
  const finalIsTranslatable = canBeTranslatable && isTranslatable;

  const { error } = await supabase
    .from("collection_fields")
    .update({ is_required: isRequired, is_unique: isUnique, is_translatable: finalIsTranslatable, options: mergedOptions })
    .eq("id", fieldId);

  if (error) return { error: error.message };
  return { data: true };
}

export async function updateFieldLabels(
  supabase: SupabaseClient,
  fieldId: string,
  labels: Record<string, string>
) {
  // Fetch current options
  const { data: field, error: fetchError } = await supabase
    .from("collection_fields")
    .select("options")
    .eq("id", fieldId)
    .single();

  if (fetchError) return { error: fetchError.message };

  const currentOptions = (field?.options as Record<string, unknown>) ?? {};
  const updatedOptions = { ...currentOptions, labels };

  const { error } = await supabase
    .from("collection_fields")
    .update({ options: updatedOptions })
    .eq("id", fieldId);

  if (error) return { error: error.message };
  return { data: true };
}

export async function moveField(
  supabase: SupabaseClient,
  params: {
    fieldId: string;
    direction: "up" | "down";
    currentOrder: number;
    collectionId: string;
  }
) {
  const { fieldId, direction, currentOrder, collectionId } = params;

  const { data: adjacent } = await supabase
    .from("collection_fields")
    .select("id, sort_order")
    .eq("collection_id", collectionId)
    .eq("sort_order", direction === "up" ? currentOrder - 1 : currentOrder + 1)
    .maybeSingle();

  if (!adjacent) return { data: true }; // already at boundary

  await supabase.from("collection_fields").update({ sort_order: adjacent.sort_order }).eq("id", fieldId);
  await supabase.from("collection_fields").update({ sort_order: currentOrder }).eq("id", adjacent.id);

  return { data: true };
}
