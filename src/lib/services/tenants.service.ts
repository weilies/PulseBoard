import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createTenant(
  supabase: SupabaseClient,
  params: { name: string; slug: string; userId: string; contactName?: string; contactEmail?: string }
) {
  const { name, slug, userId, contactName, contactEmail } = params;

  const { data: tenantData, error: tenantError } = await supabase
    .from("tenants")
    .insert([{ name, slug, contact_name: contactName || null, contact_email: contactEmail || null }])
    .select("id")
    .single();
  if (tenantError) return { error: tenantError.message };

  const admin = createAdminClient();

  // Create tenant_admin role for the new tenant
  const { data: roleData, error: roleError } = await admin
    .from("roles")
    .insert([{ tenant_id: tenantData.id, name: "Tenant Admin", slug: "tenant_admin", description: "Full access within this tenant", is_system: true }])
    .select("id")
    .single();
  if (roleError) return { error: `Tenant created but role seeding failed: ${roleError.message}` };

  // Link the role to the super tenant's shared "Tenant Management" system policy
  const { data: systemPolicy, error: policyErr } = await admin
    .from("policies")
    .select("id")
    .eq("name", "Tenant Management")
    .eq("is_system", true)
    .limit(1)
    .maybeSingle();

  if (policyErr || !systemPolicy) {
    return { error: `Tenant created but could not find shared Tenant Management policy: ${policyErr?.message ?? "not found"}` };
  }

  const { error: rpErr } = await admin
    .from("role_policies")
    .insert([{ role_id: roleData.id, policy_id: systemPolicy.id }]);
  if (rpErr) return { error: `Tenant created but policy link failed: ${rpErr.message}` };

  // Assign creator as tenant_admin
  const { error: assignError } = await admin.from("tenant_users").insert([
    { tenant_id: tenantData.id, user_id: userId, role: "tenant_admin", role_id: roleData.id, is_default: false },
  ]);
  if (assignError) return { error: `Tenant created but could not assign creator: ${assignError.message}` };

  // Seed nav_items for all standard pages so the sidebar populates immediately
  await admin.from("nav_items").insert([
    { tenant_id: tenantData.id, resource_type: "page", resource_id: "dashboard",                 sort_order: 0 },
    { tenant_id: tenantData.id, resource_type: "page", resource_id: "users",                     sort_order: 1 },
    { tenant_id: tenantData.id, resource_type: "page", resource_id: "studio.system-collections", sort_order: 2 },
    { tenant_id: tenantData.id, resource_type: "page", resource_id: "studio.tenant-collections", sort_order: 3 },
    { tenant_id: tenantData.id, resource_type: "page", resource_id: "roles",                     sort_order: 4 },
    { tenant_id: tenantData.id, resource_type: "page", resource_id: "apps",                      sort_order: 5 },
    { tenant_id: tenantData.id, resource_type: "page", resource_id: "webhooks",                  sort_order: 6 },
    { tenant_id: tenantData.id, resource_type: "page", resource_id: "studio.app-store",          sort_order: 7 },
  ]).select();
  // nav_items seeding is best-effort — do not block tenant creation on failure

  return { data: tenantData };
}

export async function updateTenant(
  supabase: SupabaseClient,
  params: { tenantId: string; name: string; slug: string; contactName?: string; contactEmail?: string; timezone?: string }
) {
  const { tenantId, name, slug, contactName, contactEmail, timezone } = params;
  const { data, error } = await supabase
    .from("tenants")
    .update({
      name,
      slug,
      contact_name: contactName || null,
      contact_email: contactEmail || null,
      timezone: timezone || "Asia/Singapore",
    })
    .eq("id", tenantId);
  if (error) return { error: error.message };
  return { data };
}

export async function deleteTenant(supabase: SupabaseClient, tenantId: string) {
  const admin = createAdminClient();

  // 1. Find all users in this tenant
  const { data: tenantUsers, error: fetchError } = await admin
    .from("tenant_users")
    .select("user_id")
    .eq("tenant_id", tenantId);
  if (fetchError) return { error: fetchError.message };

  const userIds = (tenantUsers ?? []).map((r: { user_id: string }) => r.user_id);

  // 2. Find users who belong ONLY to this tenant (single batch query instead of N+1)
  const usersToDelete: string[] = [];
  if (userIds.length > 0) {
    const { data: usersWithOtherTenants } = await admin
      .from("tenant_users")
      .select("user_id")
      .in("user_id", userIds)
      .neq("tenant_id", tenantId);
    const usersInOtherTenants = new Set((usersWithOtherTenants ?? []).map((r: { user_id: string }) => r.user_id));
    for (const userId of userIds) {
      if (!usersInOtherTenants.has(userId)) usersToDelete.push(userId);
    }
  }

  // 3. Delete collection_items BEFORE deleting the tenant.
  //    The audit trigger on collection_items fires on DELETE and inserts into
  //    collection_items_audit — if we let the tenant cascade handle this, the
  //    tenant row is already gone when the trigger runs, causing a FK violation.
  //    Deleting items explicitly first keeps the tenant alive for the trigger.
  const { error: itemsDeleteError } = await admin
    .from("collection_items")
    .delete()
    .eq("tenant_id", tenantId);
  if (itemsDeleteError) return { error: itemsDeleteError.message };

  // 4. Delete leftover audit records (tenant still alive at this point).
  await admin.from("collection_items_audit").delete().eq("tenant_id", tenantId);

  // 5. Delete the tenant (cascades tenant_users, collections, webhooks, etc.)
  const { error: deleteError } = await admin
    .from("tenants")
    .delete()
    .eq("id", tenantId);
  if (deleteError) return { error: deleteError.message };

  // 6. Hard-delete users who were only in this tenant (concurrent)
  await Promise.all(usersToDelete.map((userId) => admin.auth.admin.deleteUser(userId)));

  return { data: true };
}

export async function setDefaultTenant(
  supabase: SupabaseClient,
  params: { userId: string; tenantId: string }
) {
  const { userId, tenantId } = params;
  await supabase.from("tenant_users").update({ is_default: false }).eq("user_id", userId);
  const { data, error } = await supabase
    .from("tenant_users")
    .update({ is_default: true })
    .eq("user_id", userId)
    .eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  return { data };
}
