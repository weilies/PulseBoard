import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";

/**
 * GET /api/queries/collections
 *
 * Returns all collections the user has "read" access to,
 * along with their field schemas. Used by the query builder UI.
 */
export async function GET() {
  const user = await getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const tenantId = await resolveTenant(user.id);
  if (!tenantId) return Response.json({ error: "No tenant" }, { status: 400 });

  // Get collections the user can read
  const { data: accessibleIds } = await supabase.rpc("get_accessible_collection_ids", {
    p_permission: "read",
  });

  const ids = (accessibleIds as string[]) ?? [];
  if (ids.length === 0) {
    return Response.json({ data: [] });
  }

  // Fetch collection details with fields.
  // Scope to: system collections (shared) OR tenant collections belonging to the current tenant only.
  // This prevents tenant collections from other tenants leaking through (e.g. when a super_admin
  // switches tenants, collections created under a different tenant must not appear here).
  const { data: collections } = await supabase
    .from("collections")
    .select("id, slug, name, type, collection_fields(slug, name, field_type)")
    .in("id", ids)
    .eq("is_hidden", false)
    .or(`type.eq.system,tenant_id.eq.${tenantId}`)
    .order("name");

  const result = (collections ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    type: c.type,
    fields: (c.collection_fields ?? [])
      .filter((f: { slug: string; name: string; field_type: string }) => f.field_type !== "password")
      .map((f: { slug: string; name: string; field_type: string }) => ({
        slug: f.slug,
        name: f.name,
        field_type: f.field_type,
      })),
  }));

  return Response.json({ data: result });
}
