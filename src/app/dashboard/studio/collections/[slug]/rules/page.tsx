import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser, getUserRole } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { notFound } from "next/navigation";
import { Database, Layers, ArrowLeft } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { RulesClient } from "./rules-client";

function resolveCollectionIcon(
  icon: string | null | undefined,
  isSystem: boolean
): React.ComponentType<{ className?: string }> {
  if (icon) {
    const name = icon.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
    const Comp = (LucideIcons as Record<string, unknown>)[name];
    if (Comp) return Comp as React.ComponentType<{ className?: string }>;
  }
  return isSystem ? Database : Layers;
}

export default async function RulesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const tenantId = await resolveTenant(user.id);
  if (!tenantId) notFound();

  const role = await getUserRole(user.id, tenantId);
  const db = createAdminClient();

  const { data: currentTenant } = await db
    .from("tenants")
    .select("is_super")
    .eq("id", tenantId)
    .maybeSingle();
  const isSuperAdmin = role === "super_admin" && currentTenant?.is_super === true;

  // Load collection
  const { data: collection } = await db
    .from("collections")
    .select("id, slug, name, description, type, icon")
    .eq("slug", slug)
    .maybeSingle();

  if (!collection) notFound();

  const isSystem = collection.type === "system";

  // Load all active rules for this collection (platform + tenant)
  const { data: rules } = await db
    .from("collection_rules")
    .select("id, rule_type, name, description, priority, is_active, conditions, actions, require_parent, tenant_id, app_id, created_at, updated_at")
    .eq("collection_slug", slug)
    .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
    .order("rule_type")
    .order("priority");

  // Load collection fields for condition/action builders
  const { data: fields } = await db
    .from("collection_fields")
    .select("slug, name, field_type")
    .eq("collection_id", collection.id)
    .order("sort_order");

  const CollIcon = resolveCollectionIcon(collection.icon ?? null, isSystem);

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Back nav */}
      <Link
        href={isSystem ? "/dashboard/studio/system-collections" : "/dashboard/studio/tenant-collections"}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {isSystem ? "Back to System Collections" : "Back to Tenant Collections"}
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-md border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 p-2">
          <CollIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
              {collection.name}
            </h1>
            <Badge
              variant="outline"
              className={isSystem ? "border-blue-500/40 text-blue-600 dark:text-blue-400 text-xs" : "border-violet-500/40 text-violet-400 text-xs"}
            >
              {isSystem ? "System" : "Tenant"}
            </Badge>
          </div>
          <code className="text-xs text-gray-500 dark:text-gray-400 font-mono">{collection.slug}</code>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700">
        <Link href={`/dashboard/studio/collections/${collection.slug}/schema`} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Schema</Link>
        <Link href={`/dashboard/studio/collections/${collection.slug}/items`} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Items</Link>
        <Link href={`/dashboard/studio/collections/${collection.slug}/settings`} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Settings</Link>
        <Link href={`/dashboard/studio/collections/${collection.slug}/form`} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Layout</Link>
        <Link href={`/dashboard/studio/collections/${collection.slug}/rules`} className="px-4 py-2 text-sm text-blue-600 dark:text-blue-400 border-b-2 border-blue-400 font-medium">Rules</Link>
      </div>

      {/* Rules content */}
      <RulesClient
        collectionSlug={slug}
        collectionId={collection.id}
        rules={(rules ?? []) as Parameters<typeof RulesClient>[0]["rules"]}
        fields={(fields ?? []) as Parameters<typeof RulesClient>[0]["fields"]}
        tenantId={tenantId}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
}
