# Shared System Policies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** System policies (`is_system = true`) live ONLY in the super tenant and are shared (same UUID) across all tenants. Custom policies remain per-tenant.

**Architecture:** System policies belong to the super tenant (Next Novas). All tenants' roles reference the same system policy UUIDs via `role_policies`. RLS is updated so non-super tenants can READ system policies but not modify them. The `get_accessible_pages()` RPC chain (`tenant_users → role_policies → policy_permissions`) already works cross-tenant since it doesn't filter by `tenant_id` — only the data migration and RLS need changing.

**Tech Stack:** Supabase SQL migrations, Next.js server components, TypeScript

---

## Current State

- "Tenant Management" system policy is duplicated per tenant (BIPO: `95b00b6c`, AStudion: `746a453f`, Next Novas: `f22927ee`) — each with its own `policy_permissions`
- "Full Platform Access" and "Content Catalog Management" exist only in super tenant (correct)
- Each tenant's roles link to their LOCAL copy of system policies
- `createTenant()` in `tenants.service.ts` creates per-tenant system policies (wrong after this change)

## Target State

- System policies exist ONLY in super tenant (`tenant_id = super_tenant.id`)
- All tenants' `role_policies` point to the super tenant's system policy UUIDs
- Non-super tenants can READ system policies + permissions but cannot modify them
- Custom policies remain per-tenant, fully editable
- When creating a new tenant, link its `tenant_admin` role to the super tenant's existing "Tenant Management" policy — do NOT create a new copy

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/00056_shared_system_policies.sql` | Create | Data migration + RLS updates |
| `src/app/dashboard/policies/page.tsx` | Modify | Query system + custom policies |
| `src/app/dashboard/policies/[id]/page.tsx` | Modify | Load system policies cross-tenant |
| `src/app/dashboard/roles/[roleId]/page.tsx` | Modify | List system + custom policies for assignment |
| `src/lib/services/roles.service.ts` | Modify | `getPolicies()` returns system + custom |
| `src/lib/services/tenants.service.ts` | Modify | Stop creating per-tenant system policies |
| `src/app/actions/roles.ts` | Modify | Policy lookup without tenant filter for system |

---

### Task 1: SQL Migration — Consolidate System Policies + Update RLS

**Files:**
- Create: `supabase/migrations/00056_shared_system_policies.sql`

This is the most critical task. It consolidates duplicate system policies into the super tenant's copies, re-links `role_policies`, updates RLS to allow cross-tenant reads of system policies, and cleans up orphaned duplicates.

- [ ] **Step 1: Write the migration**

```sql
-- =============================================================================
-- 00056_shared_system_policies.sql
-- System policies live ONLY in the super tenant and are shared across all tenants.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Re-link role_policies from per-tenant system policy copies to the
--    super tenant's canonical system policies (matched by name).
-- ---------------------------------------------------------------------------
do $$
declare
  v_super_tenant_id uuid;
  v_local_policy record;
  v_canonical_id uuid;
