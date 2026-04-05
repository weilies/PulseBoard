import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateFieldDialog } from "@/components/create-field-dialog";
import { FieldActions } from "@/components/field-actions";
import { Database, Box, GripVertical } from "lucide-react";
import Link from "next/link";
import { getFieldLabel, getCollectionName, getCollectionDescription } from "@/lib/i18n";
import { LANG_COOKIE } from "@/lib/constants";

const FIELD_TYPE_LABELS: Record<string, string> = {
 text: "Text", number: "Number", date: "Date", datetime: "Date & Time",
 boolean: "Toggle", file: "File", select: "Select", multiselect: "Multi-Select",
 richtext: "Rich Text", json: "JSON", relation: "Relation",
};

const FIELD_TYPE_COLORS: Record<string, string> = {
 text: "border-blue-500/40 text-blue-600 dark:text-blue-400",
 number: "border-orange-500/40 text-orange-400",
 date: "border-yellow-500/40 text-yellow-400",
 datetime: "border-yellow-500/40 text-yellow-400",
 boolean: "border-green-500/40 text-green-400",
 file: "border-pink-500/40 text-pink-400",
 select: "border-purple-500/40 text-purple-400",
 multiselect: "border-purple-500/40 text-purple-400",
 richtext: "border-blue-500/40 text-blue-600 dark:text-blue-400",
 json: "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400",
 relation: "border-blue-500/40 text-blue-600 dark:text-blue-400",
};

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
 metadata: Record<string, unknown> | null;
 collection_fields: Field[];
};

export default async function CollectionSchemaPage({
 params,
}: {
 params: Promise<{ slug: string }>;
}) {
 const { slug } = await params;

 const user = await getUser();
 if (!user) notFound();

 const supabase = await createClient();
 const tenantId = await resolveTenant(user.id);
 if (!tenantId) notFound();

 const { data: collection } = (await supabase
 .from("collections")
 .select("*, collection_fields(*)")
 .eq("slug", slug)
 .eq("is_hidden", false)
 .maybeSingle()) as { data: Collection | null };

 if (!collection) notFound();

 // Check model permission
 const { data: canManageSchema } = await supabase.rpc("has_permission", {
 p_resource_type: "collection",
 p_resource_id: collection.id,
 p_permission: "model",
 });

 const { data: allCollections } = await supabase
 .from("collections")
 .select("id, name, slug")
 .eq("is_hidden", false)
 .order("name");

 const fields = [...(collection.collection_fields ?? [])].sort((a, b) => a.sort_order - b.sort_order);

 const cookieStore = await cookies();
 const currentLocale = cookieStore.get(LANG_COOKIE)?.value ?? "en";

 const isSystem = collection.type === "system";
 const canEdit = !!canManageSchema;
 const Icon = isSystem ? Database : Box;

 return (
 <div className="space-y-6 p-6">
 {/* Collection header */}
 <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
 <div className="flex items-start gap-3">
 <div className="mt-0.5 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 p-2">
 <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
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
 <code className="text-xs text-gray-500 dark:text-gray-400">{collection.slug}</code>
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
 href={`/dashboard/c/${slug}`}
 className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 dark:text-blue-400 transition-colors"
 >
 Items
 </Link>
 <Link
 href={`/dashboard/c/${slug}/schema`}
 className="px-4 py-2 text-sm text-blue-600 dark:text-blue-400 border-b-2 border-blue-400 font-medium"
 >
 Schema
 </Link>
 </div>

 {/* Fields */}
 <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
 <CardHeader>
 <CardTitle className="text-gray-900 dark:text-gray-100">Fields</CardTitle>
 <CardDescription className="text-gray-500 dark:text-gray-400">
 {fields.length} field{fields.length !== 1 ? "s" : ""} defined.
 Each field maps to a key in the item&apos;s <code className="text-xs">data</code> JSONB.
 {!canEdit && <span className="ml-2 text-gray-500 dark:text-gray-400/60">(read-only)</span>}
 </CardDescription>
 </CardHeader>
 <CardContent className="p-0 sm:p-6">
 {fields.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-12 text-center">
 <p className="text-gray-500 dark:text-gray-400 text-sm">No fields yet.</p>
 {canEdit && (
 <p className="text-blue-500 dark:text-blue-400/40 text-xs mt-1">Add your first field to define this collection&apos;s schema.</p>
 )}
 </div>
 ) : (
 <div className="space-y-2">
 {fields.map((field, index) => (
 <div
 key={field.id}
 className="flex items-center gap-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-100 dark:bg-gray-800/40 px-4 py-3 hover:border-gray-300 dark:border-gray-600 transition-colors"
 >
 <GripVertical className="h-4 w-4 text-blue-500 dark:text-blue-400/20 flex-shrink-0" />
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{getFieldLabel(field, currentLocale)}</span>
 <code className="text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900 rounded px-1">{field.slug}</code>
 <Badge variant="outline" className={`text-xs ${FIELD_TYPE_COLORS[field.field_type] ?? "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400"}`}>
 {FIELD_TYPE_LABELS[field.field_type] ?? field.field_type}
 </Badge>
 {field.is_required && (
 <Badge variant="outline" className="text-xs border-red-500/40 text-red-400">Required</Badge>
 )}
 {field.is_unique && (
 <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-400">Unique</Badge>
 )}
 {field.field_type === "relation" && !!field.options?.relation_type && (
 <span className="text-xs text-blue-600 dark:text-blue-400/70">
 {String(field.options.relation_type).toUpperCase()} → {(allCollections ?? []).find((c) => c.id === field.options.related_collection_id)?.name ?? "unknown"}
 </span>
 )}
 </div>
 </div>

 {canEdit && (
 <FieldActions
 fieldId={field.id}
 fieldName={field.name}
 fieldType={field.field_type}
 fieldOptions={field.options ?? {}}
 fieldIsRequired={field.is_required}
 fieldIsUnique={field.is_unique}
 fieldIsTranslatable={field.is_translatable}
 sortOrder={field.sort_order}
 collectionId={collection.id}
 collectionSlug={collection.slug}
 isFirst={index === 0}
 isLast={index === fields.length - 1}
 allCollections={allCollections ?? []}
 showInGrid={field.show_in_grid}
 />
 )}
 </div>
 ))}
 </div>
 )}
 </CardContent>
 </Card>

 {/* API hint */}
 <div className="rounded-lg border border-gray-100 dark:border-gray-800 bg-blue-50 dark:bg-blue-950/5 p-4">
 <p className="text-xs text-gray-500 dark:text-gray-400">
 <span className="text-gray-900 dark:text-gray-100 font-medium">API endpoint:</span>{""}
 <code className="text-blue-600 dark:text-blue-400">/api/collections/{collection.slug}/items</code>
 </p>
 </div>
 </div>
 );
}