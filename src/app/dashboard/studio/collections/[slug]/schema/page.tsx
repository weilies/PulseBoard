import { createClient } from "@/lib/supabase/server";
import { getUser, getUserRole } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { Badge } from "@/components/ui/badge";
import { CreateFieldDialog } from "@/components/create-field-dialog";
import { DraggableFieldList } from "@/components/draggable-field-list";
import { Database, Layers, ArrowLeft } from "lucide-react";
import * as LucideIcons from "lucide-react";

function resolveCollectionIcon(
  icon: string | null | undefined,
  isSystem: boolean
): React.ComponentType<{ className?: string }> {
  if (icon) {
    const name = icon.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
    const Comp = (LucideIcons as Record<string, unknown>)[name];
    if (typeof Comp === "function") return Comp as React.ComponentType<{ className?: string }>;
  }
  return isSystem ? Database : Layers;
}
import Link from "next/link";
import { getFieldLabel, getCollectionName, getCollectionDescription } from "@/lib/i18n";
import { LANG_COOKIE } from "@/lib/constants";

type Field = {
 id: string;
 slug: string;
 name: string;
 field_type: string;
 is_required: boolean;
 is_unique: boolean;
 is_translatable: boolean;
 show_in_grid: boolean;
 sort_order: number;
 options: Record<string, unknown>;
};

type Collection = {
 id: string;
 slug: string;
 name: string;
 description: string | null;
 type: string;
 icon: string | null;
 metadata: Record<string, unknown> | null;
 collection_fields: Field[];
};

export default async function SchemaPage({
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
 const isSuperAdmin = role === "super_admin" && (currentTenant?.is_super === true);

 const { data: collection } = await supabase
 .from("collections")
 .select("*, collection_fields(*)")
 .eq("slug", slug)
 .maybeSingle() as { data: Collection | null };

 if (!collection) notFound();

 const { data: allCollections } = await supabase
 .from("collections")
 .select("id, name, slug")
 .order("name");

 const fields = [...(collection.collection_fields ?? [])].sort(
 (a, b) => a.sort_order - b.sort_order
 );

 const isSystem = collection.type === "system";
 const canEdit = isSuperAdmin || !isSystem;

 const cookieStore = await cookies();
 const currentLocale = cookieStore.get(LANG_COOKIE)?.value ?? "en";

 return (
 <div className="p-6 space-y-6 max-w-4xl">
 {/* Back nav */}
 <Link
 href={isSystem ? "/dashboard/studio/system-collections" : "/dashboard/studio/tenant-collections"}
 className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 dark:text-blue-400 transition-colors"
 >
 <ArrowLeft className="h-3.5 w-3.5" />
 {isSystem ? "Back to System Collections" : "Back to Tenant Collections"}
 </Link>

 {/* Header */}
 <div className="flex items-center justify-between flex-wrap gap-3">
 <div className="flex items-center gap-3">
 <div className="rounded-md border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 p-2">
 {(() => { const CollIcon = resolveCollectionIcon(collection.icon ?? null, isSystem); return <CollIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />; })()}
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

 {canEdit && (
 <CreateFieldDialog
 collectionId={collection.id}
 collectionSlug={collection.slug}
 allCollections={allCollections ?? []}
 />
 )}
 </div>

 {/* Tab bar */}
 <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700">
 <Link
 href={`/dashboard/studio/collections/${collection.slug}/schema`}
 className="px-4 py-2 text-sm text-blue-600 dark:text-blue-400 border-b-2 border-blue-400 font-medium"
 >
 Schema
 </Link>
 <Link
 href={`/dashboard/studio/collections/${collection.slug}/items`}
 className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 dark:text-blue-400 transition-colors"
 >
 Items
 </Link>
 <Link
 href={`/dashboard/studio/collections/${collection.slug}/settings`}
 className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
 >
 Settings
 </Link>
 <Link
 href={`/dashboard/studio/collections/${collection.slug}/form`}
 className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
 >
 Layout
 </Link>
 
 <Link
 href={`/dashboard/studio/collections/${collection.slug}/rules`}
 className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
 >
 Rules
 </Link>
</div>

 {/* Fields subtitle */}
 <div className="flex items-center justify-between">
 <p className="text-sm text-gray-500 dark:text-gray-400">
 {fields.length} field{fields.length !== 1 ? "s" : ""} defined.
 Each field maps to a key in the item&apos;s <code className="text-xs text-blue-600 dark:text-blue-400 font-mono">data</code> JSONB.
 {isSystem && !isSuperAdmin && <span className="ml-2">(read-only)</span>}
 </p>
 </div>

 {/* Fields list */}
 {fields.length === 0 ? (
 <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col items-center justify-center py-12 text-center">
 <p className="text-gray-500 dark:text-gray-400 text-sm">No fields yet.</p>
 {canEdit && (
 <p className="text-gray-500 dark:text-gray-400/60 text-xs mt-1">Add your first field to start defining this collection&apos;s schema.</p>
 )}
 </div>
 ) : (
 <DraggableFieldList
 fields={fields}
 collectionId={collection.id}
 collectionSlug={collection.slug}
 allCollections={allCollections ?? []}
 canEdit={canEdit}
 currentLocale={currentLocale}
 />
 )}

 {/* API hint */}
 <div className="rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/50 p-4">
 <p className="text-xs text-gray-500 dark:text-gray-400">
 <span className="text-gray-900 dark:text-gray-100 font-medium">API endpoint:</span>{""}
 <code className="text-blue-600 dark:text-blue-400 font-mono">/api/collections/{collection.slug}/items</code>
 </p>
 </div>
 </div>
 );
}