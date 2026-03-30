import { createAdminClient } from "@/lib/supabase/admin";

export interface AuditEventParams {
  tenantId: string;
  actorId: string;
  actorType?: "user" | "system";
  targetType: "user" | "role" | "policy";
  targetId: string;
  targetLabel?: string;
  action: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  status?: "success" | "failed";
}

/**
 * Logs a user-management audit event to user_mgmt_audit.
 * Fire-and-forget: errors are swallowed so audit never blocks the primary op.
 */
export async function logUserMgmtEvent(params: AuditEventParams): Promise<void> {
  try {
    const db = createAdminClient();
    await db.from("user_mgmt_audit").insert({
      tenant_id:    params.tenantId,
      actor_id:     params.actorId,
      actor_type:   params.actorType ?? "user",
      target_type:  params.targetType,
      target_id:    params.targetId,
      target_label: params.targetLabel ?? null,
      action:       params.action,
      old_data:     params.oldData ?? null,
      new_data:     params.newData ?? null,
      status:       params.status ?? "success",
    });
  } catch {
    // Intentionally swallowed — audit failure must never surface to the user
  }
}
