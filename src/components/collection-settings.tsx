"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { updateCollectionMetadata } from "@/app/actions/studio";

type Field = {
  id: string;
  slug: string;
  name: string;
  field_type: string;
};

interface Props {
  collectionId: string;
  fields: Field[];
  metadata: Record<string, unknown>;
}

export function CollectionSettings({ collectionId, fields, metadata }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Display key fields
  const [displayKeyFields, setDisplayKeyFields] = useState<string[]>(
    (metadata.display_key_fields as string[]) ?? []
  );
  const [addingDisplayKey, setAddingDisplayKey] = useState("");

  // Unique constraints
  const [uniqueConstraints, setUniqueConstraints] = useState<string[][]>(
    (metadata.unique_constraints as string[][]) ?? []
  );
  const [newConstraintFields, setNewConstraintFields] = useState<string[]>([]);
  const [addingConstraintField, setAddingConstraintField] = useState("");

  // Effective date field
  const [effectiveDateField, setEffectiveDateField] = useState<string>(
    (metadata.effective_date_field as string) ?? ""
  );

  // Cascade rules
  const [cascadeAction, setCascadeAction] = useState<string>(
    (metadata.cascade_rules as { on_parent_delete?: string })?.on_parent_delete ?? "restrict"
  );

  // Allow import
  const [allowImport, setAllowImport] = useState<boolean>(
    (metadata.allow_import as boolean) ?? false
  );

  // Child tab sort order
  const [childTabSortOrder, setChildTabSortOrder] = useState<string>(
    metadata.child_tab_sort_order !== undefined ? String(metadata.child_tab_sort_order) : ""
  );

  const dateFields = fields.filter((f) => f.field_type === "date" || f.field_type === "datetime");
  const allFieldSlugs = fields.map((f) => f.slug);

  function addDisplayKey() {
    if (addingDisplayKey && !displayKeyFields.includes(addingDisplayKey)) {
      setDisplayKeyFields([...displayKeyFields, addingDisplayKey]);
      setAddingDisplayKey("");
    }
  }

  function removeDisplayKey(slug: string) {
    setDisplayKeyFields(displayKeyFields.filter((s) => s !== slug));
  }

  function addConstraintField() {
    if (addingConstraintField && !newConstraintFields.includes(addingConstraintField)) {
      setNewConstraintFields([...newConstraintFields, addingConstraintField]);
      setAddingConstraintField("");
    }
  }

  function commitConstraint() {
    if (newConstraintFields.length >= 2) {
      setUniqueConstraints([...uniqueConstraints, [...newConstraintFields]]);
      setNewConstraintFields([]);
    }
  }

  function removeConstraint(idx: number) {
    setUniqueConstraints(uniqueConstraints.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    setSaving(true);
    const meta: Record<string, unknown> = {
      display_key_fields: displayKeyFields.length > 0 ? displayKeyFields : undefined,
      unique_constraints: uniqueConstraints.length > 0 ? uniqueConstraints : undefined,
      effective_date_field: effectiveDateField || undefined,
      cascade_rules: { on_parent_delete: cascadeAction },
      allow_import: allowImport || undefined,
    };
    if (childTabSortOrder !== "") {
      meta.child_tab_sort_order = Number(childTabSortOrder);
    }

    const result = await updateCollectionMetadata(collectionId, meta);
    setSaving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Collection settings saved");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Display Key Fields */}
      <div className="space-y-2">
        <Label className="text-gray-900 dark:text-gray-100 text-sm font-medium">Display Key Fields</Label>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Fields shown as the record identity in breadcrumbs and parent references.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {displayKeyFields.map((slug) => (
            <Badge
              key={slug}
              variant="outline"
              className="text-xs border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 gap-1 pr-1"
            >
              {slug}
              <button
                onClick={() => removeDisplayKey(slug)}
                className="ml-0.5 text-gray-400 hover:text-red-500"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <div className="flex items-center gap-1">
            <Select value={addingDisplayKey} onValueChange={(v) => setAddingDisplayKey(v ?? "")}>
              <SelectTrigger className="h-7 w-32 text-xs bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">
                <SelectValue placeholder="+ Add field" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">
                {allFieldSlugs
                  .filter((s) => !displayKeyFields.includes(s))
                  .map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {addingDisplayKey && (
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={addDisplayKey}>
                <Plus className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Unique Constraints */}
      <div className="space-y-2">
        <Label className="text-gray-900 dark:text-gray-100 text-sm font-medium">Unique Constraints</Label>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Composite uniqueness rules. Each constraint is a set of fields that must be unique together.
        </p>
        <div className="space-y-1.5">
          {uniqueConstraints.map((constraint, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500 dark:text-gray-400">{idx + 1}.</span>
              <span className="text-xs font-mono text-blue-600 dark:text-blue-400">
                [{constraint.join(", ")}]
              </span>
              <button
                onClick={() => removeConstraint(idx)}
                className="text-gray-400 hover:text-red-500"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        {/* Add new constraint */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {newConstraintFields.map((slug) => (
            <Badge key={slug} variant="outline" className="text-xs border-dashed border-blue-300 dark:border-blue-600 text-blue-600 dark:text-blue-400 gap-1 pr-1">
              {slug}
              <button
                onClick={() => setNewConstraintFields(newConstraintFields.filter((s) => s !== slug))}
                className="text-blue-400 hover:text-red-500"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Select value={addingConstraintField} onValueChange={(v) => setAddingConstraintField(v ?? "")}>
            <SelectTrigger className="h-7 w-32 text-xs bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">
              <SelectValue placeholder="+ Add field" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">
              {allFieldSlugs
                .filter((s) => !newConstraintFields.includes(s))
                .map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                ))}
            </SelectContent>
          </Select>
          {addingConstraintField && (
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={addConstraintField}>
              <Plus className="h-3 w-3" />
            </Button>
          )}
          {newConstraintFields.length >= 2 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs border-blue-300 dark:border-blue-600 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30"
              onClick={commitConstraint}
            >
              Add Constraint
            </Button>
          )}
        </div>
      </div>

      {/* Effective Date Field */}
      <div className="space-y-2">
        <Label className="text-gray-900 dark:text-gray-100 text-sm font-medium">Effective Date Field</Label>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Records are sorted by this date field. The most recent record is marked "Current".
        </p>
        <div className="flex items-center gap-2">
          <Select value={effectiveDateField} onValueChange={(v) => setEffectiveDateField(v ?? "")}>
            <SelectTrigger className="h-8 w-48 text-xs bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">
              {dateFields.map((f) => (
                <SelectItem key={f.slug} value={f.slug} className="text-xs">
                  {f.name} ({f.slug})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {effectiveDateField && (
            <button
              onClick={() => setEffectiveDateField("")}
              className="text-gray-400 hover:text-red-500"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Cascade Rules */}
      <div className="space-y-2">
        <Label className="text-gray-900 dark:text-gray-100 text-sm font-medium">On Delete</Label>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          What happens to child records when this item is deleted.
        </p>
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="cascade_action"
              value="restrict"
              checked={cascadeAction === "restrict"}
              onChange={() => setCascadeAction("restrict")}
              className="accent-blue-500"
            />
            <span className="text-sm text-gray-900 dark:text-gray-100">Restrict</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">— block if children exist</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="cascade_action"
              value="cascade"
              checked={cascadeAction === "cascade"}
              onChange={() => setCascadeAction("cascade")}
              className="accent-blue-500"
            />
            <span className="text-sm text-gray-900 dark:text-gray-100">Cascade</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">— delete children too</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="cascade_action"
              value="nullify"
              checked={cascadeAction === "nullify"}
              onChange={() => setCascadeAction("nullify")}
              className="accent-blue-500"
            />
            <span className="text-sm text-gray-900 dark:text-gray-100">Nullify</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">— clear parent reference on children</span>
          </label>
        </div>
      </div>

      {/* Allow Import */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-gray-900 dark:text-gray-100 text-sm font-medium">Allow Import</Label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Show the Import button on the items page. Disable for complex (parent-child) collections where CSV import is not suitable.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={allowImport}
            onClick={() => setAllowImport(!allowImport)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              allowImport ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                allowImport ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Child Tab Sort Order */}
      <div className="space-y-2">
        <Label className="text-gray-900 dark:text-gray-100 text-sm font-medium">Child Tab Sort Order</Label>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          When this collection appears as a child tab, this controls the tab order (lower = first).
        </p>
        <input
          type="number"
          min="0"
          max="999"
          value={childTabSortOrder}
          onChange={(e) => setChildTabSortOrder(e.target.value)}
          placeholder="999"
          className="h-8 w-24 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 text-gray-900 dark:text-gray-100"
        />
      </div>

      {/* Save */}
      <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
        <Button
          onClick={handleSave}
          disabled={saving}
          size="sm"
          className="gap-1.5 bg-blue-50 dark:bg-blue-950 border border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/30"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
