"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser, getUserRole } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { fireWebhooks } from "@/lib/webhooks";

async function getContext() {
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");
  const supabase = await createClient();
  const tenantId = await resolveTenant(user.id);
  if (!tenantId) throw new Error("No tenant");
  const role = await getUserRole(user.id, tenantId);
  return { user, supabase, tenantId, role };
}

function canManage(role: string | null) {
  return role === "super_admin" || role === "tenant_admin";
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getAllWebhooks() {
  const { supabase, tenantId } = await getContext();
  const { data, error } = await supabase
    .from("webhooks")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("scope_type")
    .order("scope_id")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type ActivityEntry = {
  id: string;
  created_at: string;
  category: string;
  event_type: string;
  status: string;
  request_url: string | null;
  request_body: Record<string, unknown> | null;
  response_status: number | null;
  response_body: string | null;
  duration_ms: number | null;
  scope_id: string | null;
  // Audit-specific extras
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  item_id?: string | null;
  actor_id?: string | null;
};

export async function getActivityLogs(limit = 100, filters?: {
  category?: string;
  event_type?: string;
  status?: string;
  from_date?: string;
  to_date?: string;
  offset?: number;
}) {
  const { supabase, tenantId } = await getContext();

  const fromDt = filters?.from_date
    ? (filters.from_date.includes("T") ? filters.from_date : `${filters.from_date}T00:00:00`)
    : undefined;
  const toDt = filters?.to_date
    ? (filters.to_date.includes("T") ? filters.to_date : `${filters.to_date}T23:59:59`)
    : undefined;

  const results: ActivityEntry[] = [];

  // ── Webhook event_logs ────────────────────────────────────────────────────
  if (!filters?.category || filters.category !== "audit") {
    let q = supabase
      .from("event_logs")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (filters?.category) q = q.eq("category", filters.category);
    if (filters?.event_type) q = q.eq("event_type", filters.event_type);
    if (filters?.status) q = q.eq("status", filters.status);
    if (fromDt) q = q.gte("created_at", fromDt);
    if (toDt) q = q.lte("created_at", toDt);

    const { data } = await q;
    for (const row of data ?? []) {
      results.push({
        id: row.id,
        created_at: row.created_at,
        category: row.category,
        event_type: row.event_type,
        status: row.status,
        request_url: row.request_url ?? null,
        request_body: row.request_body ?? null,
        response_status: row.response_status ?? null,
        response_body: row.response_body ?? null,
        duration_ms: row.duration_ms ?? null,
        scope_id: row.scope_id ?? null,
      });
    }
  }

  // ── collection_items_audit ────────────────────────────────────────────────
  if (!filters?.category || filters.category === "audit") {
    // "success" is the only audit status — skip if filtering for something else
    if (!filters?.status || filters.status === "success") {
      let q = supabase
        .from("collection_items_audit")
        .select("id, item_id, collection_id, action, old_data, new_data, changed_by, changed_at")
        .eq("tenant_id", tenantId)
        .order("changed_at", { ascending: false })
        .limit(limit);

      if (filters?.event_type) {
        // event_type filter maps "item.insert" → action "insert" etc.
        const action = filters.event_type.replace("item.", "");
        q = q.eq("action", action);
      }
      if (fromDt) q = q.gte("changed_at", fromDt);
      if (toDt) q = q.lte("changed_at", toDt);

      const { data: auditRows } = await q;

      // Resolve collection slugs (no FK, so manual join)
      const colIds = [...new Set((auditRows ?? []).map((r) => r.collection_id as string))];
      const slugMap = new Map<string, string>();
      if (colIds.length > 0) {
        const { data: cols } = await supabase
          .from("collections")
          .select("id, slug")
          .in("id", colIds);
        for (const c of cols ?? []) slugMap.set(c.id, c.slug);
      }

      for (const row of auditRows ?? []) {
        results.push({
          id: row.id,
          created_at: row.changed_at,
          category: "audit",
          event_type: `item.${row.action}`,
          status: "success",
          request_url: null,
          request_body: row.new_data ?? null,
          response_status: null,
          response_body: null,
          duration_ms: null,
          scope_id: slugMap.get(row.collection_id as string) ?? null,
          old_data: row.old_data ?? null,
          new_data: row.new_data ?? null,
          item_id: row.item_id ?? null,
          actor_id: row.changed_by ?? null,
        });
      }
    }
  }

  // ── user_mgmt_audit ───────────────────────────────────────────────────────
  if (!filters?.category || filters.category === "audit") {
    if (!filters?.status || filters.status === "success") {
      let q = supabase
        .from("user_mgmt_audit")
        .select("id, tenant_id, actor_id, target_type, target_id, target_label, action, old_data, new_data, status, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (filters?.event_type) q = q.eq("action", filters.event_type);
      if (fromDt) q = q.gte("created_at", fromDt);
      if (toDt)   q = q.lte("created_at", toDt);

      const { data: mgmtRows } = await q;

      for (const row of mgmtRows ?? []) {
        results.push({
          id:              row.id,
          created_at:      row.created_at,
          category:        "audit",
          event_type:      row.action,
          status:          row.status,
          request_url:     null,
          request_body:    row.new_data ?? null,
          response_status: null,
          response_body:   null,
          duration_ms:     null,
          scope_id:        row.target_label ?? null,
          old_data:        row.old_data ?? null,
          new_data:        row.new_data ?? null,
          item_id:         row.target_id ?? null,
          actor_id:        row.actor_id ?? null,
        });
      }
    }
  }

  // Sort merged results
  results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const totalCount = results.length;
  const offset = filters?.offset ?? 0;
  return { entries: results.slice(offset, offset + limit), totalCount };
}

export async function getWebhookLogs(limit = 50, filters?: {
  category?: string;
  event_type?: string;
  scope_id?: string;
  status?: string;
  from_date?: string;
  to_date?: string;
}) {
  const { supabase, tenantId } = await getContext();
  let query = supabase
    .from("event_logs")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters?.category) query = query.eq("category", filters.category);
  if (filters?.event_type) query = query.eq("event_type", filters.event_type);
  if (filters?.scope_id) query = query.eq("scope_id", filters.scope_id);
  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.from_date) {
    const fromDt = filters.from_date.includes("T") ? filters.from_date : `${filters.from_date}T00:00:00`;
    query = query.gte("created_at", fromDt);
  }
  if (filters?.to_date) {
    const toDt = filters.to_date.includes("T") ? filters.to_date : `${filters.to_date}T23:59:59`;
    query = query.lte("created_at", toDt);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getWebhookDeliveries(webhookId: string, limit = 15) {
  const { supabase } = await getContext();
  const { data, error } = await supabase
    .from("event_logs")
    .select("id, event_type, status, response_status, response_body, duration_ms, created_at")
    .eq("source_type", "webhook")
    .eq("source_id", webhookId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function createWebhook(formData: FormData) {
  const { tenantId, user, role } = await getContext();
  if (!canManage(role)) throw new Error("Insufficient permissions");

  const scopeType = (formData.get("scope_type") as string) || "collection";
  const scopeId = formData.get("scope_id") as string || formData.get("collection_slug") as string || null;
  const name = formData.get("name") as string;
  const url = formData.get("url") as string;
  const secret = (formData.get("secret") as string) || null;
  const eventsRaw = formData.getAll("events") as string[];
  const canBlock = formData.get("can_block") === "true";
  const timeoutMs = formData.get("timeout_ms") ? Number(formData.get("timeout_ms")) : undefined;
  const failStrict = formData.get("fail_strict") === "true";

  if (!name || !url) throw new Error("name and url are required");
  if (scopeType === "collection" && !scopeId) throw new Error("Collection is required");

  const config: Record<string, unknown> = {};
  if (canBlock) {
    if (timeoutMs) config.timeout_ms = timeoutMs;
    config.fail_strict = failStrict;
  }

  const db = createAdminClient();
  const { error } = await db.from("webhooks").insert({
    tenant_id: tenantId,
    name,
    url,
    secret,
    scope_type: scopeType,
    scope_id: scopeId,
    events: eventsRaw,
    can_block: canBlock,
    config,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/webhooks");
  if (scopeId) revalidatePath(`/dashboard/studio/collections/${scopeId}/settings`);
}

export async function updateWebhook(id: string, formData: FormData) {
  const { tenantId, role } = await getContext();
  if (!canManage(role)) throw new Error("Insufficient permissions");

  const name = formData.get("name") as string;
  const url = formData.get("url") as string;
  const secret = formData.get("secret") as string;
  const eventsRaw = formData.getAll("events") as string[];
  const isActive = formData.get("is_active") === "true";
  const canBlock = formData.get("can_block") === "true";
  const timeoutMs = formData.get("timeout_ms") ? Number(formData.get("timeout_ms")) : undefined;
  const failStrict = formData.get("fail_strict") === "true";

  const config: Record<string, unknown> = {};
  if (canBlock) {
    if (timeoutMs) config.timeout_ms = timeoutMs;
    config.fail_strict = failStrict;
  }

  const db = createAdminClient();
  const { error } = await db
    .from("webhooks")
    .update({
      name,
      url,
      secret: secret || null,
      events: eventsRaw,
      is_active: isActive,
      can_block: canBlock,
      config,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/webhooks");
}

export async function deleteWebhook(id: string) {
  const { tenantId, role } = await getContext();
  if (!canManage(role)) throw new Error("Insufficient permissions");

  const db = createAdminClient();
  const { error } = await db
    .from("webhooks")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/webhooks");
}

export async function testWebhook(id: string) {
  const { tenantId, role } = await getContext();
  if (!canManage(role)) throw new Error("Insufficient permissions");

  const db = createAdminClient();
  const { data: webhook } = await db
    .from("webhooks")
    .select("scope_id, url, secret, events")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (!webhook) throw new Error("Webhook not found");

  await fireWebhooks(tenantId, webhook.scope_id ?? "test", "item.created", {
    id: "test-00000000-0000-0000-0000-000000000000",
    data: { _test: true, message: "PulseBox webhook test" },
    created_at: new Date().toISOString(),
  });
}
