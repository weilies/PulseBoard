import { NextRequest } from "next/server";
import { resolveApiContext, apiErr } from "../../_lib/api-auth";

/**
 * PATCH /api/tasks/:id
 * Allowed fields: status ("read" | "done")
 * Sets read_at automatically when status → "read".
 * User can only update their own tasks.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await resolveApiContext(request);
  if (!auth.ok) return auth.response;
  const { db, tenantId, userId, authMode } = auth.ctx;

  const { id } = await params;

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return apiErr("Invalid JSON body"); }

  const status = body.status as string | undefined;
  if (!status || !["read","done"].includes(status))
    return apiErr("status must be 'read' or 'done'");

  // Fetch the task first to verify ownership
  const { data: existing, error: fetchErr } = await db
    .from("tasks")
    .select("id, user_id, tenant_id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (fetchErr) return apiErr(fetchErr.message, 500);
  if (!existing) return apiErr("Task not found", 404);

  // User-auth callers can only update their own tasks.
  // Broadcast tasks (user_id IS NULL) are immutable to individual users — they are
  // shared rows and per-user read state is not tracked at row level in v1.
  // App-credential callers (e.g. rule engine) can update any task in their tenant.
  if (authMode === "user" && existing.user_id !== userId)
    return apiErr("Forbidden", 403);

  const updates: Record<string, unknown> = { status };
  if (status === "read") updates.read_at = new Date().toISOString();

  const { data: updated, error: updateErr } = await db
    .from("tasks")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (updateErr) return apiErr(updateErr.message, 500);
  return Response.json({ data: updated }, { headers: auth.ctx.rlHeaders });
}
