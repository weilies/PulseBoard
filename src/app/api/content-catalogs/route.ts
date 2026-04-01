import { NextRequest } from "next/server";
import { resolveApiContext, apiErr } from "../_lib/api-auth";

/**
 * GET /api/content-catalogs
 * Returns all content catalogs (readable by any authenticated tenant member).
 */
export async function GET(request: NextRequest) {
  const auth = await resolveApiContext(request);
  if (!auth.ok) return auth.response;
  const { db } = auth.ctx;

  const { data, error } = await db
    .from("content_catalogs")
    .select("id, slug, name, description, created_at")
    .order("name", { ascending: true });

  if (error) return apiErr(error.message, 500);
  return Response.json({ data: data ?? [] }, { headers: auth.ctx.rlHeaders });
}
