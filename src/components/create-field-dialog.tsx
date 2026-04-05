"use client";

import { useState, useEffect } from "react";
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
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { createField } from "@/app/actions/studio";
import { getCatalogSchema } from "@/app/actions/content-catalog";
import { FieldFilterBuilder } from "@/components/field-filter-builder";
import { FieldDisplaySelector } from "@/components/field-display-selector";
import { CatalogSchema, CatalogFilterCondition } from "@/types/catalog";

function slugify(text: string) {
 return text
 .toLowerCase()
 .replace(/[^a-z0-9]+/g, "_")
 .replace(/^_|_$/g, "");
}

const FIELD_TYPES = [
 { value: "text", label: "Text" },
 { value: "number", label: "Number" },
 { value: "date", label: "Date" },
 { value: "datetime", label: "Date & Time" },
 { value: "boolean", label: "Toggle (Boolean)" },
 { value: "select", label: "Select (single)" },
 { value: "multiselect", label: "Multi-Select" },
 { value: "file", label: "File / Image" },
 { value: "richtext", label: "Rich Text" },
 { value: "json", label: "JSON" },
 { value: "relation", label: "Relation (link to another collection)" },
 { value: "password", label: "Password / Secret (write-only)" },
];

type SimpleCollection = { id: string; name: string; slug: string };

interface Props {
 collectionId: string;
 collectionSlug: string;
 allCollections: SimpleCollection[];
}

