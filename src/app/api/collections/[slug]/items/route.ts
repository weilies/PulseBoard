import { NextRequest, after } from "next/server";
import { resolveApiContext, apiErr, paginate } from "../../../_lib/api-auth";
import { validateItemData } from "@/lib/collection-validation";
import { fireWebhooks, runPreSaveWebhooks, firePostSaveWebhooks } from "@/lib/webhooks";
import { resolveDisplayLabels, resolveCatalogLabels } from "../../../_lib/display-resolve";

type Params = { params: Promise<{ slug: string }> };

async function resolveCollection(
  db: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  slug: string,
  tenantId: string
) {
  const { data } = await db
    .from("collections")
    .select("id, type, tenant_id, hooks")
    .eq("slug", slug)
    .maybeSingle();

  if (!data) return null;
  if (data.type === "tenant" && data.tenant_id !== tenantId) return null;
  return data;
}

/**
 * Fetch translatable field slugs for a collection.
 */
async function getTranslatableFieldSlugs(
  db: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  collectionId: string
): Promise<string[]> {
  const { data } = await db
    .from("collection_fields")
    .select("slug")
    .eq("collection_id", collectionId)
    .eq("is_translatable", true);
  return (data ?? []).map((f) => f.slug);
}

/**
 * Fetch translations for a batch of item IDs.
 * Returns a map: { itemId: { fieldSlug: { locale: value } } }
 */
async function fetchTranslationsForItems(
  db: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  itemIds: string[],
  locale?: string
) {
  if (itemIds.length === 0) return [];

  let query = db
    .from("collection_item_translations")
    .select("item_id, field_slug, language_code, value")
    .in("item_id", itemIds);

  // If specific locale, fetch only that locale + base language
  if (locale && locale !== "*") {
    const baseLang = locale.split("-")[0];
    const locales = baseLang !== locale ? [locale, baseLang] : [locale];
    query = query.in("language_code", locales);
  }

  const { data } = await query;
  return data ?? [];
}

/**
 * Apply translations to items for a specific locale (fallback chain).
 */
function applyLocale(
  items: Record<string, unknown>[],
  translations: { item_id: string; field_slug: string; language_code: string; value: string | null }[],
  locale: string,
  translatableFields: string[]
) {
  const baseLang = locale.split("-")[0];

  // Group translations: itemId → fieldSlug → { locale: value }
  const tMap = new Map<string, Map<string, Map<string, string | null>>>();
  for (const t of translations) {
    if (!tMap.has(t.item_id)) tMap.set(t.item_id, new Map());
    const fieldMap = tMap.get(t.item_id)!;
    if (!fieldMap.has(t.field_slug)) fieldMap.set(t.field_slug, new Map());
    fieldMap.get(t.field_slug)!.set(t.language_code, t.value);
  }

  return items.map((item) => {
    const itemId = item.id as string;
    const data = { ...(item.data as Record<string, unknown>) };
    const fieldMap = tMap.get(itemId);

    for (const slug of translatableFields) {
      if (!fieldMap?.has(slug)) continue;
      const localeMap = fieldMap.get(slug)!;
      // Fallback: exact locale → base language → canonical (already in data)
      const translated = localeMap.get(locale) ?? (baseLang !== locale ? localeMap.get(baseLang) : undefined);
      if (translated !== undefined && translated !== null) {
        data[slug] = translated;
      }
    }

    return { ...item, data };
  });
}

/**
 * Attach all translations as _translations object to each item.
 */
function attachAllTranslations(
  items: Record<string, unknown>[],
  translations: { item_id: string; field_slug: string; language_code: string; value: string | null }[]
) {
  // Group: itemId → { locale: { fieldSlug: value } }
  const tMap = new Map<string, Record<string, Record<string, string>>>();
  for (const t of translations) {
    if (t.value === null) continue;
    if (!tMap.has(t.item_id)) tMap.set(t.item_id, {});
    const locales = tMap.get(t.item_id)!;
    if (!locales[t.language_code]) locales[t.language_code] = {};
    locales[t.language_code][t.field_slug] = t.value;
  }

  return items.map((item) => {
    const itemId = item.id as string;
    const itemTranslations = tMap.get(itemId);
    return itemTranslations
      ? { ...item, _translations: itemTranslations }
      : item;
  });
}

