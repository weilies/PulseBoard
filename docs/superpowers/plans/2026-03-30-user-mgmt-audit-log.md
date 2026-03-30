# User Management Audit Log — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log all User Management section operations (users, roles, policies) to a dedicated `user_mgmt_audit` table and surface them in the existing Activity Log page, scoped to the active tenant.

**Architecture:** New `user_mgmt_audit` table stores structured before/after diffs for every user/role/policy mutation. A shared `logUserMgmtEvent` helper (fire-and-forget, never throws) is called at the end of each server action. `getActivityLogs` is extended to merge results from the new table alongside the existing two sources.

**Tech Stack:** Next.js 15 server actions, Supabase Postgres + RLS, TypeScript, `@supabase/supabase-js`

---

### Task 1: Migration — create `user_mgmt_audit` table

**Files:**
- Create: `supabase/migrations/00058_user_mgmt_audit.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00058_user_mgmt_audit.sql

CREATE TABLE public.user_mgmt_audit (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id     UUID REFERENCES auth.users(id),
  actor_type   TEXT NOT NULL DEFAULT 'user',
  target_type  TEXT NOT NULL,   -- 'user' | 'role' | 'policy'
  target_id    TEXT NOT NULL,   -- UUID or slug of the affected entity
  target_label TEXT,            -- display name: email, role name, policy name
  action       TEXT NOT NULL,   -- e.g. 'user.created', 'role.deleted'
  old_data     JSONB,
  new_data     JSONB,
  status       TEXT NOT NULL DEFAULT 'success',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_mgmt_audit ENABLE ROW LEVEL SECURITY;

-- Tenant members may read their own tenant's audit entries.
-- Writes are done via service-role (admin client) — no INSERT policy needed.
CREATE POLICY "user_mgmt_audit_select" ON public.user_mgmt_audit
  FOR SELECT USING (
    tenant_id IN (
      SELECT tu.tenant_id
      FROM   public.tenant_users tu
      WHERE  tu.user_id   = auth.uid()
      AND    tu.is_active = true
    )
  );
```

- [ ] **Step 2: Push migration to Supabase cloud**

```bash
cd c:/Projects/claude/pulsebox
npx supabase db push --linked
```

Expected: `Applying migration 00058_user_mgmt_audit...` with no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00058_user_mgmt_audit.sql
git commit -m "feat: add user_mgmt_audit table with RLS"
```

---

### Task 2: Audit helper — `src/lib/audit.ts`

**Files:**
- Create: `src/lib/audit.ts`

- [ ] **Step 1: Create the helper**

```typescript
// src/lib/audit.ts
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/audit.ts
git commit -m "feat: add logUserMgmtEvent audit helper"
```

---

### Task 3: Extend `getActivityLogs` to include `user_mgmt_audit`

**Files:**
- Modify: `src/app/actions/webhooks.ts` (around line 162 — after the `collection_items_audit` block)

- [ ] **Step 1: Add the `user_mgmt_audit` import and query block**

Open `src/app/actions/webhooks.ts`. After the closing `}` of the `collection_items_audit` block (currently around line 162), insert this new block:

```typescript
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
```

The block goes right before the `// Sort merged results` comment (currently line 164).

- [ ] **Step 2: Verify dev server starts without errors**

```bash
npm run dev
```

