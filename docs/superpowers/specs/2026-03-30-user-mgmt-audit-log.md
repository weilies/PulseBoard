# User Management Audit Log — Design Spec

**Date:** 2026-03-30
**Status:** Approved

---

## Problem

1. **Missing audit coverage** — All User Management operations (create/update/delete user, role changes, status changes, role CRUD, policy CRUD) write zero entries to the activity log. There is no record of who changed what.

2. **Tenant isolation leak** — `getActivityLogs` queries `event_logs` and `collection_items_audit` without filtering by active tenant. A user who belongs to multiple tenants (e.g. a Next Novas admin who is also a member of BIPO) sees logs from all their tenants at once. The correct behaviour: the activity log shows only the currently active tenant's logs (determined by the `pb-tenant` cookie).

---

## Solution

### 1. New `user_mgmt_audit` table

A dedicated audit table for user management operations, mirroring the structure of `collection_items_audit` but purpose-built for user/role/policy actions with structured before/after diffs.

```sql
CREATE TABLE public.user_mgmt_audit (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id     UUID REFERENCES auth.users(id),  -- user who performed the action
  actor_type   TEXT DEFAULT 'user',              -- 'user' | 'system'
  target_type  TEXT NOT NULL,                    -- 'user' | 'role' | 'policy'
  target_id    TEXT NOT NULL,                    -- UUID or slug of affected entity
  target_label TEXT,                             -- display name (email, role name, policy name)
  action       TEXT NOT NULL,                    -- event type string (see coverage table)
  old_data     JSONB,                            -- state before the change
  new_data     JSONB,                            -- state after the change
  status       TEXT DEFAULT 'success',           -- 'success' | 'failed'
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_mgmt_audit ENABLE ROW LEVEL SECURITY;

-- Tenant members can read their own tenant's audit log
CREATE POLICY "user_mgmt_audit_select" ON public.user_mgmt_audit
  FOR SELECT USING (
    tenant_id IN (
      SELECT tu.tenant_id FROM public.tenant_users tu
      WHERE tu.user_id = auth.uid() AND tu.is_active = true
    )
  );

-- Only server-side (service role) can insert
-- No INSERT policy — app uses admin client for writes
```

### 2. Audit coverage

Every server action in the User Management section logs one row to `user_mgmt_audit` after a successful DB write.

| Server Action | `target_type` | `action` | `old_data` | `new_data` |
|---|---|---|---|---|
| `createUser` | `user` | `user.created` | — | `{ email, role }` |
| `assignUserToTenant` | `user` | `user.assigned` | — | `{ email, role }` |
| `updateUserProfile` | `user` | `user.profile_updated` | `{ full_name }` | `{ full_name }` |
| `updateUserRole` | `user` | `user.role_changed` | `{ role }` | `{ role }` |
| `updateUserStatus` | `user` | `user.status_changed` | `{ status }` | `{ status }` |
| `removeUserFromTenant` | `user` | `user.removed` | `{ role, status }` | — |
| `deleteUser` | `user` | `user.deleted` | `{ email }` | — |
| `createRole` | `role` | `role.created` | — | `{ name, slug }` |
| `updateRole` | `role` | `role.updated` | `{ name }` | `{ name }` |
| `deleteRole` | `role` | `role.deleted` | `{ name }` | — |
| `assignPolicyToRole` | `role` | `role.policy_assigned` | — | `{ policy_name, role_name }` |
| `removePolicyFromRole` | `role` | `role.policy_removed` | `{ policy_name, role_name }` | — |
| Create policy | `policy` | `policy.created` | — | `{ name }` |
| Update policy | `policy` | `policy.updated` | `{ name, permissions }` | `{ name, permissions }` |
| Delete policy | `policy` | `policy.deleted` | `{ name }` | — |

> Coverage gaps discovered during frontend testing should be added to the table above and a new migration/action update created.

### 3. Audit helper

A shared `logUserMgmtEvent` helper function (in `src/lib/audit.ts`) used by all server actions:

```typescript
async function logUserMgmtEvent(params: {
  tenantId: string
  actorId: string
  targetType: 'user' | 'role' | 'policy'
  targetId: string
  targetLabel?: string
  action: string
  oldData?: Record<string, unknown>
  newData?: Record<string, unknown>
  status?: 'success' | 'failed'
}): Promise<void>
```

- Uses `createAdminClient()` to bypass RLS on insert (same pattern as `logEvent` in `src/lib/webhooks.ts`)
- Fire-and-forget — audit failure must never throw or block the primary action
- Called after the primary DB operation succeeds

### 4. Tenant isolation fix

**Root cause:** `getActivityLogs` in `src/app/actions/webhooks.ts` queries `event_logs` and `collection_items_audit` without a `tenant_id` filter, relying on RLS alone. RLS allows reads for all tenants the user belongs to, so cross-tenant data leaks through.

**Fix:** Pass the active `tenantId` (resolved from the `pb-tenant` cookie via `getCurrentTenantId()`) into `getActivityLogs` and add `.eq('tenant_id', tenantId)` to every table query — `event_logs`, `collection_items_audit`, and the new `user_mgmt_audit`.

**Behaviour after fix:**
- Viewing as BIPO tenant → only BIPO logs visible
- Switching to Next Novas → only Next Novas logs visible
- Super admins are subject to the same active-tenant scoping

### 5. Activity log page integration

The existing activity log page (`src/app/dashboard/studio/logs/page.tsx`) merges results from `event_logs` and `collection_items_audit` into a unified `ActivityEntry[]`. It will be extended to also fetch from `user_mgmt_audit` and merge into the same list.

Mapping `user_mgmt_audit` → `ActivityEntry`:
- `category`: `"audit"`
- `event_type`: value of `action` column (e.g. `user.role_changed`)
- `status`: value of `status` column
- `metadata`: `{ target_type, target_id, target_label, old_data, new_data }`
- `created_at`: `created_at`
- `actor_id`: `actor_id`

No UI changes required. Existing category filters, event type search, status filter, and row expansion all work without modification.

---

## Out of scope

- Audit log for tenant creation/deletion (super_admin only, tracked separately)
- Timezone preference changes (`updateUserTimezone`) — not a security-relevant action
- Exporting or retaining audit logs beyond standard DB storage

---

## Files affected

| File | Change |
|---|---|
| `supabase/migrations/XXXXX_user_mgmt_audit.sql` | New migration: table + RLS |
| `src/lib/audit.ts` | New file: `logUserMgmtEvent` helper |
| `src/app/actions/dashboard.ts` | Add `logUserMgmtEvent` calls to user actions |
| `src/app/actions/roles.ts` | Add `logUserMgmtEvent` calls to role actions |
| `src/app/actions/` (policy actions) | Add `logUserMgmtEvent` calls to policy actions |
| `src/app/actions/webhooks.ts` | Fix `getActivityLogs` to filter by active `tenantId` |
| `src/app/dashboard/studio/logs/page.tsx` | Pass `tenantId` to `getActivityLogs`; merge `user_mgmt_audit` results |
