"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
 Dialog,
 DialogClose,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
 DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { Plus, Paperclip, X, Loader2, Globe, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { createItem, updateItem } from "@/app/actions/studio";
import { getItemTranslations, upsertItemTranslations } from "@/app/actions/translations";
import { uploadCollectionFile, getSignedFileUrl } from "@/app/actions/storage";
import { fetchRelationItems, type RelationItem } from "@/app/actions/relations";
import type { TenantLanguage, LocaleTranslations } from "@/types/translations";
import type { FormLayout, FormElement, FormElementField, FormElementTabGroup, FieldWidget } from "@/types/form-layout";
import { filterCatalogItems, formatItemDisplay } from "@/lib/catalog-filtering";
import type { CatalogItem, CatalogFieldOptions } from "@/types/catalog";
import { getFieldLabel } from "@/lib/i18n";
import { datetimeLocalToISO, isoToDatetimeLocal } from "@/lib/timezone-constants";

export type Field = {
 id: string;
 slug: string;
 name: string;
 field_type: string;
 options: Record<string, unknown>;
 is_required: boolean;
 is_translatable: boolean;
 show_in_grid?: boolean;
 sort_order: number;
};

export type CatalogItems = Record<string, (CatalogItem | { value: string; label: string })[]>;
type ItemData = Record<string, unknown>;

// ---------------------------------------------------------------------------
// FileField — upload to Supabase Storage, display preview / filename
// ---------------------------------------------------------------------------

function FileField({
 fieldSlug,
 collectionSlug,
 allowedExtensions,
 value,
 onChange,
}: {
 fieldSlug: string;
 collectionSlug: string;
 allowedExtensions: string[];
 value: string;
 onChange: (path: string) => void;
}) {
 const inputRef = useRef<HTMLInputElement>(null);
 const [uploading, setUploading] = useState(false);
 const [previewUrl, setPreviewUrl] = useState<string | null>(null);
 const [filename, setFilename] = useState<string>("");

 useEffect(() => {
 if (!value) { setPreviewUrl(null); setFilename(""); return; }
 const parts = value.split("/");
 setFilename(parts[parts.length - 1]);
 getSignedFileUrl(value).then(({ url }) => {
 if (url) setPreviewUrl(url);
 });
 }, [value]);

 async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
 const file = e.target.files?.[0];
 if (!file) return;

 // Client-side extension validation
 if (allowedExtensions.length > 0) {
 const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
 if (!allowedExtensions.includes(ext)) {
 toast.error(`File type .${ext} is not allowed. Accepted: ${allowedExtensions.map((e) => `.${e}`).join(", ")}`);
 return;
 }
 }

 setUploading(true);
 const fd = new FormData();
 fd.set("file", file);
 fd.set("collection_slug", collectionSlug);
 fd.set("field_slug", fieldSlug);
 const result = await uploadCollectionFile(fd);
 setUploading(false);
 if (result.error) { toast.error(result.error); return; }
 onChange(result.path!);
 toast.success("File uploaded");
 }

 // Build accept attribute from allowed extensions (e.g. [".png", ".jpg"])
 const acceptAttr = allowedExtensions.length > 0
 ? allowedExtensions.map((e) => `.${e}`).join(",")
 : undefined;

 const isImage = previewUrl && /\.(png|jpe?g|gif|webp|svg)$/i.test(filename);

 return (
 <div className="space-y-2">
 {value && (
 <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 px-3 py-2">
 {isImage ? (
 // eslint-disable-next-line @next/next/no-img-element
 <img src={previewUrl!} alt={filename} className="h-12 w-12 rounded object-cover shrink-0" />
 ) : (
 <Paperclip className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
 )}
 <span className="text-xs text-gray-500 dark:text-gray-400 truncate flex-1">{filename}</span>
 <button
 type="button"
 onClick={() => { onChange(""); setPreviewUrl(null); setFilename(""); }}
 className="text-gray-500 dark:text-gray-400 hover:text-red-400 transition-colors"
 >
 <X className="h-3.5 w-3.5" />
 </button>
 </div>
 )}
 <div className="flex items-center gap-2">
 <Button
 type="button"
 variant="outline"
 size="sm"
 disabled={uploading}
 onClick={() => inputRef.current?.click()}
 className="border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-blue-400 dark:text-blue-400 gap-2"
 >
 {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
 {uploading ? "Uploading..." : value ? "Replace file" : "Choose file"}
 </Button>
 <span className="text-xs text-gray-500 dark:text-gray-400">
 Max 10 MB{allowedExtensions.length > 0 ? ` · ${allowedExtensions.map((e) => `.${e}`).join(", ")}` : ""}
 </span>
 </div>
 <input
 ref={inputRef}
 type="file"
 accept={acceptAttr}
 onChange={handleFile}
 className="hidden"
 />
 </div>
 );
}

// ---------------------------------------------------------------------------
// RelationField — M2O / O2O single picker | M2M multi-picker
// ---------------------------------------------------------------------------

function RelationField({
 relatedCollectionId,
 relationType,
 value,
 onChange,
}: {
 relatedCollectionId: string;
 relationType: string;
 junctionCollectionId?: string;
 value: unknown;
 onChange: (v: unknown) => void;
}) {
 const [items, setItems] = useState<RelationItem[]>([]);
 const [loading, setLoading] = useState(true);
 const [search, setSearch] = useState("");

 useEffect(() => {
 if (!relatedCollectionId) { setLoading(false); return; }
 fetchRelationItems(relatedCollectionId).then(({ data, error }) => {
 if (error) toast.error(`Relation: ${error}`);
 setItems(data ?? []);
 setLoading(false);
 });
 }, [relatedCollectionId]);

 const filtered = items.filter((i) =>
 i.label.toLowerCase().includes(search.toLowerCase()) ||
 i.id.startsWith(search)
 );

 if (!relatedCollectionId) {
 return <p className="text-xs text-gray-500 dark:text-gray-400 italic">No related collection configured.</p>;
 }

 if (loading) {
 return <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Loading items…</p>;
 }

 if (items.length === 0) {
 return <p className="text-xs text-gray-500 dark:text-gray-400 italic">No items in the related collection yet.</p>;
 }

 const isMulti = relationType === "m2m";
 const selectedIds: string[] = isMulti
 ? (Array.isArray(value) ? (value as string[]) : [])
 : [];

 if (isMulti) {
 return (
 <div className="space-y-2">
 <Input
 placeholder="Search…"
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 className="h-8 text-xs bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500/50 dark:placeholder:text-gray-400/50"
 />
 <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2 space-y-1">
 {filtered.map((item) => (
 <label key={item.id} className="flex items-center gap-2 cursor-pointer px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
 <input
 type="checkbox"
 checked={selectedIds.includes(item.id)}
 onChange={(e) => {
 if (e.target.checked) onChange([...selectedIds, item.id]);
 else onChange(selectedIds.filter((id) => id !== item.id));
 }}
 className="accent-blue-400"
 />
 <span className="text-xs text-gray-900 dark:text-gray-100 truncate">{item.label}</span>
 </label>
 ))}
 {filtered.length === 0 && <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">No matches</p>}
 </div>
 {selectedIds.length > 0 && (
 <p className="text-xs text-blue-600 dark:text-blue-400/70">{selectedIds.length} selected</p>
 )}
 </div>
 );
 }

 const selectedLabel = value
  ? (items.find((i) => i.id === (value as string))?.label ?? String(value).slice(0, 8))
  : null;

 return (
 <Select
 value={(value as string) ?? ""}
 onValueChange={(v) => onChange(v || null)}
 >
 <SelectTrigger className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
 <span className={selectedLabel ? "text-gray-900 dark:text-gray-100" : "text-gray-400/60 dark:text-gray-500/50"}>
 {selectedLabel ?? "Select an item…"}
 </span>
 </SelectTrigger>
 <SelectContent className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 max-h-60">
 {items.map((item) => (
 <SelectItem key={item.id} value={item.id} className="text-xs">
 {item.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 );
}

// ---------------------------------------------------------------------------
// LayoutFormFields — renders fields using a form_layout config (tabs + grid)
// ---------------------------------------------------------------------------

function LayoutFormFields({
 formLayout,
 fields,
 values,
 onChange,
 catalogItems,
 collectionSlug,
 currentLocale,
}: {
 formLayout: FormLayout;
 fields: Field[];
 values: ItemData;
 onChange: (slug: string, value: unknown) => void;
 catalogItems: CatalogItems;
 collectionSlug: string;
 currentLocale: string;
}) {
 const [activeTabId, setActiveTabId] = useState(formLayout.tabs[0]?.id ?? "");
 const activeTab = formLayout.tabs.find((t) => t.id === activeTabId) ?? formLayout.tabs[0];

 function collectPlacedSlugs(elements: FormElement[]): string[] {
  return elements.flatMap((el) => {
   if (el.type === "field") return [el.fieldSlug];
   if (el.type === "tab-group") return el.tabs.flatMap((t) => collectPlacedSlugs(t.elements));
   return [];
  });
 }

 const placedSlugs = new Set(
  formLayout.tabs.flatMap((t) => collectPlacedSlugs(t.elements))
 );
 const fieldMap = new Map(fields.map((f) => [f.slug, f]));
 const unplacedFields = fields.filter((f) => !placedSlugs.has(f.slug));

 return (
  <div className="space-y-4">
   {/* Tab bar — only shown when more than one tab */}
   {formLayout.tabs.length > 1 && (
    <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700">
     {formLayout.tabs.map((tab) => (
      <button
       key={tab.id}
       type="button"
       onClick={() => setActiveTabId(tab.id)}
       className={`px-3 py-1.5 text-xs font-medium transition-colors -mb-px ${
        tab.id === activeTabId
         ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-400"
         : "text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
       }`}
      >
       {tab.label}
      </button>
     ))}
    </div>
   )}

   {/* Current tab elements as 2-col grid */}
   {activeTab && (
    <div className="grid grid-cols-2 gap-x-4 gap-y-4">
     {activeTab.elements.map((el, idx) => {
      if (el.type === "field") {
       const field = fieldMap.get(el.fieldSlug);
       if (!field) return null;
       const value = values[field.slug];
       const opts = field.options ?? {};
       return (
        <div
         key={idx}
         className={`space-y-2 ${el.width === "full" ? "col-span-2" : "col-span-1"}`}
        >
         <Label className="text-gray-900 dark:text-gray-100">
          {getFieldLabel(field, currentLocale)}
          {field.is_required && <span className="text-red-400 ml-1">*</span>}
          {field.is_translatable && (
           <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-violet-400/70">
            <Globe className="h-3 w-3" />
           </span>
          )}
         </Label>
         <FieldInputControl
          field={field}
          value={value}
          opts={opts}
          onChange={onChange}
          collectionSlug={collectionSlug}
          catalogItems={catalogItems}
          widget={el.widget}
          parentRecord={values}
         />
        </div>
       );
      }

      if (el.type === "note") {
       return (
        <div
         key={idx}
         className="col-span-2 rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2.5"
        >
         <p className="text-xs text-blue-300 dark:text-blue-400 whitespace-pre-wrap leading-relaxed">
          {el.text}
         </p>
        </div>
       );
      }

      if (el.type === "button") {
       return (
        <div key={idx} className="col-span-2">
         {el.url ? (
          <a
           href={el.url}
           target="_blank"
           rel="noopener noreferrer"
           className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-500/40 transition-colors"
          >
           <ExternalLink className="h-3 w-3" />
           {el.label || "Open Link"}
          </a>
         ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500 italic">{el.label || "Button (no URL)"}</span>
         )}
        </div>
       );
      }

      if (el.type === "divider") {
       return <hr key={idx} className="col-span-2 border-gray-200 dark:border-gray-700" />;
      }

      if (el.type === "tab-group") {
       return (
        <div key={idx} className="col-span-2">
         <NestedTabGroup
          tabGroup={el}
          fields={fields}
          values={values}
          onChange={onChange}
          catalogItems={catalogItems}
          collectionSlug={collectionSlug}
          currentLocale={currentLocale}
          fieldMap={fieldMap}
         />
        </div>
       );
      }

      return null;
     })}
    </div>
   )}

   {/* Unplaced fields fallback */}
   {unplacedFields.length > 0 && (
    <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4">
     <p className="text-xs text-gray-400 dark:text-gray-500 italic">Other fields</p>
     {unplacedFields.map((field) => {
      const value = values[field.slug];
      const opts = field.options ?? {};
      return (
       <div key={field.id} className="space-y-2">
        <Label className="text-gray-900 dark:text-gray-100">
         {getFieldLabel(field, currentLocale)}
         {field.is_required && <span className="text-red-400 ml-1">*</span>}
        </Label>
        <FieldInputControl
         field={field}
         value={value}
         opts={opts}
         onChange={onChange}
         collectionSlug={collectionSlug}
         catalogItems={catalogItems}
         parentRecord={values}
        />
       </div>
      );
     })}
    </div>
   )}
  </div>
 );
}

// ---------------------------------------------------------------------------
// NestedTabGroup — renders a tab-group element inside LayoutFormFields
// ---------------------------------------------------------------------------

function NestedTabGroup({
 tabGroup,
 fields,
 values,
 onChange,
 catalogItems,
 collectionSlug,
 currentLocale,
 fieldMap,
}: {
 tabGroup: FormElementTabGroup;
 fields: Field[];
 values: ItemData;
 onChange: (slug: string, value: unknown) => void;
 catalogItems: CatalogItems;
 collectionSlug: string;
 currentLocale: string;
 fieldMap: Map<string, Field>;
}) {
 const [activeTabId, setActiveTabId] = useState(tabGroup.tabs[0]?.id ?? "");
 const activeTab = tabGroup.tabs.find((t) => t.id === activeTabId) ?? tabGroup.tabs[0];

 return (
  <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 space-y-3">
   {/* Nested tab bar */}
   <div className="flex gap-0 border-b border-purple-500/20">
    {tabGroup.tabs.map((tab) => (
     <button
      key={tab.id}
      type="button"
      onClick={() => setActiveTabId(tab.id)}
      className={`px-3 py-1.5 text-xs font-medium transition-colors -mb-px ${
       tab.id === activeTabId
        ? "text-purple-400 border-b-2 border-purple-400"
        : "text-gray-500 dark:text-gray-400 hover:text-purple-400"
      }`}
     >
      {tab.label}
     </button>
    ))}
   </div>

   {/* Nested elements grid */}
   {activeTab && (
    <div className="grid grid-cols-2 gap-x-4 gap-y-4">
     {activeTab.elements.map((el, idx) => {
      if (el.type === "field") {
       const field = fieldMap.get(el.fieldSlug);
       if (!field) return null;
       const value = values[field.slug];
       const opts = field.options ?? {};
       return (
        <div key={idx} className={`space-y-2 ${el.width === "full" ? "col-span-2" : "col-span-1"}`}>
         <Label className="text-gray-900 dark:text-gray-100">
          {getFieldLabel(field, currentLocale)}
          {field.is_required && <span className="text-red-400 ml-1">*</span>}
          {field.is_translatable && (
           <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-violet-400/70">
            <Globe className="h-3 w-3" />
           </span>
          )}
         </Label>
         <FieldInputControl
          field={field}
          value={value}
          opts={opts}
          onChange={onChange}
          collectionSlug={collectionSlug}
          catalogItems={catalogItems}
          widget={el.widget}
          parentRecord={values}
         />
        </div>
       );
      }
      if (el.type === "note") {
       return (
        <div key={idx} className="col-span-2 rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2.5">
         <p className="text-xs text-blue-300 dark:text-blue-400 whitespace-pre-wrap leading-relaxed">{el.text}</p>
        </div>
       );
      }
      if (el.type === "divider") {
       return <hr key={idx} className="col-span-2 border-gray-200 dark:border-gray-700" />;
      }
      return null;
     })}
    </div>
   )}
  </div>
 );
}

// ---------------------------------------------------------------------------
// FieldInputControl — renders just the input widget for a given field type
// ---------------------------------------------------------------------------

function FieldInputControl({
 field,
 value,
 opts,
 onChange,
 collectionSlug,
 catalogItems,
 widget,
 parentRecord,
}: {
 field: Field;
 value: unknown;
 opts: Record<string, unknown>;
 onChange: (slug: string, value: unknown) => void;
 collectionSlug: string;
 catalogItems: CatalogItems;
 widget?: FieldWidget;
 parentRecord?: ItemData;
}) {
 // Resolve effective widget for text/richtext fields
 const effectiveWidget = widget ?? "auto";
 const useTextarea =
  (field.field_type === "text" && (effectiveWidget === "textarea" || effectiveWidget === "wysiwyg")) ||
  (field.field_type === "richtext" && effectiveWidget === "input");

 return (
  <>
   {field.field_type === "text" && !useTextarea && (
    <Input
     value={(value as string) ?? ""}
     onChange={(e) => onChange(field.slug, e.target.value)}
     maxLength={opts.max_length as number | undefined}
     required={field.is_required}
     className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500/50 dark:placeholder:text-gray-400/50"
    />
   )}
   {field.field_type === "text" && useTextarea && (
    <textarea
     value={(value as string) ?? ""}
     onChange={(e) => onChange(field.slug, e.target.value)}
     rows={4}
     required={field.is_required}
     className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-500/50 dark:placeholder:text-gray-400/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-y"
    />
   )}
   {field.field_type === "number" && (
    <Input
     type="number"
     value={(value as string) ?? ""}
     onChange={(e) => onChange(field.slug, e.target.value !== "" ? Number(e.target.value) : "")}
     min={opts.min as number | undefined}
     max={opts.max as number | undefined}
     step={opts.decimals ? Math.pow(10, -(opts.decimals as number)) : 1}
     required={field.is_required}
     className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
    />
   )}
   {field.field_type === "date" && (
    <Input
     type="date"
     value={(value as string) ?? ""}
     onChange={(e) => onChange(field.slug, e.target.value)}
     required={field.is_required}
     className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
    />
   )}
   {field.field_type === "datetime" && (
    <Input
     type="datetime-local"
     value={(value as string) ?? ""}
     onChange={(e) => onChange(field.slug, e.target.value)}
     required={field.is_required}
     className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
    />
   )}
   {field.field_type === "boolean" && (
    <label className="flex items-center gap-2 cursor-pointer">
     <input
      type="checkbox"
      checked={(value as boolean) ?? false}
      onChange={(e) => onChange(field.slug, e.target.checked)}
      className="rounded accent-blue-400"
     />
     <span className="text-sm text-gray-900 dark:text-gray-100">Enabled</span>
    </label>
   )}
   {field.field_type === "select" && (() => {
    const listSlug = opts.catalog_slug as string | undefined;
    const fieldOpts = opts as unknown as CatalogFieldOptions | undefined;
    let choices: (CatalogItem | { value: string; label: string })[] = listSlug
     ? (catalogItems[listSlug] ?? [])
     : ((opts.choices as string[]) ?? []).map((c) => ({ value: c, label: c }));

    // Apply filter conditions if present
    if (listSlug && fieldOpts?.filter_conditions && fieldOpts.filter_conditions.length > 0 && parentRecord) {
     choices = filterCatalogItems(
      choices as CatalogItem[],
      parentRecord,
      fieldOpts.filter_conditions
     );
    }

    // Determine which columns to display
    const displayColumns = fieldOpts?.display_columns || ["label"];

    return (
     <Select value={(value as string) ?? ""} onValueChange={(v) => onChange(field.slug, v ?? "")}>
      <SelectTrigger className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
       <SelectValue placeholder="Select..." />
      </SelectTrigger>
      <SelectContent className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
       {choices.length === 0 ? (
        <div className="px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400">No matching options</div>
       ) : (
        choices.map((c) => {
         const isCatalogItem = 'id' in c && 'catalog_id' in c;
         const displayText = isCatalogItem ? formatItemDisplay(c as CatalogItem, displayColumns) : (c as { value: string; label: string }).label;
         return <SelectItem key={c.value} value={c.value}>{displayText}</SelectItem>;
        })
       )}
      </SelectContent>
     </Select>
    );
   })()}
   {field.field_type === "multiselect" && (() => {
    const listSlug = opts.catalog_slug as string | undefined;
    const fieldOpts = opts as unknown as CatalogFieldOptions | undefined;
    let choices: (CatalogItem | { value: string; label: string })[] = listSlug
     ? (catalogItems[listSlug] ?? [])
     : ((opts.choices as string[]) ?? []).map((c) => ({ value: c, label: c }));

    // Apply filter conditions if present
    if (listSlug && fieldOpts?.filter_conditions && fieldOpts.filter_conditions.length > 0 && parentRecord) {
     choices = filterCatalogItems(
      choices as CatalogItem[],
      parentRecord,
      fieldOpts.filter_conditions
     );
    }

    // Determine which columns to display
    const displayColumns = fieldOpts?.display_columns || ["label"];

    const selected = (value as string[]) ?? [];
    return (
     <div className="flex flex-wrap gap-3 rounded-lg border border-zinc-700/50 bg-zinc-800/20 p-3">
      {choices.length === 0 && <p className="text-xs text-zinc-500">No matching options</p>}
      {choices.map((c) => {
       const isCatalogItem = 'id' in c && 'catalog_id' in c;
       const displayText = isCatalogItem ? formatItemDisplay(c as CatalogItem, displayColumns) : (c as { value: string; label: string }).label;
       return (
        <label key={c.value} className="flex items-center gap-1.5 cursor-pointer">
         <input
          type="checkbox"
          checked={selected.includes(c.value)}
          onChange={(e) => {
           if (e.target.checked) onChange(field.slug, [...selected, c.value]);
           else onChange(field.slug, selected.filter((v) => v !== c.value));
          }}
          className="accent-blue-400"
         />
         <span className="text-sm text-gray-900 dark:text-gray-100">{displayText}</span>
        </label>
       );
      })}
     </div>
    );
   })()}
   {field.field_type === "richtext" && useTextarea && (
    <Input
     value={(value as string) ?? ""}
     onChange={(e) => onChange(field.slug, e.target.value)}
     required={field.is_required}
     className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500/50 dark:placeholder:text-gray-400/50"
    />
   )}
   {(field.field_type === "richtext" && !useTextarea) || field.field_type === "json" ? (
    <textarea
     value={(value as string) ?? ""}
     onChange={(e) => onChange(field.slug, e.target.value)}
     rows={4}
     required={field.is_required}
     placeholder={field.field_type === "json" ? '{"key": "value"}' : ""}
     className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-500/50 dark:placeholder:text-gray-400/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-y"
    />
   ) : null}
   {field.field_type === "file" && (
    <FileField
     fieldSlug={field.slug}
     collectionSlug={collectionSlug}
     allowedExtensions={(opts.allowed_extensions as string[] | undefined) ?? []}
     value={(value as string) ?? ""}
     onChange={(v) => onChange(field.slug, v)}
    />
   )}
   {field.field_type === "relation" && (
    <RelationField
     relatedCollectionId={(opts.related_collection_id as string) ?? ""}
     relationType={(opts.relation_type as string) ?? "m2o"}
     junctionCollectionId={(opts.junction_collection_id as string | undefined)}
     value={value}
     onChange={(v) => onChange(field.slug, v)}
    />
   )}
  </>
 );
}

// ---------------------------------------------------------------------------
// Shared form field renderer
// ---------------------------------------------------------------------------

export function ItemFormFields({
 fields,
 values,
 onChange,
 catalogItems,
 collectionSlug,
 currentLocale = "en",
 formLayout,
}: {
 fields: Field[];
 values: ItemData;
 onChange: (slug: string, value: unknown) => void;
 catalogItems: CatalogItems;
 collectionSlug: string;
 currentLocale?: string;
 formLayout?: FormLayout | null;
}) {
 if (fields.length === 0) {
 return (
 <p className="text-sm text-zinc-500 text-center py-4">
 No fields defined. Add fields in the Schema tab first.
 </p>
 );
 }

 if (formLayout?.tabs?.length) {
 return (
 <LayoutFormFields
  formLayout={formLayout}
  fields={fields}
  values={values}
  onChange={onChange}
  catalogItems={catalogItems}
  collectionSlug={collectionSlug}
  currentLocale={currentLocale}
 />
 );
 }

 return (
 <div className="space-y-4">
 {fields.map((field) => {
 const value = values[field.slug];
 const opts = field.options ?? {};

 return (
 <div key={field.id} className="space-y-2">
 <Label className="text-gray-900 dark:text-gray-100">
 {getFieldLabel(field, currentLocale)}
 {field.is_required && <span className="text-red-400 ml-1">*</span>}
 {field.is_translatable && (
 <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-violet-400/70">
 <Globe className="h-3 w-3" />
 </span>
 )}
 </Label>

 {field.field_type === "text" && (
 <Input
 value={(value as string) ?? ""}
 onChange={(e) => onChange(field.slug, e.target.value)}
 maxLength={opts.max_length as number | undefined}
 required={field.is_required}
 className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500/50 dark:placeholder:text-gray-400/50"
 />
 )}

 {field.field_type === "number" && (
 <Input
 type="number"
 value={(value as string) ?? ""}
 onChange={(e) =>
 onChange(field.slug, e.target.value !== "" ? Number(e.target.value) : "")
 }
 min={opts.min as number | undefined}
 max={opts.max as number | undefined}
 step={
 opts.decimals
 ? Math.pow(10, -(opts.decimals as number))
 : 1
 }
 required={field.is_required}
 className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
 />
 )}

 {field.field_type === "date" && (
 <Input
 type="date"
 value={(value as string) ?? ""}
 onChange={(e) => onChange(field.slug, e.target.value)}
 required={field.is_required}
 className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
 />
 )}

 {field.field_type === "datetime" && (
 <Input
 type="datetime-local"
 value={(value as string) ?? ""}
 onChange={(e) => onChange(field.slug, e.target.value)}
 required={field.is_required}
 className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
 />
 )}

 {field.field_type === "boolean" && (
 <label className="flex items-center gap-2 cursor-pointer">
 <input
 type="checkbox"
 checked={(value as boolean) ?? false}
 onChange={(e) => onChange(field.slug, e.target.checked)}
 className="rounded accent-blue-400"
 />
 <span className="text-sm text-gray-900 dark:text-gray-100">Enabled</span>
 </label>
 )}

 {field.field_type === "select" && (() => {
 const listSlug = opts.catalog_slug as string | undefined;
 const fieldOpts = opts as unknown as CatalogFieldOptions | undefined;
 let choices: (CatalogItem | { value: string; label: string })[] = listSlug
 ? (catalogItems[listSlug] ?? [])
 : ((opts.choices as string[]) ?? []).map((c) => ({ value: c, label: c }));

 // Apply filter conditions if present
 if (listSlug && fieldOpts?.filter_conditions && fieldOpts.filter_conditions.length > 0) {
  choices = filterCatalogItems(
   choices as CatalogItem[],
   values,
   fieldOpts.filter_conditions
  );
 }

 // Determine which columns to display
 const displayColumns = fieldOpts?.display_columns || ["label"];

 return (
 <Select
 value={(value as string) ?? ""}
 onValueChange={(v) => onChange(field.slug, v ?? "")}
 >
 <SelectTrigger className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
 <SelectValue placeholder="Select..." />
 </SelectTrigger>
 <SelectContent className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
 {choices.length === 0 ? (
  <div className="px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400">No matching options</div>
 ) : (
  choices.map((c) => {
   const isCatalogItem = 'id' in c && 'catalog_id' in c;
   const displayText = isCatalogItem ? formatItemDisplay(c as CatalogItem, displayColumns) : (c as { value: string; label: string }).label;
   return <SelectItem key={c.value} value={c.value}>{displayText}</SelectItem>;
  })
 )}
 </SelectContent>
 </Select>
 );
 })()}

 {field.field_type === "multiselect" && (() => {
 const listSlug = opts.catalog_slug as string | undefined;
 const fieldOpts = opts as unknown as CatalogFieldOptions | undefined;
 let choices: (CatalogItem | { value: string; label: string })[] = listSlug
 ? (catalogItems[listSlug] ?? [])
 : ((opts.choices as string[]) ?? []).map((c) => ({ value: c, label: c }));

 // Apply filter conditions if present
 if (listSlug && fieldOpts?.filter_conditions && fieldOpts.filter_conditions.length > 0) {
  choices = filterCatalogItems(
   choices as CatalogItem[],
   values,
   fieldOpts.filter_conditions
  );
 }

 // Determine which columns to display
 const displayColumns = fieldOpts?.display_columns || ["label"];

 const selected = (value as string[]) ?? [];
 return (
 <div className="flex flex-wrap gap-3 rounded-lg border border-zinc-700/50 bg-zinc-800/20 p-3">
 {choices.length === 0 && (
  <p className="text-xs text-zinc-500">No matching options</p>
 )}
 {choices.map((c) => {
  const isCatalogItem = 'id' in c && 'catalog_id' in c;
  const displayText = isCatalogItem ? formatItemDisplay(c as CatalogItem, displayColumns) : (c as { value: string; label: string }).label;
  return (
   <label key={c.value} className="flex items-center gap-1.5 cursor-pointer">
    <input
     type="checkbox"
     checked={selected.includes(c.value)}
     onChange={(e) => {
      if (e.target.checked) {
       onChange(field.slug, [...selected, c.value]);
      } else {
       onChange(field.slug, selected.filter((v) => v !== c.value));
      }
     }}
     className="accent-blue-400"
    />
    <span className="text-sm text-gray-900 dark:text-gray-100">{displayText}</span>
   </label>
  );
 })}
 </div>
 );
 })()}

 {(field.field_type === "richtext" || field.field_type === "json") && (
 <textarea
 value={(value as string) ?? ""}
 onChange={(e) => onChange(field.slug, e.target.value)}
 rows={4}
 required={field.is_required}
 placeholder={field.field_type === "json" ? '{"key": "value"}' : ""}
 className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-500/50 dark:placeholder:text-gray-400/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-y"
 />
 )}

 {field.field_type === "file" && (
 <FileField
 fieldSlug={field.slug}
 collectionSlug={collectionSlug}
 allowedExtensions={(opts.allowed_extensions as string[] | undefined) ?? []}
 value={(value as string) ?? ""}
 onChange={(v) => onChange(field.slug, v)}
 />
 )}

 {field.field_type === "relation" && (
 <RelationField
 relatedCollectionId={(opts.related_collection_id as string) ?? ""}
 relationType={(opts.relation_type as string) ?? "m2o"}
 junctionCollectionId={(opts.junction_collection_id as string | undefined)}
 value={value}
 onChange={(v) => onChange(field.slug, v)}
 />
 )}
 </div>
 );
 })}
 </div>
 );
}

// ---------------------------------------------------------------------------
// CreateItemDialog — self-contained with trigger button
// ---------------------------------------------------------------------------

interface CreateItemDialogProps {
 fields: Field[];
 collectionId: string;
 collectionSlug: string;
 catalogItems: CatalogItems;
 timezone?: string;
 formLayout?: FormLayout | null;
}

export function CreateItemDialog({
 fields,
 collectionId,
 collectionSlug,
 catalogItems,
 timezone = "Asia/Singapore",
 formLayout,
}: CreateItemDialogProps) {
 const router = useRouter();
 const [open, setOpen] = useState(false);
 const [loading, setLoading] = useState(false);
 const [formValues, setFormValues] = useState<ItemData>({});

 function handleChange(slug: string, value: unknown) {
 setFormValues((prev) => ({ ...prev, [slug]: value }));
 }

 async function handleSubmit(e: React.FormEvent) {
 e.preventDefault();
 setLoading(true);

 // Normalize datetime fields to UTC ISO before saving
 const normalizedData = { ...formValues };
 for (const field of fields) {
 if (field.field_type === "datetime" && normalizedData[field.slug]) {
 normalizedData[field.slug] = datetimeLocalToISO(normalizedData[field.slug] as string, timezone);
 }
 }

 const fd = new FormData();
 fd.set("collection_id", collectionId);
 fd.set("collection_slug", collectionSlug);
 fd.set("data", JSON.stringify(normalizedData));

 const result = await createItem(fd);
 setLoading(false);

 if (result.error) {
 toast.error(result.error);
 return;
 }

 toast.success("Item created");
 setOpen(false);
 setFormValues({});
 router.refresh();
 }

 return (
 <Dialog open={open} onOpenChange={setOpen}>
 <DialogTrigger
 render={
 <Button
 size="sm"
 className="gap-2 bg-blue-50 dark:bg-blue-950 border border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/30 hover:text-[#a8c4ff]"
 />
 }
 >
 <Plus className="h-4 w-4" />
 Add Item
 </DialogTrigger>

 <DialogContent className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 shadow-[0_0_40px_rgba(0,240,255,0.15)] sm:max-w-lg">
 <form onSubmit={handleSubmit}>
 <DialogHeader>
 <DialogTitle
 className="text-blue-600 dark:text-blue-400"
 style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
 >
 Add Item
 </DialogTitle>
 <DialogDescription className="text-gray-500 dark:text-gray-400">
 Fill in the fields to create a new record.
 </DialogDescription>
 </DialogHeader>

 <div className="mt-4 max-h-[60vh] overflow-y-auto pr-1">
 <ItemFormFields
 fields={fields}
 values={formValues}
 onChange={handleChange}
 catalogItems={catalogItems}
 collectionSlug={collectionSlug}
 formLayout={formLayout}
 />
 </div>

 <DialogFooter className="mt-6">
 <DialogClose
 render={
 <Button
 type="button"
 variant="outline"
 className="border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-blue-400 dark:text-blue-400"
 onClick={() => setFormValues({})}
 />
 }
 >
 Cancel
 </DialogClose>
 <Button
 type="submit"
 disabled={loading}
 className="bg-blue-50 dark:bg-blue-950 border border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/30 hover:text-[#a8c4ff]"
 >
 {loading ? "Creating..." : "Create Item"}
 </Button>
 </DialogFooter>
 </form>
 </DialogContent>
 </Dialog>
 );
}

// ---------------------------------------------------------------------------
// EditItemDialog — uses global locale from header language switcher
// ---------------------------------------------------------------------------

interface EditItemDialogProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 item: { id: string; data: ItemData };
 fields: Field[];
 collectionId: string;
 collectionSlug: string;
 catalogItems: CatalogItems;
 tenantLanguages: TenantLanguage[];
 currentLocale?: string;
 timezone?: string;
 onDeleteRequest?: () => void;
 formLayout?: FormLayout | null;
}

export function EditItemDialog({
 open,
 onOpenChange,
 item,
 fields,
 collectionId,
 collectionSlug,
 catalogItems,
 tenantLanguages,
 currentLocale = "en",
 timezone = "Asia/Singapore",
 onDeleteRequest,
 formLayout,
}: EditItemDialogProps) {
 const router = useRouter();
 const [loading, setLoading] = useState(false);
 const [formValues, setFormValues] = useState<ItemData>({});
 const [translations, setTranslations] = useState<LocaleTranslations>({});
 const [translationsLoading, setTranslationsLoading] = useState(false);

 const isDefaultLocale = currentLocale === "en";
 const hasTranslatableFields = fields.some((f) => f.is_translatable);
 const isTranslating = !isDefaultLocale && hasTranslatableFields;
 const currentLangName = tenantLanguages.find((l) => l.language_code === currentLocale)?.language_name ?? currentLocale;

 // Sync form values and load translations when dialog opens
 useEffect(() => {
 if (!open) return;
 const initData = { ...(item.data ?? {}) };
 // Convert stored UTC ISO datetime values → datetime-local format for the input
 for (const field of fields) {
 if (field.field_type === "datetime" && initData[field.slug]) {
 initData[field.slug] = isoToDatetimeLocal(initData[field.slug] as string, timezone);
 }
 }
 setFormValues(initData);

 if (isTranslating) {
 setTranslationsLoading(true);
 getItemTranslations(item.id).then(({ data }) => {
 setTranslations(data ?? {});
 setTranslationsLoading(false);
 });
 }
 }, [open, item.id, item.data, isTranslating, fields, timezone]);

 // Build form values: for translatable fields in non-EN locale, overlay translations
 const displayValues: ItemData = { ...formValues };
 if (isTranslating) {
 const localeTranslations = translations[currentLocale] ?? {};
 for (const field of fields) {
 if (field.is_translatable && localeTranslations[field.slug]) {
 displayValues[field.slug] = localeTranslations[field.slug];
 }
 }
 }

 function handleChange(slug: string, value: unknown) {
 const field = fields.find((f) => f.slug === slug);
 if (isTranslating && field?.is_translatable) {
 // Save to translations
 setTranslations((prev) => ({
 ...prev,
 [currentLocale]: { ...(prev[currentLocale] ?? {}), [slug]: String(value ?? "") },
 }));
 } else {
 // Save to canonical data
 setFormValues((prev) => ({ ...prev, [slug]: value }));
 }
 }

 async function handleSubmit(e: React.FormEvent) {
 e.preventDefault();
 setLoading(true);

 // 1. Save canonical data (always — non-translatable fields may have changed)
 // Normalize datetime fields back to UTC ISO before saving
 const normalizedData = { ...formValues };
 for (const field of fields) {
 if (field.field_type === "datetime" && normalizedData[field.slug]) {
 normalizedData[field.slug] = datetimeLocalToISO(normalizedData[field.slug] as string, timezone);
 }
 }

 const fd = new FormData();
 fd.set("item_id", item.id);
 fd.set("collection_slug", collectionSlug);
 fd.set("data", JSON.stringify(normalizedData));

 const result = await updateItem(fd);
 if (result.error) {
 setLoading(false);
 toast.error(result.error);
 return;
 }

 // 2. Save translations for current locale
 if (isTranslating && Object.keys(translations).length > 0) {
 const tResult = await upsertItemTranslations(item.id, collectionId, translations);
 if (tResult.error) {
 setLoading(false);
 toast.error(`Translations: ${tResult.error}`);
 return;
 }
 }

 setLoading(false);
 toast.success("Item updated");
 onOpenChange(false);
 router.refresh();
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 shadow-[0_0_40px_rgba(0,240,255,0.15)] sm:max-w-lg">
 <form onSubmit={handleSubmit}>
 <DialogHeader>
 <DialogTitle
 className="text-blue-600 dark:text-blue-400"
 style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
 >
 Edit Item
 </DialogTitle>
 <DialogDescription className="text-gray-500 dark:text-gray-400">
 Update this record&apos;s field values.
 </DialogDescription>
 </DialogHeader>

 <div className="mt-4 max-h-[65vh] overflow-y-auto pr-1">
 {/* Language hint when editing in non-default locale */}
 {isTranslating && (
 <div className="mb-3 rounded-md bg-violet-500/10 border border-violet-500/20 px-3 py-2">
 <p className="text-xs text-violet-300">
 Editing in <strong>{currentLangName}</strong>.
 Translatable fields show {currentLangName} values (empty fields use English defaults).
 </p>
 </div>
 )}

 {translationsLoading ? (
 <div className="flex items-center justify-center py-8 gap-2 text-gray-500 dark:text-gray-400">
 <Loader2 className="h-4 w-4 animate-spin" />
 <span className="text-sm">Loading translations…</span>
 </div>
 ) : (
 <ItemFormFields
 fields={fields}
 values={displayValues}
 onChange={handleChange}
 catalogItems={catalogItems}
 collectionSlug={collectionSlug}
 currentLocale={currentLocale}
 formLayout={formLayout}
 />
 )}
 </div>

 <DialogFooter className="mt-6">
 <div className="flex w-full items-center justify-between">
 {onDeleteRequest ? (
 <Button type="button" variant="outline" size="sm" className="text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300" onClick={onDeleteRequest}>
 Delete
 </Button>
 ) : <span />}
 <div className="flex gap-2">
 <DialogClose
 render={
 <Button
 type="button"
 variant="outline"
 className="border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-blue-400 dark:text-blue-400"
 />
 }
 >
 Cancel
 </DialogClose>
 <Button
 type="submit"
 disabled={loading || translationsLoading}
 className="bg-blue-50 dark:bg-blue-950 border border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/30 hover:text-[#a8c4ff]"
 >
 {loading ? "Saving..." : "Save Changes"}
 </Button>
 </div>
 </div>
 </DialogFooter>
 </form>
 </DialogContent>
 </Dialog>
 );
}