/**
 * GET /api/collections/:slug/items
 * Query params: page, limit, sort (created_at|updated_at), order (asc|desc), locale
 *
 * locale param:
 *   - omitted: returns canonical data (default language)
 *   - "zh-CN": merges translated values into data (fallback: zh → canonical)
 *   - "*": attaches _translations object with all locale values
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await resolveApiContext(request);
  if (!auth.ok) return auth.response;
  const { db, tenantId } = auth.ctx;
  const { slug } = await params;

  const collection = await resolveCollection(db, slug, tenantId);
  if (!collection) return apiErr("Collection not found", 404);

  const sp = request.nextUrl.searchParams;
  const { page, limit, from, to } = paginate(sp);
  const sortField = ["created_at", "updated_at"].includes(sp.get("sort") ?? "")
    ? sp.get("sort")!
    : "created_at";
  const ascending = (sp.get("order") ?? "desc") === "asc";
  const locale = sp.get("locale") ?? undefined;

  // Parent-child filtering: filter items where a child_of relation field = parent_id
  const parentId = sp.get("parent_id") ?? undefined;
  const parentField = sp.get("parent_field") ?? undefined;
  // Effective dating: return only the "current" record (effective_date <= value, latest first)
  const effectiveAsOf = sp.get("effective_as_of") ?? undefined;

  // If parent_id is provided, resolve which field to filter on
  let parentFieldSlug: string | undefined;
  if (parentId) {
    if (parentField) {
      parentFieldSlug = parentField;
    } else {
      // Auto-detect: find the child_of relation field on this collection
      const { data: childOfFields } = await db
        .from("collection_fields")
        .select("slug, options")
        .eq("collection_id", collection.id)
        .eq("field_type", "relation");

      const childOfField = (childOfFields ?? []).find(
        (f) => (f.options as Record<string, unknown>)?.relationship_style === "child_of"
      );
      if (childOfField) {
        parentFieldSlug = childOfField.slug;
      }
    }
  }

  // Always scope to current tenant — system collections share schema but data is per-tenant.
  let query = db
    .from("collection_items")
    .select("id, data, created_at, updated_at, created_by, updated_by", { count: "exact" })
    .eq("collection_id", collection.id)
    .eq("tenant_id", tenantId)
    .order(sortField, { ascending })
    .range(from, to);

  // Apply parent_id filter via JSONB
  if (parentId && parentFieldSlug) {
    query = query.eq(`data->>${parentFieldSlug}`, parentId);
  }

  const { data, error, count } = await query;

  // Effective dating: if effective_as_of is set, filter to latest record per parent
  let items = (data ?? []) as Record<string, unknown>[];
  if (effectiveAsOf && items.length > 0) {
    // Look up the effective_date_field from collection metadata
    const { data: collMeta } = await db
      .from("collections")
      .select("metadata")
      .eq("id", collection.id)
      .maybeSingle();
    const effectiveDateField = (collMeta?.metadata as Record<string, unknown>)?.effective_date_field as string | undefined;

    if (effectiveDateField) {
      // Filter items where effective_date <= effectiveAsOf, then take the latest
      items = items
        .filter((item) => {
          const itemData = item.data as Record<string, unknown>;
          const dateVal = itemData[effectiveDateField] as string | undefined;
          return dateVal && dateVal <= effectiveAsOf;
        })
        .sort((a, b) => {
          const aDate = ((a.data as Record<string, unknown>)[effectiveDateField] as string) ?? "";
          const bDate = ((b.data as Record<string, unknown>)[effectiveDateField] as string) ?? "";
          return bDate.localeCompare(aDate); // DESC
        })
        .slice(0, 1);
    }
  }
  if (error) return apiErr(error.message, 500);

  // Locale resolution
  if (locale && items.length > 0) {
    const itemIds = items.map((i) => i.id as string);
    const translations = await fetchTranslationsForItems(db, itemIds, locale);

    if (locale === "*") {
      items = attachAllTranslations(items, translations);
    } else {
      const translatableFields = await getTranslatableFieldSlugs(db, collection.id);
      items = applyLocale(items, translations, locale, translatableFields);
    }
  }

  // Display label resolution: adds _display map with human-readable labels for relation/catalog fields
  const includeDisplay = sp.get("display") !== "false"; // on by default
  if (includeDisplay && items.length > 0) {
    items = await resolveDisplayLabels(db, collection.id, items);
    items = await resolveCatalogLabels(db, collection.id, items);
  }

  const meta: Record<string, unknown> = {
    page,
    limit,
    total: count ?? 0,
    totalPages: Math.ceil((count ?? 0) / limit),
  };
  if (locale && locale !== "*") meta.locale = locale;

  return Response.json({ data: items, meta }, { headers: auth.ctx.rlHeaders });
}

/**
 * POST /api/collections/:slug/items
 *
 * Creates a new item in the collection.
 *
 * Body: { data: { ... }, translations?: { "zh-CN": { "name": "..." }, ... } }
 *
 * Validation (runs automatically):
 *   - Required fields must have values
 *   - Number min/max/decimals, text max_length/pattern, file extension checks
 *   - Single-field and composite unique constraints
 *   - **Relation existence**: any relation field value must reference an existing
 *     item in the related collection. This prevents orphan child records —
 *     e.g. creating an Employment without a valid employee_id will be rejected.
 *
 * Example — create a child item (Employment under Employee):
 *   POST /api/collections/employments/items
 *   { "data": { "employee_id": "<valid-employee-item-uuid>", "effective_date": "2026-01-15", "location": "Singapore" } }
 *
 *   Success → 201 { "data": { "id": "...", "data": { ... }, "created_at": "..." } }
 *   Parent missing → 422 { "errors": [{ "field": "employee_id", "message": "Employee references a parent record that does not exist" }] }
 *   Required missing → 422 { "errors": [{ "field": "employee_id", "message": "Employee is required" }] }
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await resolveApiContext(request);
  if (!auth.ok) return auth.response;
  const { db, userId, tenantId } = auth.ctx;
  const { slug } = await params;

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return apiErr("Invalid JSON body"); }

  if (!body.data || typeof body.data !== "object") {
    return apiErr("Body must contain a 'data' object");
  }

  const collection = await resolveCollection(db, slug, tenantId);
  if (!collection) return apiErr("Collection not found", 404);

  // Server-side field validation + rule engine (also normalizes datetime values to UTC ISO)
  // Detect parent ID: look for any child_of relation field value in the submitted data
  const bodyData = body.data as Record<string, unknown>;
  const validation = await validateItemData(collection.id, bodyData, false, undefined, tenantId, slug);
  if (!validation.valid) {
    return Response.json({ errors: validation.errors }, { status: 422 });
  }
  const itemData = validation.normalizedData;

  // Pre-save webhooks (can block the save)
  const blocked = await runPreSaveWebhooks(tenantId, slug, "create", itemData);
  if (blocked) return blocked;

  const itemTenantId = tenantId;

  const { data, error } = await db
    .from("collection_items")
    .insert({
      collection_id: collection.id,
      tenant_id: itemTenantId,
      data: itemData,
      created_by: userId,
      updated_by: userId,
    })
    .select("id, data, created_at, updated_at")
    .single();

  if (error) return apiErr(error.message, 500);

  // Upsert translations if provided
  const translations = body.translations as Record<string, Record<string, string>> | undefined;
  if (translations && typeof translations === "object" && data) {
    const rows = [];
    for (const [langCode, fields] of Object.entries(translations)) {
      for (const [fieldSlug, value] of Object.entries(fields)) {
        rows.push({
          item_id: data.id,
          collection_id: collection.id,
          tenant_id: itemTenantId,
          field_slug: fieldSlug,
          language_code: langCode,
          value: value === "" ? null : value,
          translated_by: userId,
          translated_at: new Date().toISOString(),
        });
      }
    }
    if (rows.length > 0) {
      const { error: tErr } = await db
        .from("collection_item_translations")
        .upsert(rows, { onConflict: "item_id,field_slug,language_code" });
      if (tErr) return apiErr(`Item created but translations failed: ${tErr.message}`, 207);
    }
  }

  // Fire post-save webhooks after response (non-blocking)
  after(() => {
    fireWebhooks(tenantId, slug, "item.created", data as Record<string, unknown>);
    firePostSaveWebhooks(tenantId, slug, "create", data as Record<string, unknown>, (data as Record<string, unknown>).id as string);
  });

  return Response.json({ data }, { status: 201, headers: auth.ctx.rlHeaders });
}