export function CreateFieldDialog({ collectionId, collectionSlug, allCollections }: Props) {
 const router = useRouter();
 const [open, setOpen] = useState(false);
 const [loading, setLoading] = useState(false);

 // Core
 const [name, setName] = useState("");
 const [fieldType, setFieldType] = useState("");
 const [isRequired, setIsRequired] = useState(false);
 const [isUnique, setIsUnique] = useState(false);
 const [isTranslatable, setIsTranslatable] = useState(false);

 // Text options
 const [maxLength, setMaxLength] = useState("");

 // Number options
 const [numMin, setNumMin] = useState("");
 const [numMax, setNumMax] = useState("");
 const [decimals, setDecimals] = useState("");

 // Select/Multiselect
 const [selectMode, setSelectMode] = useState<"choices" | "catalog">("choices");
 const [choices, setChoices] = useState(""); // comma-separated
 const [catalogSlug, setCatalogSlug] = useState("");
 const [filterConditions, setFilterConditions] = useState<CatalogFilterCondition[]>([]);
 const [displayColumns, setDisplayColumns] = useState<string[]>(["label", "value"]);
 const [catalogSchema, setCatalogSchema] = useState<CatalogSchema | null>(null);

 // File options
 const [allowedExtensions, setAllowedExtensions] = useState("");

 // Relation
 const [relatedCollectionId, setRelatedCollectionId] = useState("");
 const [relationType, setRelationType] = useState<"m2o" | "o2o" | "m2m">("m2o");
 const [relationshipStyle, setRelationshipStyle] = useState<"reference" | "child_of" | "link">("reference");

 useEffect(() => {
  if (!catalogSlug) {
   setCatalogSchema(null);
   return;
  }
  getCatalogSchema(catalogSlug).then((result) => {
   if ("error" in result || !result.data?.columns) {
    setCatalogSchema({ columns: [] });
   } else {
    setCatalogSchema(result.data);
   }
  });
 }, [catalogSlug]);

 function buildOptions(): Record<string, unknown> {
 switch (fieldType) {
 case "text":
 return maxLength ? { max_length: Number(maxLength) } : {};
 case "number":
 return {
 ...(numMin !== "" ? { min: Number(numMin) } : {}),
 ...(numMax !== "" ? { max: Number(numMax) } : {}),
 ...(decimals !== "" ? { decimals: Number(decimals) } : {}),
 };
 case "select":
 case "multiselect":
 if (selectMode === "catalog") {
  const catalogOpts: Record<string, unknown> = { catalog_slug: catalogSlug };
  if (filterConditions.length > 0) catalogOpts.filter_conditions = filterConditions;
  if (displayColumns.length > 0 && !(displayColumns.length === 2 && displayColumns.includes("label") && displayColumns.includes("value"))) {
   catalogOpts.display_columns = displayColumns;
  }
  return catalogOpts;
 }
 return {
 choices: choices
 .split(",")
 .map((c) => c.trim())
 .filter(Boolean),
 };
 case "file": {
 const exts = allowedExtensions
 .split(",")
 .map((e) => e.trim().toLowerCase().replace(/^\./, ""))
 .filter(Boolean);
 return exts.length > 0 ? { allowed_extensions: exts } : {};
 }
 case "relation":
 return {
 related_collection_id: relatedCollectionId,
 relation_type: relationType,
 relationship_style: relationshipStyle,
 };
 default:
 return {};
 }
 }

 async function handleSubmit(e: React.FormEvent) {
 e.preventDefault();
 if (!fieldType) {
 toast.error("Please select a field type");
 return;
 }
 if (fieldType === "relation" && !relatedCollectionId) {
 toast.error("Please select a related collection");
 return;
 }

 setLoading(true);
 const options = buildOptions();

 const formData = new FormData();
 formData.set("collection_id", collectionId);
 formData.set("collection_slug", collectionSlug);
 formData.set("name", name);
 formData.set("field_type", fieldType);
 formData.set("is_required", String(isRequired));
 formData.set("is_unique", String(isUnique));
 formData.set("is_translatable", String(isTranslatable));
 formData.set("options", JSON.stringify(options));

 const result = await createField(formData);
 setLoading(false);

 if (result.error) {
 toast.error(result.error);
 return;
 }

 toast.success(`Field "${name}" added`);
 setOpen(false);
 resetForm();
 router.refresh();
 }

 function resetForm() {
 setName("");
 setFieldType("");
 setIsRequired(false);
 setIsUnique(false);
 setIsTranslatable(false);
 setMaxLength("");
 setNumMin("");
 setNumMax("");
 setDecimals("");
 setSelectMode("choices");
 setChoices("");
 setCatalogSlug("");
 setFilterConditions([]);
 setDisplayColumns(["label", "value"]);
 setCatalogSchema(null);
 setAllowedExtensions("");
 setRelatedCollectionId("");
 setRelationType("m2o");
 setRelationshipStyle("reference");
 }

 return (
 <Dialog open={open} onOpenChange={setOpen}>
 <DialogTrigger
 render={
 <Button
 variant="outline" size="sm" className="gap-2 text-blue-600 dark:text-blue-400 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600"
 />
 }
 >
 <Plus className="h-4 w-4" />
 Add Field
 </DialogTrigger>

 <DialogContent className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 shadow-[0_0_40px_rgba(0,240,255,0.15)] sm:max-w-lg">
 <form onSubmit={handleSubmit}>
 <DialogHeader>
 <DialogTitle
 className="text-blue-600 dark:text-blue-400"
 style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
 >
 Add Field
 </DialogTitle>
 <DialogDescription className="text-gray-500 dark:text-gray-400">
 Define a new field for this collection.
 </DialogDescription>
 </DialogHeader>

 <div className="mt-4 space-y-4 max-h-[60vh] overflow-y-auto pr-1">
 {/* Name */}
 <div className="space-y-2">
 <Label className="text-gray-900 dark:text-gray-100">Field Name</Label>
 <Input
 placeholder="Full Name"
 value={name}
 onChange={(e) => setName(e.target.value)}
 required
 className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500/50 dark:placeholder:text-gray-400/50"
 />
 {name && (
 <p className="text-xs text-gray-500 dark:text-gray-400">
 Stored as key:{" "}
 <code className="text-blue-600 dark:text-blue-400">{slugify(name)}</code>
 </p>
 )}
 </div>

 {/* Field Type */}
 <div className="space-y-2">
 <Label className="text-gray-900 dark:text-gray-100">Field Type</Label>
 <Select value={fieldType} onValueChange={(v) => setFieldType(v ?? "")}>
 <SelectTrigger className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
 <SelectValue placeholder="Select a type..." />
 </SelectTrigger>
 <SelectContent className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
 {FIELD_TYPES.map((t) => (
 <SelectItem key={t.value} value={t.value}>
 {t.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>

 {/* i18n hint */}
 {fieldType && fieldType !== "text" && fieldType !== "richtext" && (
 <p className="text-xs text-gray-500 dark:text-gray-400/60">
 Translatable (i18n) is available for Text and Rich Text fields.
 </p>
 )}

 {/* Flags */}
 <div className="flex gap-4 flex-wrap">
 <label className="flex items-center gap-2 cursor-pointer">
 <input
 type="checkbox"
 checked={isRequired}
 onChange={(e) => setIsRequired(e.target.checked)}
 className="rounded border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 accent-blue-400"
 />
 <span className="text-sm text-gray-900 dark:text-gray-100">Required</span>
 </label>
 <label className="flex items-center gap-2 cursor-pointer">
 <input
 type="checkbox"
 checked={isUnique}
 onChange={(e) => setIsUnique(e.target.checked)}
 className="rounded border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 accent-blue-400"
 />
 <span className="text-sm text-gray-900 dark:text-gray-100">Unique</span>
 </label>
 {(fieldType === "text" || fieldType === "richtext") && (
 <label className="flex items-center gap-2 cursor-pointer">
 <input
 type="checkbox"
 checked={isTranslatable}
 onChange={(e) => setIsTranslatable(e.target.checked)}
 className="rounded border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 accent-blue-400"
 />
 <span className="text-sm text-gray-900 dark:text-gray-100">
 Translatable{" "}
 <span className="text-xs text-gray-500 dark:text-gray-400">(i18n)</span>
 </span>
 </label>
 )}
 </div>

 {/* --- Type-specific options --- */}

 {/* Text */}
 {fieldType === "text" && (
 <div className="space-y-2 rounded-lg border border-zinc-700/50 bg-zinc-800/20 p-3">
 <Label className="text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">Text Options</Label>
 <div className="space-y-1">
 <Label className="text-sm text-gray-900 dark:text-gray-100">Max Length</Label>
 <Input
 type="number"
 placeholder="255"
 value={maxLength}
 onChange={(e) => setMaxLength(e.target.value)}
 className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
 />
 </div>
 </div>
 )}

 {/* Number */}
 {fieldType === "number" && (
 <div className="space-y-2 rounded-lg border border-zinc-700/50 bg-zinc-800/20 p-3">
 <Label className="text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">Number Options</Label>
 <div className="grid grid-cols-3 gap-2">
 <div className="space-y-1">
 <Label className="text-sm text-gray-900 dark:text-gray-100">Min</Label>
 <Input
 type="number"
 value={numMin}
 onChange={(e) => setNumMin(e.target.value)}
 className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
 />
 </div>
 <div className="space-y-1">
 <Label className="text-sm text-gray-900 dark:text-gray-100">Max</Label>
 <Input
 type="number"
 value={numMax}
 onChange={(e) => setNumMax(e.target.value)}
 className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
 />
 </div>
 <div className="space-y-1">
 <Label className="text-sm text-gray-900 dark:text-gray-100">Decimals</Label>
 <Input
 type="number"
 min={0}
 max={10}
 value={decimals}
 onChange={(e) => setDecimals(e.target.value)}
 className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
 />
 </div>
 </div>
 </div>
 )}

 {/* File */}
 {fieldType === "file" && (
 <div className="space-y-2 rounded-lg border border-zinc-700/50 bg-zinc-800/20 p-3">
 <Label className="text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">File Options</Label>
 <div className="space-y-1">
 <Label className="text-sm text-gray-900 dark:text-gray-100">Allowed Extensions</Label>
 <Input
 placeholder="png, jpg, pdf"
 value={allowedExtensions}
 onChange={(e) => setAllowedExtensions(e.target.value)}
 className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500/50 dark:placeholder:text-gray-400/50"
 />
 <p className="text-xs text-gray-500 dark:text-gray-400">
 Comma-separated list (e.g. <code className="text-blue-600 dark:text-blue-400">png, jpg, pdf</code>). Leave blank to allow all file types.
 </p>
 </div>
 </div>
 )}

 {/* Select / Multiselect */}
 {(fieldType === "select" || fieldType === "multiselect") && (
 <div className="space-y-3 rounded-lg border border-zinc-700/50 bg-zinc-800/20 p-3">
 <Label className="text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">Select Options</Label>
 <div className="flex gap-3">
 <label className="flex items-center gap-2 cursor-pointer">
 <input
 type="radio"
 name="select_mode"
 value="choices"
 checked={selectMode === "choices"}
 onChange={() => setSelectMode("choices")}
 className="accent-blue-400"
 />
 <span className="text-sm text-gray-900 dark:text-gray-100">Manual choices</span>
 </label>
 <label className="flex items-center gap-2 cursor-pointer">
 <input
 type="radio"
 name="select_mode"
 value="catalog"
 checked={selectMode === "catalog"}
 onChange={() => setSelectMode("catalog")}
 className="accent-blue-400"
 />
 <span className="text-sm text-gray-900 dark:text-gray-100">Content Catalog</span>
 </label>
 </div>

 {selectMode === "choices" ? (
 <div className="space-y-1">
 <Label className="text-sm text-gray-900 dark:text-gray-100">Choices (comma-separated)</Label>
 <Input
 placeholder="Active, Inactive, Pending"
 value={choices}
 onChange={(e) => setChoices(e.target.value)}
 className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500/50 dark:placeholder:text-gray-400/50"
 />
 </div>
 ) : (
 <div className="space-y-1">
 <Label className="text-sm text-gray-900 dark:text-gray-100">Catalog Slug</Label>
 <Input
 placeholder="gender"
 value={catalogSlug}
 onChange={(e) => setCatalogSlug(e.target.value)}
 className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500/50 dark:placeholder:text-gray-400/50"
 />
 <p className="text-xs text-gray-500 dark:text-gray-400">
 e.g. gender, country, marital-status, employment-type
 </p>
 {catalogSlug && (
  <div className="mt-4 space-y-4 border-t border-gray-700 pt-4">
   <FieldFilterBuilder
    conditions={filterConditions}
    onConditionsChange={setFilterConditions}
    catalogColumns={catalogSchema?.columns || []}
   />
   <FieldDisplaySelector
    displayColumns={displayColumns}
    onDisplayColumnsChange={setDisplayColumns}
    catalogColumns={(catalogSchema?.columns || []).filter(
     (col) => col.key !== "label" && col.key !== "value"
    )}
   />
  </div>
 )}
 </div>
 )}
 </div>
 )}

 {/* Relation */}
 {fieldType === "relation" && (
 <div className="space-y-3 rounded-lg border border-zinc-700/50 bg-zinc-800/20 p-3">
 <Label className="text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">Relation Options</Label>

 <div className="space-y-1">
 <Label className="text-sm text-gray-900 dark:text-gray-100">Related Collection</Label>
 <Select value={relatedCollectionId} onValueChange={(v) => setRelatedCollectionId(v ?? "")}>
 <SelectTrigger className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
 <SelectValue placeholder="Select collection..." />
 </SelectTrigger>
 <SelectContent className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
 {allCollections.map((c) => (
 <SelectItem key={c.id} value={c.id}>
 {c.name}{" "}
 <span className="text-xs text-zinc-500">({c.slug})</span>
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>

 <div className="space-y-1">
 <Label className="text-sm text-gray-900 dark:text-gray-100">Relation Type</Label>
 <Select
 value={relationType}
 onValueChange={(v) => {
 setRelationType(v as "m2o" | "o2o" | "m2m");
 // child_of only valid for m2o
 if (v !== "m2o" && relationshipStyle === "child_of") {
 setRelationshipStyle("reference");
 }
 }}
 >
 <SelectTrigger className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
 <SelectValue />
 </SelectTrigger>
 <SelectContent className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
 <SelectItem value="m2o">Many-to-One (M2O)</SelectItem>
 <SelectItem value="o2o">One-to-One (O2O)</SelectItem>
 <SelectItem value="m2m">Many-to-Many (M2M) — auto-creates junction</SelectItem>
 </SelectContent>
 </Select>
 </div>

 {/* Relationship Style — determines UI behavior */}
 {relationType !== "m2m" && (
 <div className="space-y-2">
 <Label className="text-sm text-gray-900 dark:text-gray-100">Relationship Style</Label>
 <div className="space-y-2">
 {relationType === "m2o" && (
 <label className="flex items-start gap-2 cursor-pointer rounded-md border border-gray-200 dark:border-gray-700 p-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
 <input
 type="radio"
 name="relationship_style"
 value="child_of"
 checked={relationshipStyle === "child_of"}
 onChange={() => setRelationshipStyle("child_of")}
 className="mt-0.5 accent-blue-500"
 />
 <div>
 <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Child of (master-detail)</span>
 <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
 Items are sub-records of the parent. Shown as a tab on the parent item view.
 </p>
 </div>
 </label>
 )}
 <label className="flex items-start gap-2 cursor-pointer rounded-md border border-gray-200 dark:border-gray-700 p-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
 <input
 type="radio"
 name="relationship_style"
 value="reference"
 checked={relationshipStyle === "reference"}
 onChange={() => setRelationshipStyle("reference")}
 className="mt-0.5 accent-blue-500"
 />
 <div>
 <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Reference (lookup/dropdown)</span>
 <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
 Select from related items. Used for shared lists like Department, Country.
 </p>
 </div>
 </label>
 <label className="flex items-start gap-2 cursor-pointer rounded-md border border-gray-200 dark:border-gray-700 p-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
 <input
 type="radio"
 name="relationship_style"
 value="link"
 checked={relationshipStyle === "link"}
 onChange={() => setRelationshipStyle("link")}
 className="mt-0.5 accent-blue-500"
 />
 <div>
 <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Link (association)</span>
 <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
 A loose link to another record. No special UI behavior.
 </p>
 </div>
 </label>
 </div>
 </div>
 )}
 </div>
 )}
 </div>

 <DialogFooter className="mt-6">
 <DialogClose
 render={
 <Button
 type="button"
 variant="outline"
 className="border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-blue-400 dark:text-blue-400"
 onClick={resetForm}
 />
 }
 >
 Cancel
 </DialogClose>
 <Button
 type="submit"
 disabled={loading || !name.trim() || !fieldType}
 className="bg-blue-50 dark:bg-blue-950 border border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/30 hover:text-[#a8c4ff]"
 >
 {loading ? "Adding..." : "Add Field"}
 </Button>
 </DialogFooter>
 </form>
 </DialogContent>
 </Dialog>
 );
}