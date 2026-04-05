import { NextRequest, after } from "next/server";
import { resolveApiContext, apiErr } from "../../../../_lib/api-auth";
import { validateItemData } from "@/lib/collection-validation";
import { fireWebhooks, runPreSaveWebhooks, firePostSaveWebhooks } from "@/lib/webhooks";
import { resolveDisplayLabelsForItem, resolveDisplayLabels, resolveCatalogLabels } from "../../../../_lib/display-resolve";
import { isExemptFromItemPolicy, resolveItemPolicy, itemPassesPolicy, actionAllowedByPolicy, applyFieldVisibility } from "@/lib/services/collection-rbac.service";

type Params = { params: Promise<{ slug: string; id: string }> };

type ResolveItemResult =
  | { ok: true; collection: { id: string; type: string; tenant_id: string | null; hooks: Record<string, unknown> }; item: Record<string, unknown> }
  | { ok: false; error: string; status: 404 };

async function resolveItem(
  db: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  slug: string,
  itemId: string,
  tenantId: string
): Promise<ResolveItemResult> {
  const { data: collection } = await db
    .from("collections")
    .select("id, type, tenant_id, hooks")
    .eq("slug", slug)
    .maybeSingle();

  if (!collection) return { ok: false, error: "Collection not found", status: 404 };
  if (collection.type === "tenant" && collection.tenant_id !== tenantId) {
    return { ok: false, error: "Collection not found", status: 404 };
  }
  const hooks = (collection.hooks ?? {}) as Record<string, unknown>;

  // Always scope to current tenant — system collections share schema but data is per-tenant.
  const q = db
    .from("collection_items")
    .select("id, data, created_at, updated_at, created_by, updated_by, collection_id, tenant_id")
    .eq("id", itemId)
    .eq("collection_id", collection.id)
    .eq("tenant_id", tenantId);

  const { data: item } = await q.maybeSingle();
  if (!item) return { ok: false, error: "Item not found", status: 404 };

  return { ok: true, collection: { ...collection, hooks }, item: item as Record<string, unknown> };
}

