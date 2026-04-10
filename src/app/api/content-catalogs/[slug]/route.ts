import { NextRequest } from "next/server";
import { resolveApiContext, apiErr } from "../../_lib/api-auth";

type Params = { params: Promise<{ slug: string }> };

/**
 * GET /api/content-catalogs/:slug
 * Returns a catalog and all its items, ordered by sort_order / label.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await resolveApiContext(request);
  if (!auth.ok) return auth.response;
  const { db } = auth.ctx;
  const { slug } = await params;

  const { data: catalog, error } = await db
    .from("content_catalogs")
    .select(`
      id, slug, name, description, columns, created_at,
      content_catalog_items (
        id, value, label, sort_order, is_active, data
      )
    `)
    .eq("slug", slug)
    .maybeSingle();

  if (error) return apiErr(error.message, 500);
  if (!catalog) return apiErr("Content catalog not found", 404);

  const items = [...(catalog.content_catalog_items as Array<Record<string, unknown>>)]
    .filter((i) => i.is_active !== false)
    .sort((a, b) => (a.sort_order as number) - (b.sort_order as number));

  return Response.json({ data: { ...catalog, content_catalog_items: items } }, { headers: auth.ctx.rlHeaders });
}
