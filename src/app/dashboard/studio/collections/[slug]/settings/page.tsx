import { createClient } from "@/lib/supabase/server";
import { getUser, getUserRole } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { CollectionSettings } from "@/components/collection-settings";
import Link from "next/link";
import { getCollectionName, getCollectionDescription } from "@/lib/i18n";
import { LANG_COOKIE } from "@/lib/constants";
import { resolveCollectionIcon } from "@/lib/icons";

type Field = {
 id: string;
 slug: string;
 name: string;
 field_type: string;
 sort_order: number;
};

type Collection = {
 id: string;
 slug: string;
 name: string;
 description: string | null;
 icon: string | null;
 type: string;
 metadata: Record<string, unknown> | null;
 collection_fields: Field[];
};

export default async function SettingsPage({
 params,
}: {
 params: Promise<{ slug: string }>;
}) {
 const { slug } = await params;

 const user = await getUser();
 if (!user) notFound();

 const supabase = await createClient();
 const tenantId = await resolveTenant(user.id);
 const role = tenantId ? await getUserRole(user.id, tenantId) : null;

 const { data: currentTenant } = tenantId
 ? await supabase.from("tenants").select("is_super").eq("id", tenantId).maybeSingle()
 : { data: null };
 const isSuperAdmin = role === "super_admin" && currentTenant?.is_super === true;

 const { data: collection } = await supabase
 .from("collections")
 .select("*, collection_fields(*)")
 .eq("slug", slug)
 .maybeSingle() as { data: Collection | null };

 if (!collection) notFound();

 const isSystem = collection.type === "system";
 const canEdit = isSuperAdmin || !isSystem;

 const fields = [...(collection.collection_fields ?? [])].sort(
 (a, b) => a.sort_order - b.sort_order
 );

 const cookieStore = await cookies();
 const currentLocale = cookieStore.get(LANG_COOKIE)?.value ?? "en";

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
  <div className="flex items-center justify-between flex-wrap gap-3">
  <div className="flex items-center gap-3">
   <div className="rounded-md border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 p-2">
   {(() => {
     const Icon = resolveCollectionIcon(collection.icon, isSystem);
     return <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
   })()}
   </div>
   <div>
   <div className="flex items-center gap-2">
    <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
    {getCollectionName(collection, currentLocale)}
    </h1>
    <Badge
    variant="outline"
    className={isSystem
     ? "border-blue-500/40 text-blue-600 dark:text-blue-400 text-xs"
     : "border-violet-500/40 text-violet-400 text-xs"}
    >
    {isSystem ? "System" : "Tenant"}
    </Badge>
   </div>
   <code className="text-xs text-gray-500 dark:text-gray-400 font-mono">{collection.slug}</code>
   {(getCollectionDescription(collection, currentLocale) ?? collection.description) && (
    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{getCollectionDescription(collection, currentLocale)}</p>
   )}
   </div>
  </div>
  </div>

  {/* Primary tab bar */}
  <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700">
  <Link
   href={`/dashboard/studio/collections/${slug}/schema`}
   className="px-4 py-2 text-sm text-blue-600 dark:text-blue-400 border-b-2 border-blue-400 font-medium"
  >
   Model
  </Link>
  <Link
   href={`/dashboard/studio/collections/${slug}/items`}
   className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
  >
   Items
  </Link>
  </div>

  {/* Secondary tab bar — Model sub-tabs */}
  <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700 -mt-px ml-1">
  <Link
   href={`/dashboard/studio/collections/${slug}/schema`}
   className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
  >
   Schema
  </Link>
  <Link
   href={`/dashboard/studio/collections/${slug}/settings`}
   className="px-3 py-1.5 text-xs text-blue-600 dark:text-blue-400 border-b-2 border-blue-400 font-medium"
  >
   Settings
  </Link>
  <Link
   href={`/dashboard/studio/collections/${slug}/form`}
   className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
  >
   Layout
  </Link>
  </div>

  {/* Collection Settings */}
  {canEdit ? (
  <div className="space-y-8">
   <div>
   <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">General Settings</h2>
   <CollectionSettings
    collectionId={collection.id}
    fields={fields}
    metadata={(collection.metadata ?? {}) as Record<string, unknown>}
   />
   </div>

  </div>
  ) : (
  <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-10 text-center">
   <p className="text-sm text-gray-500 dark:text-gray-400">Settings are read-only for this collection.</p>
  </div>
  )}
 </div>
 );
}
