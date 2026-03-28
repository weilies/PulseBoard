// src/app/api/tasks/route.ts
import { NextRequest } from "next/server";
import { resolveApiContext, apiErr } from "../_lib/api-auth";

/**
 * GET /api/tasks
 * Query params: status?, limit?, offset?
 * Returns tasks for the current user (or all tenant tasks for app-credential auth).
 * Also returns unread_count in the response envelope.
 */
export async function GET(request: NextRequest) {
  const auth = await resolveApiContext(request);
  if (!auth.ok) return auth.response;
  const { db, tenantId, userId, authMode } = auth.ctx;

  const sp = request.nextUrl.searchParams;
  const status = sp.get("status") ?? null;
  const VALID_STATUSES = ["unread", "read", "done"];
  if (status && !VALID_STATUSES.includes(status))
    return apiErr("status must be one of: unread, read, done");
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit") ?? 20)));
  const offset = Math.max(0, Number(sp.get("offset") ?? 0));

  let query = db
    .from("tasks")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  // User auth: filter to own + broadcast tasks
  if (authMode === "user" && userId) {
    query = query.or(`user_id.eq.${userId},user_id.is.null`);
  }

  if (status) query = query.eq("status", status);

  const { data, count, error } = await query;
  if (error) return apiErr(error.message, 500);

  // Unread count — only meaningful for user auth
  let unreadCount = 0;
  if (authMode === "user" && userId) {
    const { count: uc } = await db
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .or(`user_id.eq.${userId},user_id.is.null`)
      .eq("status", "unread");
    unreadCount = uc ?? 0;
  }

  return Response.json(
    { data: data ?? [], total: count ?? 0, unread_count: unreadCount },
    { headers: auth.ctx.rlHeaders }
  );
}

/**
 * POST /api/tasks
 * Internal use only — app credentials or super_admin users.
 * Body: { tenant_id, user_id?, type, title, body?, action_url?, action_label?, priority?, source?, source_id? }
 */
export async function POST(request: NextRequest) {
  const auth = await resolveApiContext(request);
  if (!auth.ok) return auth.response;
  const { db, tenantId, userId, authMode } = auth.ctx;

  // Restrict to app credentials or super_admin
  if (authMode === "user" && userId) {
    const { data: membership } = await db
      .from("tenant_users")
      .select("roles(slug)")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle();
    const rolesRaw = membership?.roles as { slug: string } | { slug: string }[] | null;
    const roleSlug = Array.isArray(rolesRaw) ? rolesRaw[0]?.slug : rolesRaw?.slug;
    if (roleSlug !== "super_admin") return apiErr("Forbidden — super_admin or app credentials required", 403);
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return apiErr("Invalid JSON body"); }

  // Cross-tenant writes are intentional for app-credential callers (e.g. rule engine, system events).
  // tenantId from auth context is the default; body.tenant_id allows targeting a specific tenant.
  const taskTenantId = (body.tenant_id as string | undefined) ?? tenantId;
  const type = body.type as string | undefined;
  const title = (body.title as string | undefined)?.trim();
  const priority = (body.priority as string | undefined) ?? "normal";

  if (!type || !["notification","approval","reminder","alert"].includes(type))
    return apiErr("type must be one of: notification, approval, reminder, alert");
  if (!title) return apiErr("title is required");
  if (!["low", "normal", "high"].includes(priority))
    return apiErr("priority must be one of: low, normal, high");

  const { data: task, error } = await db
    .from("tasks")
    .insert({
      tenant_id:    taskTenantId,
      user_id:      (body.user_id as string | undefined) ?? null,
      type,
      title,
      body:         (body.body as string | undefined) ?? null,
      action_url:   (body.action_url as string | undefined) ?? null,
      action_label: (body.action_label as string | undefined) ?? null,
      status:       "unread",
      priority,
      source:       (body.source as string | undefined) ?? null,
      source_id:    (body.source_id as string | undefined) ?? null,
    })
    .select()
    .single();

  if (error) return apiErr(error.message, 500);
  return Response.json({ data: task }, { status: 201, headers: auth.ctx.rlHeaders });
}
