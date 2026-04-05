"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import * as CatalogService from "@/lib/services/content-catalog.service";
import type { CatalogSchema } from "@/types/catalog";

export async function getCatalogSchema(slug: string): Promise<{ data: CatalogSchema | null } | { error: string }> {
  if (!slug) return { data: null };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("content_catalogs")
    .select("columns")
    .eq("slug", slug)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Catalog not found" };
  return { data: (data.columns as CatalogSchema | null) ?? null };
}

export async function createCatalog(formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  if (!name) return { error: "Name is required" };

  const supabase = await createClient();
  try {
    const result = await CatalogService.createCatalog(supabase, { name, description });
    if (result.error) return { error: result.error };
    revalidatePath("/dashboard/studio/content-catalog");
    return { data: true };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Unauthorized" };
  }
}

export async function updateCatalog(formData: FormData) {
  const catalogId = formData.get("catalog_id") as string;
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  if (!catalogId || !name) return { error: "ID and name are required" };

  const supabase = await createClient();
  try {
    const result = await CatalogService.updateCatalog(supabase, { catalogId, name, description });
    if (result.error) return { error: result.error };
    revalidatePath("/dashboard/studio/content-catalog");
    return { data: true };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Unauthorized" };
  }
}

export async function deleteCatalog(formData: FormData) {
  const catalogId = formData.get("catalog_id") as string;
  if (!catalogId) return { error: "Catalog ID is required" };

  const supabase = await createClient();
  try {
    const result = await CatalogService.deleteCatalog(supabase, catalogId);
    if (result.error) return { error: result.error };
    revalidatePath("/dashboard/studio/content-catalog");
    return { data: true };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Unauthorized" };
  }
}

export async function createCatalogItem(formData: FormData) {
  const catalogId = formData.get("catalog_id") as string;
  const catalogSlug = formData.get("catalog_slug") as string;
  const label = (formData.get("label") as string)?.trim();
  const value = (formData.get("value") as string)?.trim();
  const extraDataJson = formData.get("extra_data") as string | null;
  if (!catalogId || !label || !value) return { error: "Catalog, label and value are required" };

  let extraData: Record<string, unknown> | undefined;
  if (extraDataJson) {
    try { extraData = JSON.parse(extraDataJson); } catch { return { error: "Invalid extra data" }; }
  }

  const supabase = await createClient();
  try {
    const result = await CatalogService.createCatalogItem(supabase, { catalogId, label, value, data: extraData });
    if (result.error) return { error: result.error };
    revalidatePath(`/dashboard/studio/content-catalog/${catalogSlug}`);
    return { data: true };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Unauthorized" };
  }
}

export async function updateCatalogItem(formData: FormData) {
  const itemId = formData.get("item_id") as string;
  const catalogSlug = formData.get("catalog_slug") as string;
  const label = (formData.get("label") as string)?.trim();
  const value = (formData.get("value") as string)?.trim();
  const isActive = formData.get("is_active") !== "false";
  const extraDataJson = formData.get("extra_data") as string | null;
  if (!itemId || !label || !value) return { error: "Item ID, label and value are required" };

  let extraData: Record<string, unknown> | undefined;
  if (extraDataJson) {
    try { extraData = JSON.parse(extraDataJson); } catch { return { error: "Invalid extra data" }; }
  }

  const supabase = await createClient();
  try {
    const result = await CatalogService.updateCatalogItem(supabase, { itemId, label, value, isActive, data: extraData });
    if (result.error) return { error: result.error };
    revalidatePath(`/dashboard/studio/content-catalog/${catalogSlug}`);
    return { data: true };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Unauthorized" };
  }
}

export async function updateCatalogColumns(formData: FormData) {
  const catalogId = formData.get("catalog_id") as string;
  const catalogSlug = formData.get("catalog_slug") as string;
  const columnsJson = formData.get("columns") as string | null;
  if (!catalogId) return { error: "Catalog ID required" };

  let columns: CatalogSchema | null = null;
  if (columnsJson) {
    try { columns = JSON.parse(columnsJson); } catch { return { error: "Invalid columns JSON" }; }
  }

  const supabase = await createClient();
  try {
    const result = await CatalogService.updateCatalogColumns(supabase, { catalogId, columns });
    if (result.error) return { error: result.error };
    revalidatePath(`/dashboard/studio/content-catalog/${catalogSlug}`);
    return { data: true };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Unauthorized" };
  }
}

export async function deleteCatalogItem(formData: FormData) {
  const itemId = formData.get("item_id") as string;
  const catalogSlug = formData.get("catalog_slug") as string;
  if (!itemId) return { error: "Item ID is required" };

  const supabase = await createClient();
  try {
    const result = await CatalogService.deleteCatalogItem(supabase, itemId);
    if (result.error) return { error: result.error };
    revalidatePath(`/dashboard/studio/content-catalog/${catalogSlug}`);
    return { data: true };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Unauthorized" };
  }
}

export async function moveCatalogItem(formData: FormData) {
  const itemId = formData.get("item_id") as string;
  const direction = formData.get("direction") as "up" | "down";
  const currentOrder = Number(formData.get("sort_order"));
  const catalogId = formData.get("catalog_id") as string;
  const catalogSlug = formData.get("catalog_slug") as string;
  if (!itemId || !direction || !catalogId) return { error: "Missing required params" };

  const supabase = await createClient();
  try {
    await CatalogService.moveCatalogItem(supabase, { itemId, direction, currentOrder, catalogId });
    revalidatePath(`/dashboard/studio/content-catalog/${catalogSlug}`);
    return { data: true };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Unauthorized" };
  }
}