begin
  select id into v_super_tenant_id from public.tenants where is_super = true limit 1;
  if v_super_tenant_id is null then
    raise exception 'No super tenant found';
  end if;

  -- For each system policy in a non-super tenant, find the matching super tenant policy
  for v_local_policy in
    select p.id as local_id, p.name
    from public.policies p
    where p.is_system = true
      and p.tenant_id != v_super_tenant_id
  loop
    select id into v_canonical_id
    from public.policies
    where tenant_id = v_super_tenant_id
      and name = v_local_policy.name
      and is_system = true;

    -- If no matching canonical policy exists in super tenant, skip (shouldn't happen)
    if v_canonical_id is null then
      raise notice 'No canonical policy found for "%" — skipping', v_local_policy.name;
      continue;
    end if;

    -- Re-link role_policies to point to the canonical policy
    -- Use ON CONFLICT to handle cases where the link already exists
    insert into public.role_policies (role_id, policy_id)
    select rp.role_id, v_canonical_id
    from public.role_policies rp
    where rp.policy_id = v_local_policy.local_id
    on conflict (role_id, policy_id) do nothing;

    -- Delete the old links
    delete from public.role_policies
    where policy_id = v_local_policy.local_id;

  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Delete orphaned per-tenant system policies (now have no role_policies).
--    Cascades to their policy_permissions.
-- ---------------------------------------------------------------------------
delete from public.policies p
where p.is_system = true
  and p.tenant_id != (select id from public.tenants where is_super = true)
  and not exists (
    select 1 from public.role_policies rp where rp.policy_id = p.id
  );

-- ---------------------------------------------------------------------------
-- 3. Update RLS on `policies` — allow all authenticated users to READ
--    system policies (is_system = true), regardless of tenant.
-- ---------------------------------------------------------------------------
drop policy if exists "policies_select" on public.policies;
create policy "policies_select" on public.policies
  for select using (
    is_system = true                                      -- everyone reads system policies
    or public.is_super_admin()                            -- super admin reads everything
    or tenant_id in (select public.get_my_tenant_ids())   -- users read their tenant's custom policies
  );

-- Manage policy: system policies writable only by super admin in super tenant.
-- Custom policies writable by users with 'roles' page access in their tenant.
drop policy if exists "policies_manage" on public.policies;
create policy "policies_manage" on public.policies
  for all using (
    public.is_super_admin()
    or (
      not is_system
      and tenant_id in (select public.get_my_tenant_ids())
      and public.has_page_access('roles')
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Update RLS on `policy_permissions` — allow reading permissions for
--    system policies (visible to all) + own tenant's custom policies.
-- ---------------------------------------------------------------------------
drop policy if exists "pp_select" on public.policy_permissions;
create policy "pp_select" on public.policy_permissions
  for select using (
    public.is_super_admin()
    or policy_id in (
      select id from public.policies
      where is_system = true
         or tenant_id in (select public.get_my_tenant_ids())
    )
  );

-- Manage: system policy permissions writable only by super admin.
-- Custom policy permissions writable by users with 'roles' page access.
drop policy if exists "pp_manage" on public.policy_permissions;
create policy "pp_manage" on public.policy_permissions
  for all using (
    public.is_super_admin()
    or (
      public.has_page_access('roles')
      and policy_id in (
        select id from public.policies
        where not is_system
          and tenant_id in (select public.get_my_tenant_ids())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 5. role_policies RLS stays the same — it checks role's tenant, not
--    policy's tenant. Cross-tenant links (tenant role → super tenant policy)
--    are visible because the role belongs to the user's tenant.
-- ---------------------------------------------------------------------------
```

- [ ] **Step 2: Push the migration**

Run: `npx supabase db push --linked`
Expected: Migration applies successfully

- [ ] **Step 3: Verify data consolidation**

Run:
```sql
-- Should show system policies ONLY in super tenant
select p.id, p.name, t.name as tenant_name, p.is_system
from policies p join tenants t on t.id = p.tenant_id
where p.is_system = true order by p.name;

-- Should show cross-tenant role_policies links
select r.name as role_name, t.name as tenant_name, p.name as policy_name, p.is_system
from role_policies rp
join roles r on r.id = rp.role_id
join tenants t on t.id = r.tenant_id
join policies p on p.id = rp.policy_id
order by t.name, r.name;
```

Expected: System policies only in Next Novas. BIPO Service's Tenant Admin links to Next Novas's "Tenant Management" UUID.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00056_shared_system_policies.sql
git commit -m "feat: consolidate system policies into super tenant with shared UUIDs"
```

---

### Task 2: Update Policies List Page — Show System + Custom

**Files:**
- Modify: `src/app/dashboard/policies/page.tsx:46-69`

The policies list currently queries `policies` filtered by `tenant_id`. After the migration, system policies live in the super tenant, so we need to query both system policies (any tenant, via RLS) and custom policies (current tenant).

- [ ] **Step 1: Update the query**

Replace the current `.eq("tenant_id", tenantId)` query with an `.or()` that fetches system policies + current tenant's custom policies:

```typescript
// Old (line 46-51):
let pq = supabase.from("policies").select(`
  id, name, description, is_system, created_at,
  role_policies(
    role:roles(id, name)
  )
`, { count: "exact" }).eq("tenant_id", tenantId);

// New:
let pq = supabase.from("policies").select(`
  id, name, description, is_system, created_at,
  role_policies(
    role:roles(id, name)
  )
`, { count: "exact" }).or(`is_system.eq.true,tenant_id.eq.${tenantId}`);
```

- [ ] **Step 2: Remove the client-side visibility filter**

Remove lines 61-69 (the `rows` filter that hid system policies for non-super tenants). Replace with:

```typescript
const rows = policies ?? [];
```

System policies are now shared — ALL tenants should see them. The RLS already handles visibility.

- [ ] **Step 3: Filter role badges for current tenant only**

When showing "Roles" column for system policies, a system policy may be linked to roles across MANY tenants. Only show roles from the CURRENT tenant. The `role_policies` join already returns role data — but the query currently doesn't filter by tenant. We need the `role_policies` to only return roles for the current tenant.

Update the query's nested select to filter roles by tenant:

```typescript
let pq = supabase.from("policies").select(`
  id, name, description, is_system, created_at,
  role_policies!inner(
    role:roles!inner(id, name, tenant_id)
  )
`, { count: "exact" }).or(`is_system.eq.true,tenant_id.eq.${tenantId}`);
```

Wait — using `!inner` would exclude policies with no roles in the current tenant. Instead, keep the LEFT join but filter roles client-side:

```typescript
let pq = supabase.from("policies").select(`
  id, name, description, is_system, created_at,
  role_policies(
    role:roles(id, name, tenant_id)
  )
`, { count: "exact" }).or(`is_system.eq.true,tenant_id.eq.${tenantId}`);
```

Then when rendering the linked roles (lines 112-117), filter to current tenant:

```typescript
const linkedRoles = (policy.role_policies ?? [])
  .map((rp) => {
    const r = rp.role as unknown as { id: string; name: string; tenant_id: string } | null;
    return r;
  })
  .filter((r): r is { id: string; name: string; tenant_id: string } =>
    r != null && r.tenant_id === tenantId
  );
```

- [ ] **Step 4: Verify in browser**

Navigate to `/dashboard/policies` as:
1. Super admin (Next Novas) — should see system + custom policies
2. BIPO Service tenant admin (Maggie) — should see shared system policies + BIPO's custom policies

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/policies/page.tsx
git commit -m "feat: policies list shows shared system policies from super tenant"
```

---

### Task 3: Update Policy Detail Page — Cross-Tenant System Policy Loading

**Files:**
- Modify: `src/app/dashboard/policies/[id]/page.tsx:27`

The policy detail page currently queries `.eq("tenant_id", tenantId)` which will 404 for system policies when viewed from a non-super tenant (since system policies now belong to the super tenant).

- [ ] **Step 1: Update the policy query**

Replace line 27:

```typescript
// Old:
supabase.from("policies")
  .select("id, name, description, is_system, policy_permissions(resource_type, resource_id, permissions)")
  .eq("id", id)
  .eq("tenant_id", tenantId)
  .single(),

// New — let RLS handle visibility (system policies are visible to all):
supabase.from("policies")
  .select("id, name, description, is_system, tenant_id, policy_permissions(resource_type, resource_id, permissions)")
  .eq("id", id)
  .single(),
```

We add `tenant_id` to the select so we can verify the policy belongs to the user's tenant OR is a system policy.

- [ ] **Step 2: Add access validation after the query**

After `if (!policy) notFound();` (line 34), add a check:

```typescript
if (!policy) notFound();
// Ensure user can access this policy: must be system OR belong to current tenant
if (!policy.is_system && policy.tenant_id !== tenantId) notFound();
```

- [ ] **Step 3: Verify system policy is read-only for non-super tenants**

`canEditSystem` is already calculated as `isSuperAdmin && isSuperTenant` (line 33). The `PolicyPermissionsEditor` already respects this. No change needed.

- [ ] **Step 4: Verify in browser**

1. As BIPO tenant admin (Maggie), navigate to a system policy (e.g., "Tenant Management") — should load, permissions read-only
2. As super admin (Next Novas), navigate to same policy — should be editable

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/policies/[id]/page.tsx
git commit -m "feat: policy detail page loads shared system policies cross-tenant"
```

---

### Task 4: Update Role Detail Page — List System + Custom Policies for Assignment

**Files:**
- Modify: `src/app/dashboard/roles/[roleId]/page.tsx:38`

The role detail page queries `allPolicies` with `.eq("tenant_id", tenantId)`. After the migration, system policies live in the super tenant, so non-super tenants won't see them in the dropdown.

- [ ] **Step 1: Update the allPolicies query**

Replace line 38:

```typescript
// Old:
supabase.from("policies").select("id, name, is_system").eq("tenant_id", tenantId).order("name"),

// New — system policies (any tenant) + custom policies (current tenant):
supabase.from("policies").select("id, name, is_system").or(`is_system.eq.true,tenant_id.eq.${tenantId}`).order("name"),
```

- [ ] **Step 2: Verify in browser**

As BIPO Service tenant admin, go to a role detail page. The "Add Policy" dropdown should show "Tenant Management" (system) + any BIPO custom policies.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/roles/[roleId]/page.tsx
git commit -m "feat: role detail shows shared system policies in assignment dropdown"
```

---

### Task 5: Update `getPolicies()` Service

**Files:**
- Modify: `src/lib/services/roles.service.ts:132-143`

The `getPolicies()` function is used elsewhere and filters by `tenant_id`. Update it to also return system policies.

- [ ] **Step 1: Update the query**

```typescript
// Old:
export async function getPolicies(supabase: SupabaseClient, tenantId: string) {
  const { data, error } = await supabase
    .from("policies")
    .select(`id, name, description, is_system, policy_permissions(resource_type, resource_id, permissions)`)
    .eq("tenant_id", tenantId)
    .order("is_system", { ascending: false })
    .order("name");
  if (error) return { error: error.message };
  return { data: data ?? [] };
}

// New:
export async function getPolicies(supabase: SupabaseClient, tenantId: string) {
  const { data, error } = await supabase
    .from("policies")
    .select(`id, name, description, is_system, policy_permissions(resource_type, resource_id, permissions)`)
    .or(`is_system.eq.true,tenant_id.eq.${tenantId}`)
    .order("is_system", { ascending: false })
    .order("name");
  if (error) return { error: error.message };
  return { data: data ?? [] };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/services/roles.service.ts
git commit -m "feat: getPolicies returns shared system policies + tenant custom policies"
```

---

### Task 6: Update `updatePolicyPermissions` Server Action

**Files:**
- Modify: `src/app/actions/roles.ts:136-140`

The `updatePolicyPermissions` action queries the policy with no tenant filter — but the RLS `policies_select` already handles visibility. However, the system policy edit guard on line 142-150 queries the policy without a tenant filter, which is correct. No change needed for the guard logic.

But we should verify the RLS `pp_manage` policy prevents non-super users from modifying system policy permissions at the DB level. This is already handled by the migration in Task 1.

- [ ] **Step 1: Verify no code changes needed**

The existing guard on lines 142-150 already blocks non-super-admin edits of system policies. The RLS `pp_manage` policy (from Task 1's migration) also blocks at the DB level. No code change required.

- [ ] **Step 2: Verify in browser**

As BIPO tenant admin (Maggie), navigate to a system policy detail page. The "Save Permissions" button should be disabled. Attempting to call the action directly should return an error.

---

### Task 7: Update `createTenant` — Link to Shared System Policies

**Files:**
- Modify: `src/lib/services/tenants.service.ts:18-43`

The current `createTenant` creates per-tenant system policies. After this change, it should link the new tenant's `tenant_admin` role to the super tenant's existing "Tenant Management" system policy instead.

- [ ] **Step 1: Rewrite the seeding logic**

```typescript
  const admin = createAdminClient();

  // Create tenant_admin role for the new tenant
  const { data: roleData, error: roleError } = await admin
    .from("roles")
    .insert([{ tenant_id: tenantData.id, name: "Tenant Admin", slug: "tenant_admin", description: "Full access within this tenant", is_system: true }])
    .select("id")
    .single();
  if (roleError) return { error: `Tenant created but role seeding failed: ${roleError.message}` };

  // Link the role to the super tenant's shared "Tenant Management" system policy
  const { data: systemPolicy } = await admin
    .from("policies")
    .select("id")
    .eq("name", "Tenant Management")
    .eq("is_system", true)
    .limit(1)
    .single();

  if (systemPolicy) {
    await admin.from("role_policies").insert([{ role_id: roleData.id, policy_id: systemPolicy.id }]);
  }

  // Assign creator as tenant_admin
  const { error: assignError } = await admin.from("tenant_users").insert([
    { tenant_id: tenantData.id, user_id: userId, role: "tenant_admin", role_id: roleData.id, is_default: false },
  ]);
  if (assignError) return { error: `Tenant created but could not assign creator: ${assignError.message}` };

  return { data: tenantData };
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/services/tenants.service.ts
git commit -m "feat: new tenants link to shared system policies instead of creating copies"
```

---

### Task 8: Verification — End-to-End Testing

- [ ] **Step 1: Verify sidebar works for BIPO Service (Maggie)**

Log in as `maggie.bipo@example.com`, switch to BIPO Service tenant. Sidebar should show navigation items based on system policy permissions.

- [ ] **Step 2: Verify policies page for non-super tenant**

Navigate to `/dashboard/policies` as Maggie. Should see:
- "Tenant Management" (System badge) — shared from super tenant
- "BPO Product Director" (Custom badge) — BIPO's own policy

- [ ] **Step 3: Verify system policy is read-only for non-super tenant**

Click on "Tenant Management" — permissions editor should be read-only (checkboxes disabled, no Save button).

- [ ] **Step 4: Verify super admin can still edit system policies**

Log in as super admin (Next Novas). Navigate to "Tenant Management" policy. Should be fully editable. Changes should reflect across ALL tenants.

- [ ] **Step 5: Verify role detail page shows system policies**

Navigate to a BIPO role detail page. "Tenant Management" should appear in the assigned/available policies list.

- [ ] **Step 6: Verify creating a new tenant**

Create a new test tenant. The new tenant should:
- Have a `tenant_admin` role
- That role should be linked to the super tenant's "Tenant Management" policy (same UUID)
- No new system policy should be created