/**
 * GET /api/collections/:slug/items/:id
 * Query params: locale
 *   - omitted: canonical data only
 *   - "zh-CN": merge translated values into data (fallback chain)
 *   - "*": attach _translations object
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await resolveApiContext(request);
  if (!auth.ok) return auth.response;
  const { db, tenantId } = auth.ctx;
  const { slug, id } = await params;

  const result = await resolveItem(db, slug, id, tenantId);
  if (!result.ok) return apiErr(result.error, result.status);

  // Item-level RBAC — strict deny-by-default (user auth only)
  if (auth.ctx.authMode === "user" && auth.ctx.userId) {
    const exempt = await isExemptFromItemPolicy(db, auth.ctx.userId, tenantId);
    if (!exempt) {
      const policy = await resolveItemPolicy(db, result.collection.id, tenantId, auth.ctx.userId);
      if (!policy) return apiErr("Access denied: no permission policy defined for your role", 403);
      if (!actionAllowedByPolicy(policy, "read")) return apiErr("Access denied", 403);
      const item = result.item as { id: string; data: Record<string, unknown>; created_by?: string | null };
      const passes = await itemPassesPolicy(item, policy, db, auth.ctx.userId, tenantId);
      if (!passes) return apiErr("Item not found", 404);
      result.item = applyFieldVisibility(item, policy.visible_fields) as Record<string, unknown>;
    }
  }

  const locale = request.nextUrl.searchParams.get("locale") ?? undefined;
  const depth = Math.min(2, Math.max(0, parseInt(request.nextUrl.searchParams.get("depth") ?? "0", 10) || 0));
  const includeChildren = depth >= 1;
  const includeGrandchildren = depth >= 2;

  // Resolve child collections if requested
  let childrenData: Record<string, { items: Record<string, unknown>[]; total: number }> | undefined;
  if (includeChildren) {
    // Find all collections that have a child_of relation field pointing to this collection
    const { data: allRelFields } = await db
      .from("collection_fields")
      .select("collection_id, slug, options")
      .eq("field_type", "relation");

    const childLinks: { collectionId: string; fieldSlug: string }[] = [];
    for (const f of allRelFields ?? []) {
      const opts = f.options as Record<string, unknown>;
      if (
        opts?.relationship_style === "child_of" &&
        opts?.related_collection_id === result.collection.id
      ) {
        childLinks.push({ collectionId: f.collection_id, fieldSlug: f.slug });
      }
    }

    if (childLinks.length > 0) {
      childrenData = {};
      // Fetch child collection slugs
      const childColIds = childLinks.map((c) => c.collectionId);
      const { data: childCols } = await db
        .from("collections")
        .select("id, slug, metadata")
        .in("id", childColIds);

      const colSlugMap = new Map((childCols ?? []).map((c) => [c.id, c.slug]));

      await Promise.all(
        childLinks.map(async (link) => {
          const childSlug = colSlugMap.get(link.collectionId);
          if (!childSlug) return;

          let q = db
            .from("collection_items")
            .select("id, data, created_at, updated_at", { count: "exact" })
            .eq("collection_id", link.collectionId)
            .eq(`data->>${link.fieldSlug}`, id)
            .order("created_at", { ascending: false })
            .limit(10);

          // Tenant scoping: check if child collection is tenant-scoped
          const childCol = (childCols ?? []).find((c) => c.id === link.collectionId);
          if (childCol) {
            // We don't have type on the select — check via tenantId filter (safe: RLS handles it)
            q = q.eq("tenant_id", tenantId);
          }

          const { data: childItems, count } = await q;
          // Mask password fields in child items before returning
          const { data: childPwFields } = await db
            .from("collection_fields")
            .select("slug")
            .eq("collection_id", link.collectionId)
            .eq("field_type", "password");
          const childPwSlugs = new Set((childPwFields ?? []).map((f) => f.slug));
          let finalChildItems: Record<string, unknown>[] = (childItems ?? []).map((item) => {
            if (childPwSlugs.size === 0) return item as Record<string, unknown>;
            const d = { ...((item.data ?? {}) as Record<string, unknown>) };
            for (const s of childPwSlugs) if (s in d) d[s] = "****";
            return { ...item, data: d } as Record<string, unknown>;
          });

          // Optionally embed grandchildren (Level 3) per child item
          if (includeGrandchildren && finalChildItems.length > 0) {
            const gcLinks = (allRelFields ?? [])
              .filter((f) => {
                const opts = f.options as Record<string, unknown>;
                return opts?.relationship_style === "child_of" && opts?.related_collection_id === link.collectionId;
              })
              .map((f) => ({ collectionId: f.collection_id, fieldSlug: f.slug }));

            if (gcLinks.length > 0) {
              const gcColIds = gcLinks.map((g) => g.collectionId);
              const { data: gcCols } = await db.from("collections").select("id, slug").in("id", gcColIds);
              const gcColSlugMap = new Map((gcCols ?? []).map((c) => [c.id, c.slug]));

              finalChildItems = await Promise.all(
                finalChildItems.map(async (childItem) => {
                  const gcData: Record<string, { items: unknown[]; total: number }> = {};
                  await Promise.all(
                    gcLinks.map(async (gcLink) => {
                      const gcSlug = gcColSlugMap.get(gcLink.collectionId);
                      if (!gcSlug) return;
                      const { data: gcItems, count: gcCount } = await db
                        .from("collection_items")
                        .select("id, data, created_at, updated_at", { count: "exact" })
                        .eq("collection_id", gcLink.collectionId)
                        .eq(`data->>${gcLink.fieldSlug}`, childItem.id as string)
                        .eq("tenant_id", tenantId)
                        .order("created_at", { ascending: false })
                        .limit(5);
                      gcData[gcSlug] = { items: gcItems ?? [], total: gcCount ?? 0 };
                    })
                  );
                  if (Object.keys(gcData).length > 0) return { ...childItem, _children: gcData };
                  return childItem;
                })
              );
            }
          }

          childrenData![childSlug] = {
            items: finalChildItems,
            total: count ?? 0,
          };
        })
      );
    }
  }

  // Resolve _display labels for the main item
  const includeDisplay = request.nextUrl.searchParams.get("display") !== "false";
  let resolvedItem = result.item;
  if (includeDisplay) {
    resolvedItem = await resolveDisplayLabelsForItem(db, result.collection.id, result.item);
  }

  // Mask password fields in main item response
  {
    const { data: pwFields } = await db
      .from("collection_fields")
      .select("slug")
      .eq("collection_id", result.collection.id)
      .eq("field_type", "password");
    const pwSlugs = new Set((pwFields ?? []).map((f) => f.slug));
    if (pwSlugs.size > 0) {
      const d = { ...((resolvedItem.data ?? {}) as Record<string, unknown>) };
      for (const s of pwSlugs) if (s in d) d[s] = "****";
      resolvedItem = { ...resolvedItem, data: d };
    }
  }

  // Resolve _display in child items too
  if (includeDisplay && childrenData) {
    const childColSlugs = Object.keys(childrenData);
    if (childColSlugs.length > 0) {
      // Get collection IDs for child slugs
      const { data: childColRows } = await db
        .from("collections")
        .select("id, slug")
        .in("slug", childColSlugs);
      const slugToId = new Map((childColRows ?? []).map((c) => [c.slug, c.id]));

      await Promise.all(
        childColSlugs.map(async (childSlug) => {
          const colId = slugToId.get(childSlug);
          if (!colId) return;
          let resolvedChildren = await resolveDisplayLabels(db, colId, childrenData[childSlug].items);
          resolvedChildren = await resolveCatalogLabels(db, colId, resolvedChildren);
          childrenData[childSlug].items = resolvedChildren;
        })
      );
    }
  }

  if (!locale) {
    const responseData: Record<string, unknown> = { data: resolvedItem };
    if (childrenData) responseData._children = childrenData;
    return Response.json(responseData, { headers: auth.ctx.rlHeaders });
  }

  // Fetch translations for this item
  let tQuery = db
    .from("collection_item_translations")
    .select("field_slug, language_code, value")
    .eq("item_id", id);

  if (locale !== "*") {
    const baseLang = locale.split("-")[0];
    const locales = baseLang !== locale ? [locale, baseLang] : [locale];
    tQuery = tQuery.in("language_code", locales);
  }

  const { data: translations } = await tQuery;

  if (locale === "*") {
    // Attach all translations as _translations object
    const grouped: Record<string, Record<string, string>> = {};
    for (const t of translations ?? []) {
      if (t.value === null) continue;
      if (!grouped[t.language_code]) grouped[t.language_code] = {};
      grouped[t.language_code][t.field_slug] = t.value;
    }
    const item = Object.keys(grouped).length > 0
      ? { ...resolvedItem, _translations: grouped }
      : resolvedItem;
    const resp: Record<string, unknown> = { data: item };
    if (childrenData) resp._children = childrenData;
    return Response.json(resp, { headers: auth.ctx.rlHeaders });
  }

  // Merge specific locale into data (fallback chain)
  const baseLang = locale.split("-")[0];
  const { data: translatableFields } = await db
    .from("collection_fields")
    .select("slug")
    .eq("collection_id", result.collection.id)
    .eq("is_translatable", true);

  const fieldSlugs = new Set((translatableFields ?? []).map((f) => f.slug));
  const data = { ...(resolvedItem.data as Record<string, unknown>) };

  // Build lookup: fieldSlug → { locale: value }
  const localeMap = new Map<string, Map<string, string | null>>();
  for (const t of translations ?? []) {
    if (!localeMap.has(t.field_slug)) localeMap.set(t.field_slug, new Map());
    localeMap.get(t.field_slug)!.set(t.language_code, t.value);
  }

  for (const slug of fieldSlugs) {
    const lm = localeMap.get(slug);
    if (!lm) continue;
    const translated = lm.get(locale) ?? (baseLang !== locale ? lm.get(baseLang) : undefined);
    if (translated !== undefined && translated !== null) {
      data[slug] = translated;
    }
  }

  const finalResp: Record<string, unknown> = {
    data: { ...resolvedItem, data },
    meta: { locale },
  };
  if (childrenData) finalResp._children = childrenData;
  return Response.json(finalResp, { headers: auth.ctx.rlHeaders });
}

/**
 * PUT /api/collections/:slug/items/:id
 *
 * Updates an existing item. Partial updates supported (only send changed fields).
 *
 * Body: { data: { ... }, translations?: { "zh-CN": { "name": "..." }, ... } }
 *
 * Validation (runs automatically):
 *   - Number/text/file constraints, unique checks
 *   - **Relation existence**: if a relation field value is changed, the new value
 *     must reference an existing item. Prevents re-pointing a child to a
 *     non-existent parent.
 *
 * Example — update a child item:
 *   PUT /api/collections/employments/items/<item-uuid>
 *   { "data": { "location": "Kuala Lumpur" } }
 *
 *   Success → 200 { "data": { "id": "...", "data": { ... }, "updated_at": "..." } }
 *   Bad parent → 422 { "errors": [{ "field": "employee_id", "message": "Employee references a parent record that does not exist" }] }
 */
