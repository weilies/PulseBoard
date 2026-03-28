import { NextRequest } from "next/server";
import { resolveApiContext, apiErr } from "../../_lib/api-auth";

/**
 * POST /api/tasks/mark-all-read
 * Marks all unread tasks as read for the current user in the current tenant.
 */
export async function POST(request: NextRequest) {
  const auth = await resolveApiContext(request);
  if (!auth.ok) return auth.response;
  const { db, tenantId, userId } = auth.ctx;

  if (!userId) return apiErr("User auth required", 401);

  const now = new Date().toISOString();

  const { error } = await db
    .from("tasks")
    .update({ status: "read", read_at: now })
    .eq("tenant_id", tenantId)
    .or(`user_id.eq.${userId},user_id.is.null`)
    .eq("status", "unread");

  if (error) return apiErr(error.message, 500);

  return Response.json({ success: true }, { headers: auth.ctx.rlHeaders });
}
