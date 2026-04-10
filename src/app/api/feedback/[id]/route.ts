import { NextRequest } from "next/server";
import { resolveApiContext, apiErr } from "../../_lib/api-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await resolveApiContext(request);
  if (!auth.ok) return auth.response;
  const { db, tenantId } = auth.ctx;

  const { id } = await params;
  if (!id) return apiErr("Missing session id", 400);

  const { data: session, error: sessionError } = await db
    .from("ui_feedback_sessions")
    .select("id, title, status, created_at, expires_at, tenant_id")
    .eq("id", id)
    .single();

  if (sessionError || !session) return apiErr("Session not found", 404);

  if (session.tenant_id !== tenantId) return apiErr("Access denied", 403);

  if (new Date(session.expires_at) < new Date()) return apiErr("Session has expired", 410);

  const { data: items, error: itemsError } = await db
    .from("ui_feedback_items")
    .select("id, page, element_text, css_classes, parent_chain, outer_html, comment, annotated_at")
    .eq("session_id", id)
    .order("annotated_at", { ascending: true });

  if (itemsError) return apiErr("Failed to fetch items", 500);

  const payload = {
    session: {
      id: session.id,
      title: session.title,
      status: session.status,
      created_at: session.created_at,
      expires_at: session.expires_at,
    },
    items: (items ?? []).map((item) => ({
      id: item.id,
      page: item.page,
      element_text: item.element_text,
      css_classes: item.css_classes,
      parent_chain: item.parent_chain,
      outer_html: item.outer_html,
      comment: item.comment,
      annotated_at: item.annotated_at,
    })),
    claude_prompt: buildClaudePrompt(session.title, items ?? []),
  };

  return Response.json(payload, {
    headers: { "Cache-Control": "no-store", ...auth.ctx.rlHeaders },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await resolveApiContext(request);
  if (!auth.ok) return auth.response;
  const { db, tenantId } = auth.ctx;

  const { id } = await params;
  if (!id) return apiErr("Missing session id", 400);

  const body = await request.json().catch(() => ({}));
  if (body.status !== "completed") return apiErr("Only status=completed is supported", 400);

  // Verify tenant ownership before mutating
  const { data: session } = await db
    .from("ui_feedback_sessions")
    .select("tenant_id")
    .eq("id", id)
    .single();

  if (!session) return apiErr("Session not found", 404);
  if (session.tenant_id !== tenantId) return apiErr("Access denied", 403);

  const { error } = await db
    .from("ui_feedback_sessions")
    .update({ status: "completed" })
    .eq("id", id);

  if (error) return apiErr(error.message, 500);
  return Response.json({ ok: true }, { headers: auth.ctx.rlHeaders });
}

function buildClaudePrompt(
  sessionTitle: string,
  items: Array<{
    page: string;
    element_text: string | null;
    css_classes: string | null;
    parent_chain: string | null;
    outer_html: string | null;
    comment: string;
    annotated_at: string;
  }>
): string {
  if (items.length === 0) return "";

  const lines: string[] = [
    `Fix the following ${items.length} UI issue${items.length === 1 ? "" : "s"} from feedback session "${sessionTitle}":`,
    "",
  ];

  items.forEach((item, i) => {
    lines.push(`--- Issue ${i + 1} ---`);
    lines.push(`Page: ${item.page}`);
    if (item.element_text) lines.push(`Element text: "${item.element_text}"`);
    if (item.css_classes) lines.push(`CSS classes: ${item.css_classes}`);
    if (item.parent_chain) lines.push(`Parent chain: ${item.parent_chain}`);
    if (item.outer_html) lines.push(`HTML: ${item.outer_html}`);
    lines.push(`Feedback: ${item.comment}`);
    lines.push("");
  });

  lines.push("Find each element by searching for its CSS classes or element text in the source files and apply the requested changes.");

  return lines.join("\n");
}