export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await resolveApiContext(request);
  if (!auth.ok) return auth.response;
  const { db, userId, tenantId } = auth.ctx;
  const { slug, id } = await params;

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return apiErr("Invalid JSON body"); }

  if (!body.data || typeof body.data !== "object") {
    return apiErr("Body must contain a 'data' object");
  }

  const result = await resolveItem(db, slug, id, tenantId);
  if (!result.ok) return apiErr(result.error, result.status);

  // Item-level RBAC — strict (user auth only)
  if (auth.ctx.authMode === "user" && userId) {
    const exempt = await isExemptFromItemPolicy(db, userId, tenantId);
    if (!exempt) {
      const policy = await resolveItemPolicy(db, result.collection.id, tenantId, userId);
      if (!policy) return apiErr("Access denied: no permission policy defined for your role", 403);
      if (!actionAllowedByPolicy(policy, "update")) return apiErr("Access denied", 403);
      const item = result.item as { id: string; data: Record<string, unknown>; created_by?: string | null };
      const passes = await itemPassesPolicy(item, policy, db, userId, tenantId);
      if (!passes) return apiErr("Item not found", 404);
    }
  }

  // Server-side field validation + rule engine (isUpdate=true — also normalizes datetime values to UTC ISO)
  const validation = await validateItemData(
    result.collection.id,
    body.data as Record<string, unknown>,
    true,
    id,
    tenantId,
    slug
  );
  if (!validation.valid) {
    return Response.json({ errors: validation.errors }, { status: 422 });
  }
  const itemData = validation.normalizedData;

  // Pre-save webhooks (can block the save)
  const blocked = await runPreSaveWebhooks(tenantId, slug, "update", itemData, id);
  if (blocked) return blocked;

  const { data, error } = await db
    .from("collection_items")
    .update({ data: itemData, updated_by: userId, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, data, updated_at")
    .single();

  if (error) return apiErr(error.message, 500);

  // Upsert translations if provided
  const translations = body.translations as Record<string, Record<string, string>> | undefined;
  if (translations && typeof translations === "object") {
    const itemTenantId = tenantId;
    const rows = [];
    for (const [langCode, fields] of Object.entries(translations)) {
      for (const [fieldSlug, value] of Object.entries(fields)) {
        rows.push({
          item_id: id,
          collection_id: result.collection.id,
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
      if (tErr) return apiErr(`Item updated but translations failed: ${tErr.message}`, 207);
    }
  }

  // Fire post-save webhooks after response (non-blocking)
  after(() => {
    fireWebhooks(tenantId, slug, "item.updated", data as Record<string, unknown>);
    firePostSaveWebhooks(tenantId, slug, "update", data as Record<string, unknown>, id);
  });

  return Response.json({ data }, { headers: auth.ctx.rlHeaders });
}

/**
 * DELETE /api/collections/:slug/items/:id
 * Translations are cascade-deleted by the trg_cascade_delete_item_translations trigger.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await resolveApiContext(request);
  if (!auth.ok) return auth.response;
  const { db, tenantId } = auth.ctx;
  const { slug, id } = await params;

  const result = await resolveItem(db, slug, id, tenantId);
  if (!result.ok) return apiErr(result.error, result.status);

  // Item-level RBAC — strict (user auth only)
  if (auth.ctx.authMode === "user" && auth.ctx.userId) {
    const exempt = await isExemptFromItemPolicy(db, auth.ctx.userId, tenantId);
    if (!exempt) {
      const policy = await resolveItemPolicy(db, result.collection.id, tenantId, auth.ctx.userId);
      if (!policy) return apiErr("Access denied: no permission policy defined for your role", 403);
      if (!actionAllowedByPolicy(policy, "delete")) return apiErr("Access denied", 403);
      const item = result.item as { id: string; data: Record<string, unknown>; created_by?: string | null };
      const passes = await itemPassesPolicy(item, policy, db, auth.ctx.userId, tenantId);
      if (!passes) return apiErr("Item not found", 404);
    }
  }

  const deletedItem = result.item;

  // Cascade rule enforcement: check if this item is a parent to any child collections
  const { data: allRelFields } = await db
    .from("collection_fields")
    .select("collection_id, slug, options")
    .eq("field_type", "relation");

  const childLinks: { collectionId: string; fieldSlug: string; collectionSlug?: string }[] = [];
  for (const f of allRelFields ?? []) {
    const opts = f.options as Record<string, unknown>;
    if (
      opts?.relationship_style === "child_of" &&
      opts?.related_collection_id === result.collection.id
    ) {
      childLinks.push({ collectionId: f.collection_id, fieldSlug: f.slug });
    }
  }

  if (childLinks.length > 0) {
    // Look up cascade rules from this collection's metadata
    const { data: parentCol } = await db
      .from("collections")
      .select("metadata")
      .eq("id", result.collection.id)
      .maybeSingle();

    const metadata = (parentCol?.metadata ?? {}) as Record<string, unknown>;
    const cascadeRules = (metadata.cascade_rules ?? {}) as Record<string, unknown>;
    const onDelete = (cascadeRules.on_parent_delete as string) ?? "restrict";

    for (const link of childLinks) {
      // Count child items referencing this parent
      const { count: childCount } = await db
        .from("collection_items")
        .select("id", { count: "exact", head: true })
        .eq("collection_id", link.collectionId)
        .eq(`data->>${link.fieldSlug}`, id);

      if (childCount && childCount > 0) {
        if (onDelete === "restrict") {
          return apiErr(
            `Cannot delete: ${childCount} child record(s) exist. Remove child records first or change cascade rule to "cascade".`,
            409
          );
        } else if (onDelete === "cascade") {
          // Delete all child items referencing this parent
          await db
            .from("collection_items")
            .delete()
            .eq("collection_id", link.collectionId)
            .eq(`data->>${link.fieldSlug}`, id);
        } else if (onDelete === "nullify") {
          // Set the parent reference to null on child items
          // Since data is JSONB, we need to update each child item individually
          const { data: childItems } = await db
            .from("collection_items")
            .select("id, data")
            .eq("collection_id", link.collectionId)
            .eq(`data->>${link.fieldSlug}`, id);

          for (const child of childItems ?? []) {
            const childData = { ...(child.data as Record<string, unknown>) };
            delete childData[link.fieldSlug];
            await db
              .from("collection_items")
              .update({ data: childData })
              .eq("id", child.id);
          }
        }
      }
    }
  }

  const { error } = await db.from("collection_items").delete().eq("id", id);
  if (error) return apiErr(error.message, 500);

  // Fire post-delete webhooks after response (non-blocking)
  after(() => {
    fireWebhooks(tenantId, slug, "item.deleted", deletedItem);
    firePostSaveWebhooks(tenantId, slug, "delete", deletedItem, id);
  });

  return new Response(null, { status: 204 });
}
