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
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { updateField, deleteField } from "@/app/actions/studio";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";

type SimpleCollection = { id: string; name: string; slug: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fieldId: string;
  fieldName: string;
  fieldType: string;
  fieldOptions: Record<string, unknown>;
  fieldIsRequired: boolean;
  fieldIsUnique: boolean;
  fieldIsTranslatable: boolean;
  collectionSlug: string;
  allCollections: SimpleCollection[];
}

export function EditFieldDialog({
  open,
  onOpenChange,
  fieldId,
  fieldName,
  fieldType,
  fieldOptions,
  fieldIsRequired,
  fieldIsUnique,
  fieldIsTranslatable,
  collectionSlug,
  allCollections,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [isRequired, setIsRequired] = useState(false);
  const [isUnique, setIsUnique] = useState(false);
  const [isTranslatable, setIsTranslatable] = useState(false);

  // Relation options
  const [relatedCollectionId, setRelatedCollectionId] = useState("");
  const [relationType, setRelationType] = useState<"m2o" | "o2o" | "m2m">("m2o");
  const [displayField, setDisplayField] = useState("");

  // Text options
  const [maxLength, setMaxLength] = useState("");

  // Number options
  const [numMin, setNumMin] = useState("");
  const [numMax, setNumMax] = useState("");
  const [decimals, setDecimals] = useState("");

  // File options
  const [allowedExtensions, setAllowedExtensions] = useState("");

  // Select / Multiselect
  const [choices, setChoices] = useState("");
  const [catalogSlug, setCatalogSlug] = useState("");
  const [selectMode, setSelectMode] = useState<"choices" | "catalog">("choices");

  // Sync state from props whenever dialog opens
  useEffect(() => {
    if (!open) return;
    const opts = fieldOptions ?? {};
    setConfirmDelete(false);
    setIsRequired(fieldIsRequired);
    setIsUnique(fieldIsUnique);
    setIsTranslatable(fieldIsTranslatable);

    if (fieldType === "file") {
      setAllowedExtensions(
        Array.isArray(opts.allowed_extensions) ? (opts.allowed_extensions as string[]).join(", ") : ""
      );
    }
    if (fieldType === "relation") {
      setRelatedCollectionId((opts.related_collection_id as string) ?? "");
      setRelationType((opts.relation_type as "m2o" | "o2o" | "m2m") ?? "m2o");
      setDisplayField((opts.display_field as string) ?? "");
    }
    if (fieldType === "text") {
      setMaxLength(opts.max_length ? String(opts.max_length) : "");
    }
    if (fieldType === "number") {
      setNumMin(opts.min !== undefined ? String(opts.min) : "");
      setNumMax(opts.max !== undefined ? String(opts.max) : "");
      setDecimals(opts.decimals !== undefined ? String(opts.decimals) : "");
    }
    if (fieldType === "select" || fieldType === "multiselect") {
      if (opts.catalog_slug) {
        setSelectMode("catalog");
        setCatalogSlug(opts.catalog_slug as string);
      } else {
        setSelectMode("choices");
        setChoices(Array.isArray(opts.choices) ? (opts.choices as string[]).join(", ") : "");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
        if (selectMode === "catalog") return { catalog_slug: catalogSlug };
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
          ...(fieldOptions?.junction_collection_id ? { junction_collection_id: fieldOptions.junction_collection_id } : {}),
          ...(displayField.trim() ? { display_field: displayField.trim() } : {}),
        };
      default:
        return {};
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData();
    formData.set("field_id", fieldId);
    formData.set("collection_slug", collectionSlug);
    formData.set("is_required", String(isRequired));
    formData.set("is_unique", String(isUnique));
    formData.set("is_translatable", String(isTranslatable));
    formData.set("options", JSON.stringify(buildOptions()));

    const result = await updateField(formData);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success(`Field "${fieldName}" updated`);
    onOpenChange(false);
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    const formData = new FormData();
    formData.set("field_id", fieldId);
    formData.set("collection_slug", collectionSlug);
    const result = await deleteField(formData);
    setDeleting(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Field "${fieldName}" deleted`);
    onOpenChange(false);
    router.refresh();
  }

  const canBeTranslatable = fieldType === "text" || fieldType === "richtext";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 shadow-[0_0_40px_rgba(0,240,255,0.15)] sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle
              className="text-blue-600 dark:text-blue-400"
              style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
            >
              Edit Field — {fieldName}
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              Update field constraints and options. Field name and type cannot be changed.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {/* Flags */}
            <div className="flex gap-4 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isRequired}
                  onChange={(e) => setIsRequired(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 accent-blue-400"
                />
                <span className="text-sm text-gray-900 dark:text-gray-100">Required</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isUnique}
                  onChange={(e) => setIsUnique(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 accent-blue-400"
                />
                <span className="text-sm text-gray-900 dark:text-gray-100">Unique</span>
              </label>
              {canBeTranslatable && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isTranslatable}
                    onChange={(e) => setIsTranslatable(e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600 accent-blue-400"
                  />
                  <span className="text-sm text-gray-900 dark:text-gray-100">
                    Translatable <span className="text-xs text-gray-500 dark:text-gray-400">(i18n)</span>
                  </span>
                </label>
              )}
            </div>

            {/* Text options */}
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

            {/* Number options */}
            {fieldType === "number" && (
              <div className="space-y-2 rounded-lg border border-zinc-700/50 bg-zinc-800/20 p-3">
                <Label className="text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">Number Options</Label>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-sm text-gray-900 dark:text-gray-100">Min</Label>
                    <Input type="number" value={numMin} onChange={(e) => setNumMin(e.target.value)} className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm text-gray-900 dark:text-gray-100">Max</Label>
                    <Input type="number" value={numMax} onChange={(e) => setNumMax(e.target.value)} className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm text-gray-900 dark:text-gray-100">Decimals</Label>
                    <Input type="number" min={0} max={10} value={decimals} onChange={(e) => setDecimals(e.target.value)} className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100" />
                  </div>
                </div>
              </div>
            )}

            {/* File options */}
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

            {/* Select / Multiselect options */}
            {(fieldType === "select" || fieldType === "multiselect") && (
              <div className="space-y-3 rounded-lg border border-zinc-700/50 bg-zinc-800/20 p-3">
                <Label className="text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">Select Options</Label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="edit_select_mode" value="choices" checked={selectMode === "choices"} onChange={() => setSelectMode("choices")} className="accent-blue-400" />
                    <span className="text-sm text-gray-900 dark:text-gray-100">Manual choices</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="edit_select_mode" value="catalog" checked={selectMode === "catalog"} onChange={() => setSelectMode("catalog")} className="accent-blue-400" />
                    <span className="text-sm text-gray-900 dark:text-gray-100">Content Catalog</span>
                  </label>
                </div>
                {selectMode === "choices" ? (
                  <div className="space-y-1">
                    <Label className="text-sm text-gray-900 dark:text-gray-100">Choices (comma-separated)</Label>
                    <Input placeholder="Active, Inactive, Pending" value={choices} onChange={(e) => setChoices(e.target.value)} className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100" />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label className="text-sm text-gray-900 dark:text-gray-100">Catalog Slug</Label>
                    <Input placeholder="gender" value={catalogSlug} onChange={(e) => setCatalogSlug(e.target.value)} className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100" />
                  </div>
                )}
              </div>
            )}

            {/* Relation options */}
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
                          {c.name} <span className="text-xs text-zinc-500">({c.slug})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-sm text-gray-900 dark:text-gray-100">Relation Type</Label>
                  <Select value={relationType} onValueChange={(v) => setRelationType(v as "m2o" | "o2o" | "m2m")}>
                    <SelectTrigger className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
                      <SelectItem value="m2o">Many-to-One (M2O)</SelectItem>
                      <SelectItem value="o2o">One-to-One (O2O)</SelectItem>
                      <SelectItem value="m2m">Many-to-Many (M2M)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-sm text-gray-900 dark:text-gray-100">Display Field</Label>
                  <Input
                    placeholder="name"
                    value={displayField}
                    onChange={(e) => setDisplayField(e.target.value)}
                    className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500/50 dark:placeholder:text-gray-400/50"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Field slug from the related collection to show as label (e.g. <code className="text-blue-600 dark:text-blue-400">name</code>).
                    Leave blank to auto-detect.
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="mt-6 flex items-center justify-between sm:justify-between">
            <div>
              {!confirmDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Field
                </Button>
              ) : (
                <ConfirmActionDialog
                  isOpen={confirmDelete}
                  severity="danger"
                  message={`Delete this field and all its data? This cannot be undone.`}
                  confirmLabel="Delete"
                  cancelLabel="Cancel"
                  confirmVariant="destructive"
                  onConfirm={handleDelete}
                  onCancel={() => setConfirmDelete(false)}
                  isLoading={deleting}
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <DialogClose
                render={
                  <Button
                    type="button"
                    variant="outline"
                    className="border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-blue-400"
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
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