Expected: server starts, no TypeScript errors in terminal.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/webhooks.ts
git commit -m "feat: merge user_mgmt_audit into activity log feed"
```

---

### Task 4: Instrument user actions in `dashboard.ts`

**Files:**
- Modify: `src/app/actions/dashboard.ts`

- [ ] **Step 1: Add imports**

At the top of `src/app/actions/dashboard.ts`, add:

```typescript
import { getUser } from "@/lib/auth";
import { logUserMgmtEvent } from "@/lib/audit";
```

The file currently imports only `createClient` and `createAdminClient`. The full import block becomes:

```typescript
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth";
import { logUserMgmtEvent } from "@/lib/audit";
```

- [ ] **Step 2: Instrument `createUser`**

Replace the `createUser` function (lines 77–112) with:

```typescript
export async function createUser(formData: FormData) {
  const email    = formData.get("email")    as string;
  const fullName = formData.get("fullName") as string;
  const password = formData.get("password") as string;
  const tenantId = formData.get("tenantId") as string;
  const role     = formData.get("role")     as string;

  if (!email || !fullName || !password || !tenantId || !role) {
    return { error: "All fields are required" };
  }

  const actor = await getUser();
  const admin = createAdminClient();

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (authError) return { error: authError.message };

  const roleId = await resolveRoleId(admin, tenantId, role);
  const { error: assignError } = await admin.from("tenant_users").insert([
    { tenant_id: tenantId, user_id: authData.user.id, role, role_id: roleId, is_default: false },
  ]);
  if (assignError) return { error: `User created but tenant assignment failed: ${assignError.message}` };

  // Clean up auto-assigned super tenant if needed
  const { data: superTenant } = await admin.from("tenants").select("id").eq("slug", "nextnovas").single();
  if (superTenant && superTenant.id !== tenantId) {
    await admin.from("tenant_users").delete().eq("user_id", authData.user.id).eq("tenant_id", superTenant.id);
  }

  if (actor) {
    await logUserMgmtEvent({
      tenantId,
      actorId:     actor.id,
      targetType:  "user",
      targetId:    authData.user.id,
      targetLabel: email,
      action:      "user.created",
      newData:     { email, role },
    });
  }

  return { data: authData };
}
```

- [ ] **Step 3: Instrument `assignUserToTenant`**

Replace the `assignUserToTenant` function (lines 144–162) with:

```typescript
export async function assignUserToTenant(formData: FormData) {
  const email    = formData.get("email")    as string;
  const tenantId = formData.get("tenantId") as string;
  const role     = formData.get("role")     as string;
  if (!email || !tenantId || !role) return { error: "All fields are required" };

  const actor = await getUser();
  const db = createAdminClient();

  const { data: userData, error: userError } = await db
    .from("profiles").select("id").eq("email", email).single();
  if (userError || !userData) return { error: "User not found" };

  const roleId = await resolveRoleId(db, tenantId, role);
  const { data, error } = await db.from("tenant_users").upsert(
    [{ user_id: userData.id, tenant_id: tenantId, role, role_id: roleId }],
    { onConflict: "tenant_id,user_id" }
  );
  if (error) return { error: error.message };

  if (actor) {
    await logUserMgmtEvent({
      tenantId,
      actorId:     actor.id,
      targetType:  "user",
      targetId:    userData.id,
      targetLabel: email,
      action:      "user.assigned",
      newData:     { email, role },
    });
  }

  return { data };
}
```

- [ ] **Step 4: Instrument `updateUserRole`**

Replace the `updateUserRole` function (lines 164–179) with:

```typescript
export async function updateUserRole(formData: FormData) {
  const userId   = formData.get("userId")   as string;
  const tenantId = formData.get("tenantId") as string;
  const role     = formData.get("role")     as string;
  if (!userId || !tenantId || !role) return { error: "All fields are required" };

  const actor = await getUser();
  const db = createAdminClient();

  // Capture current role for audit diff
  const { data: current } = await db
    .from("tenant_users")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .single();

  const roleId = await resolveRoleId(db, tenantId, role);
  const { data, error } = await db
    .from("tenant_users")
    .update({ role, role_id: roleId })
    .eq("user_id", userId)
    .eq("tenant_id", tenantId);
  if (error) return { error: error.message };

  if (actor) {
    await logUserMgmtEvent({
      tenantId,
      actorId:    actor.id,
      targetType: "user",
      targetId:   userId,
      action:     "user.role_changed",
      oldData:    current ? { role: current.role } : undefined,
      newData:    { role },
    });
  }

  return { data };
}
```

- [ ] **Step 5: Instrument `updateUserStatus`**

Replace the `updateUserStatus` function (lines 181–196) with:

```typescript
export async function updateUserStatus(formData: FormData) {
  const userId   = formData.get("userId")   as string;
  const tenantId = formData.get("tenantId") as string;
  const status   = formData.get("status")   as string;
  if (!userId || !tenantId || !status) return { error: "All fields are required" };
  if (!["active", "inactive", "suspended"].includes(status)) return { error: "Invalid status" };

  const actor = await getUser();
  const db = createAdminClient();

  // Capture current status for audit diff
  const { data: current } = await db
    .from("tenant_users")
    .select("status")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .single();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenant_users")
    .update({ status })
    .eq("user_id", userId)
    .eq("tenant_id", tenantId);
  if (error) return { error: error.message };

  if (actor) {
    await logUserMgmtEvent({
      tenantId,
      actorId:    actor.id,
      targetType: "user",
      targetId:   userId,
      action:     "user.status_changed",
      oldData:    current ? { status: current.status } : undefined,
      newData:    { status },
    });
  }

  return { data };
}
```

- [ ] **Step 6: Instrument `removeUserFromTenant`**

Replace the `removeUserFromTenant` function (lines 198–211) with:

```typescript
export async function removeUserFromTenant(formData: FormData) {
  const userId   = formData.get("userId")   as string;
  const tenantId = formData.get("tenantId") as string;
  if (!userId || !tenantId) return { error: "User ID and tenant ID are required" };

  const actor = await getUser();
  const db = createAdminClient();

  // Capture state before deletion for audit
  const { data: current } = await db
    .from("tenant_users")
    .select("role, status")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .single();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenant_users")
    .delete()
    .eq("user_id", userId)
    .eq("tenant_id", tenantId);
  if (error) return { error: error.message };

  if (actor) {
    await logUserMgmtEvent({
      tenantId,
      actorId:    actor.id,
      targetType: "user",
      targetId:   userId,
      action:     "user.removed",
      oldData:    current ? { role: current.role, status: current.status } : undefined,
    });
  }

  return { data };
}
```

- [ ] **Step 7: Instrument `deleteUser`**

Replace the `deleteUser` function (lines 213–221) with:

```typescript
export async function deleteUser(formData: FormData) {
  const userId = formData.get("userId") as string;
  if (!userId) return { error: "User ID is required" };

  const actor = await getUser();
  const admin = createAdminClient();

  // Capture email before deletion for audit
  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();

  const { data, error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };

  if (actor) {
    await logUserMgmtEvent({
      tenantId:    formData.get("tenantId") as string ?? "",
      actorId:     actor.id,
      targetType:  "user",
      targetId:    userId,
      targetLabel: profile?.email ?? userId,
      action:      "user.deleted",
      oldData:     profile ? { email: profile.email } : undefined,
    });
  }

  return { data };
}
```

> **Note:** `deleteUser` in the current UI passes `tenantId` in the formData (check `user-detail-dialog.tsx`). If it doesn't, the `tenantId` fallback will be an empty string — functional but the audit row will be orphaned. Verify at test time.

- [ ] **Step 8: Instrument `updateUserProfile`**

Replace the `updateUserProfile` function (lines 114–126) with:

```typescript
export async function updateUserProfile(formData: FormData) {
  const userId   = formData.get("userId")   as string;
  const fullName = formData.get("fullName") as string;
  const tenantId = formData.get("tenantId") as string;
  if (!userId || !fullName) return { error: "User ID and full name are required" };

  const actor = await getUser();
  const supabase = await createClient();

  // Capture old name for audit diff
  const { data: current } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .single();

  const { data, error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", userId);
  if (error) return { error: error.message };

  if (actor && tenantId) {
    await logUserMgmtEvent({
      tenantId,
      actorId:    actor.id,
      targetType: "user",
      targetId:   userId,
      action:     "user.profile_updated",
      oldData:    current ? { full_name: current.full_name } : undefined,
      newData:    { full_name: fullName },
    });
  }

  return { data };
}
```

> **Note:** `updateUserProfile` currently does not receive `tenantId` in formData. If the calling component doesn't pass it, audit is skipped (the `if (actor && tenantId)` guard). Check `user-detail-dialog.tsx` and add `tenantId` to the form if needed.

- [ ] **Step 9: Verify dev server starts without TypeScript errors**

```bash
npm run dev
```

- [ ] **Step 10: Commit**

```bash
git add src/app/actions/dashboard.ts
git commit -m "feat: audit-log user management actions"
```

---

### Task 5: Instrument role and policy actions in `roles.ts`

**Files:**
- Modify: `src/app/actions/roles.ts`

- [ ] **Step 1: Add import**

Add to the top of `src/app/actions/roles.ts`:

```typescript
import { logUserMgmtEvent } from "@/lib/audit";
```

Full import block becomes:

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { isSuperAdminUser } from "@/lib/services/permissions.service";
import { revalidatePath } from "next/cache";
import * as RolesService from "@/lib/services/roles.service";
import { logUserMgmtEvent } from "@/lib/audit";
```

- [ ] **Step 2: Instrument `createRole`**

Replace `createRole` with:

```typescript
export async function createRole(formData: FormData) {
  try {
    const { user, supabase, tenantId } = await getContext();
    const name        = (formData.get("name")        as string)?.trim();
    const description = (formData.get("description") as string)?.trim() || null;
    if (!name) return { error: "Name is required" };

    const result = await RolesService.createRole(supabase, { tenantId, name, description, userId: user.id });
    if (result.error) return { error: result.error };

    await logUserMgmtEvent({
      tenantId,
      actorId:     user.id,
      targetType:  "role",
      targetId:    result.data!.id,
      targetLabel: result.data!.name,
      action:      "role.created",
      newData:     { name: result.data!.name, slug: result.data!.slug },
    });

    revalidatePath("/dashboard/roles");
    return { data: result.data };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}
```

- [ ] **Step 3: Instrument `updateRole`**

Replace `updateRole` with:

```typescript
export async function updateRole(formData: FormData) {
  try {
    const { user, supabase, tenantId } = await getContext();
    const roleId      = formData.get("role_id")      as string;
    const name        = (formData.get("name")        as string)?.trim();
    const description = (formData.get("description") as string)?.trim() || null;
    if (!roleId || !name) return { error: "Role ID and name are required" };

    // Capture old name before update
    const { data: current } = await supabase
      .from("roles")
      .select("name")
      .eq("id", roleId)
      .single();

    const result = await RolesService.updateRole(supabase, { roleId, name, description });
    if (result.error) return { error: result.error };

    await logUserMgmtEvent({
      tenantId,
      actorId:     user.id,
      targetType:  "role",
      targetId:    roleId,
      targetLabel: name,
      action:      "role.updated",
      oldData:     current ? { name: current.name } : undefined,
      newData:     { name },
    });

    revalidatePath("/dashboard/roles");
    return { data: result.data };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}
```

- [ ] **Step 4: Instrument `deleteRole`**

Replace `deleteRole` with:

```typescript
export async function deleteRole(formData: FormData) {
  try {
    const { user, supabase, tenantId } = await getContext();
    const roleId = formData.get("role_id") as string;
    if (!roleId) return { error: "Role ID is required" };

    // Capture role name before deletion
    const { data: current } = await supabase
      .from("roles")
      .select("name")
      .eq("id", roleId)
      .single();

    const result = await RolesService.deleteRole(supabase, roleId);
    if (result.error) return { error: result.error };

    await logUserMgmtEvent({
      tenantId,
      actorId:     user.id,
      targetType:  "role",
      targetId:    roleId,
      targetLabel: current?.name ?? roleId,
      action:      "role.deleted",
      oldData:     current ? { name: current.name } : undefined,
    });

    revalidatePath("/dashboard/roles");
    return { data: true };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}
```

- [ ] **Step 5: Instrument `assignPolicyToRole`**

Replace `assignPolicyToRole` with:

```typescript
export async function assignPolicyToRole(formData: FormData) {
  try {
    const { user, supabase, tenantId } = await getContext();
    const roleId   = formData.get("role_id")   as string;
    const policyId = formData.get("policy_id") as string;
    if (!roleId || !policyId) return { error: "Role ID and policy ID are required" };

    // Fetch labels for audit
    const [{ data: role }, { data: policy }] = await Promise.all([
      supabase.from("roles").select("name").eq("id", roleId).single(),
      supabase.from("policies").select("name").eq("id", policyId).single(),
    ]);

    const result = await RolesService.assignPolicyToRole(supabase, { roleId, policyId });
    if (result.error) return { error: result.error };

    await logUserMgmtEvent({
      tenantId,
      actorId:     user.id,
      targetType:  "role",
      targetId:    roleId,
      targetLabel: role?.name ?? roleId,
      action:      "role.policy_assigned",
      newData:     { role_name: role?.name, policy_name: policy?.name },
    });

    revalidatePath("/dashboard/roles");
    return { data: true };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}
```

- [ ] **Step 6: Instrument `removePolicyFromRole`**

Replace `removePolicyFromRole` with:

```typescript
export async function removePolicyFromRole(formData: FormData) {
  try {
    const { user, supabase, tenantId } = await getContext();
    const roleId   = formData.get("role_id")   as string;
    const policyId = formData.get("policy_id") as string;
    if (!roleId || !policyId) return { error: "Role ID and policy ID are required" };

    // Fetch labels before removal
    const [{ data: role }, { data: policy }] = await Promise.all([
      supabase.from("roles").select("name").eq("id", roleId).single(),
      supabase.from("policies").select("name").eq("id", policyId).single(),
    ]);

    const result = await RolesService.removePolicyFromRole(supabase, { roleId, policyId });
    if (result.error) return { error: result.error };

    await logUserMgmtEvent({
      tenantId,
      actorId:     user.id,
      targetType:  "role",
      targetId:    roleId,
      targetLabel: role?.name ?? roleId,
      action:      "role.policy_removed",
      oldData:     { role_name: role?.name, policy_name: policy?.name },
    });

    revalidatePath("/dashboard/roles");
    return { data: true };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}
```

- [ ] **Step 7: Instrument `createPolicy`**

Replace `createPolicy` with:

```typescript
export async function createPolicy(formData: FormData) {
  try {
    const { user, supabase, tenantId } = await getContext();
    const name        = (formData.get("name")        as string)?.trim();
    const description = (formData.get("description") as string)?.trim() || null;
    const permissionsRaw = formData.get("permissions") as string;
    if (!name) return { error: "Name is required" };

    let permissions: Array<{ resource_type: "page" | "collection"; resource_id: string; permissions: Record<string, boolean> }> = [];
    try { permissions = permissionsRaw ? JSON.parse(permissionsRaw) : []; }
    catch { return { error: "Invalid permissions format" }; }

    const result = await RolesService.createPolicy(supabase, { tenantId, name, description, userId: user.id, permissions });
    if (result.error) return { error: result.error };

    await logUserMgmtEvent({
      tenantId,
      actorId:     user.id,
      targetType:  "policy",
      targetId:    result.data!.id,
      targetLabel: name,
      action:      "policy.created",
      newData:     { name },
    });

    revalidatePath("/dashboard/roles");
    return { data: result.data };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}
```

- [ ] **Step 8: Instrument `updatePolicyPermissions`**

Replace `updatePolicyPermissions` with:

```typescript
export async function updatePolicyPermissions(formData: FormData) {
  try {
    const { user, supabase, tenantId } = await getContext();
    const policyId       = formData.get("policy_id") as string;
    const permissionsRaw = formData.get("permissions") as string;
    if (!policyId) return { error: "Policy ID is required" };

    // Check if this is a system policy
    const { data: policy } = await supabase
      .from("policies")
      .select("name, is_system")
      .eq("id", policyId)
      .single();

    if (policy?.is_system) {
      const [isSuper, { data: tenantInfo }] = await Promise.all([
        isSuperAdminUser(supabase),
        supabase.from("tenants").select("is_super").eq("id", tenantId).single(),
      ]);
      if (!isSuper || !tenantInfo?.is_super) {
        return { error: "Only super admins in the super tenant can edit system policies" };
      }
    }

    let permissions: Array<{ resource_type: "page" | "collection"; resource_id: string; permissions: Record<string, boolean> }> = [];
    try { permissions = permissionsRaw ? JSON.parse(permissionsRaw) : []; }
    catch { return { error: "Invalid permissions format" }; }

    const result = await RolesService.updatePolicyPermissions(supabase, { policyId, permissions });
    if (result.error) return { error: result.error };

    await logUserMgmtEvent({
      tenantId,
      actorId:     user.id,
      targetType:  "policy",
      targetId:    policyId,
      targetLabel: policy?.name ?? policyId,
      action:      "policy.updated",
      newData:     { name: policy?.name, permissions },
    });

    revalidatePath("/dashboard/roles");
    return { data: true };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}
```

- [ ] **Step 9: Instrument `deletePolicy`**

Replace `deletePolicy` with:

```typescript
export async function deletePolicy(formData: FormData) {
  try {
    const { user, supabase, tenantId } = await getContext();
    const policyId = formData.get("policy_id") as string;
    if (!policyId) return { error: "Policy ID is required" };

    // Capture policy name before deletion
    const { data: policy } = await supabase
      .from("policies")
      .select("name")
      .eq("id", policyId)
      .single();

    const result = await RolesService.deletePolicy(supabase, policyId);
    if (result.error) return { error: result.error };

    await logUserMgmtEvent({
      tenantId,
      actorId:     user.id,
      targetType:  "policy",
      targetId:    policyId,
      targetLabel: policy?.name ?? policyId,
      action:      "policy.deleted",
      oldData:     policy ? { name: policy.name } : undefined,
    });

    revalidatePath("/dashboard/roles");
    return { data: true };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}
```

- [ ] **Step 10: Verify dev server starts without TypeScript errors**

```bash
npm run dev
```

- [ ] **Step 11: Commit**

```bash
git add src/app/actions/roles.ts
git commit -m "feat: audit-log role and policy management actions"
```

---

### Task 6: Check `tenantId` availability in calling components

Two actions from Task 4 have conditional notes — verify these before calling done.

**Files:**
- Read: `src/components/user-detail-dialog.tsx`

- [ ] **Step 1: Check `deleteUser` call site for `tenantId`**

Search for where `deleteUser` is called:

```bash
grep -n "deleteUser\|tenantId" src/components/user-detail-dialog.tsx | head -30
```

If `tenantId` is NOT passed in the FormData for `deleteUser`, add a hidden input:

```tsx
<input type="hidden" name="tenantId" value={tenantId} />
```

- [ ] **Step 2: Check `updateUserProfile` call site for `tenantId`**

Search for where `updateUserProfile` is called:

```bash
grep -n "updateUserProfile\|tenantId" src/components/user-detail-dialog.tsx | head -30
```

Same fix: add hidden input if missing.

- [ ] **Step 3: Commit any component fixes**

```bash
git add src/components/user-detail-dialog.tsx
git commit -m "fix: pass tenantId to deleteUser and updateUserProfile for audit logging"
```

(Skip this commit if no changes were needed.)

---

### Task 7: Manual end-to-end verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Perform each audited action in the UI**

Log in as a `tenant_admin`. Perform these actions:
1. Create a new user
2. Change that user's role
3. Change that user's status to `suspended`
4. Remove user from tenant
5. Create a role
6. Update the role name
7. Assign a policy to the role
8. Remove the policy from the role
9. Delete the role
10. Create a policy
11. Update a policy's permissions
12. Delete the policy

- [ ] **Step 3: Navigate to Activity Log and verify entries**

Go to `/dashboard/studio/logs`. Filter by Category = `audit`. Verify:
- Each action above appears as an entry
- Event type matches (e.g. `user.created`, `role.deleted`)
- Expanding a row shows correct `old_data` / `new_data`
- No entries from other tenants are visible

- [ ] **Step 4: Switch tenant and verify isolation**

Switch to a different tenant via the tenant switcher. Go to Activity Log. Verify **none** of the entries from Step 2 are visible.

Switch back to the original tenant and verify they reappear.
