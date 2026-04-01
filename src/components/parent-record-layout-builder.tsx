"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Plus, Trash2, ChevronUp, ChevronDown, Save } from "lucide-react";
import { saveParentRecordLayout } from "@/app/actions/studio";
import type { ParentRecordLayout, ParentRecordElement } from "@/types/parent-record-layout";

type SchemaField = { id: string; slug: string; name: string; field_type: string };

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  datetime: "DateTime",
  boolean: "Toggle",
  file: "File",
  select: "Select",
  multiselect: "Multi-Select",
  richtext: "Rich Text",
  json: "JSON",
  relation: "Relation",
};

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

export function ParentRecordLayoutBuilder({
  collectionId,
  fields,
  initialLayout,
  canEdit,
}: {
  collectionId: string;
  fields: SchemaField[];
  initialLayout: ParentRecordLayout | null;
  canEdit: boolean;
}) {
  const [elements, setElements] = useState<ParentRecordElement[]>(
    initialLayout?.elements ?? []
  );
  const [saving, setSaving] = useState(false);

  const placedSlugs = new Set(elements.map((e) => e.fieldSlug));
  const availableFields = fields.filter((f) => !placedSlugs.has(f.slug));

  const handleAddField = (fieldSlug: string) => {
    const field = fields.find((f) => f.slug === fieldSlug);
    if (!field) return;
    setElements([
      ...elements,
      { type: "field", fieldSlug, width: "1" },
    ]);
  };

  const handleRemove = (index: number) => {
    setElements(elements.filter((_, i) => i !== index));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newElements = [...elements];
    [newElements[index], newElements[index - 1]] = [
      newElements[index - 1],
      newElements[index],
    ];
    setElements(newElements);
  };

  const handleMoveDown = (index: number) => {
    if (index === elements.length - 1) return;
    const newElements = [...elements];
    [newElements[index], newElements[index + 1]] = [
      newElements[index + 1],
      newElements[index],
    ];
    setElements(newElements);
  };

  const handleWidthChange = (index: number, width: "1" | "2" | "3") => {
    const newElements = [...elements];
    newElements[index].width = width;
    setElements(newElements);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveParentRecordLayout(collectionId, { elements });
      toast.success("Parent record layout saved");
    } catch (err) {
      toast.error("Failed to save layout");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400">
        You don't have permission to edit this layout.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Fields to display in parent record
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Max 3 columns: width "1" (1/3), "2" (2/3), "3" (full). Mobile shows 1 column.
        </p>

        {/* Field list */}
        {elements.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
            No fields added yet. Add fields using the dropdown below.
          </p>
        ) : (
          <div className="space-y-2 mb-4 bg-gray-50 dark:bg-gray-800/30 rounded-lg p-4">
            {elements.map((el, idx) => {
              const field = fields.find((f) => f.slug === el.fieldSlug);
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {field?.name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {FIELD_TYPE_LABELS[field?.field_type ?? ""] || field?.field_type}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* Width selector */}
                    <Select value={el.width} onValueChange={(v) => handleWidthChange(idx, v as "1" | "2" | "3")}>
                      <SelectTrigger className="h-8 w-16 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 col</SelectItem>
                        <SelectItem value="2">2 col</SelectItem>
                        <SelectItem value="3">3 col</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Move buttons */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => handleMoveUp(idx)}
                      disabled={idx === 0}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => handleMoveDown(idx)}
                      disabled={idx === elements.length - 1}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>

                    {/* Remove button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                      onClick={() => handleRemove(idx)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add field dropdown */}
        {availableFields.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add Field
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {availableFields.map((f) => (
                <DropdownMenuItem key={f.id} onClick={() => handleAddField(f.slug)}>
                  {f.name}{" "}
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {FIELD_TYPE_LABELS[f.field_type] || f.field_type}
                  </Badge>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Grid preview */}
      <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800/30 rounded-lg">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3">
          Preview (Desktop)
        </p>
        <div className="grid grid-cols-3 gap-2">
          {elements.map((el, idx) => {
            const field = fields.find((f) => f.slug === el.fieldSlug);
            const colClass =
              el.width === "1"
                ? "col-span-1"
                : el.width === "2"
                  ? "col-span-2"
                  : "col-span-3";
            return (
              <div
                key={idx}
                className={`${colClass} p-2 bg-white dark:bg-gray-800 rounded border border-dashed border-gray-300 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-400`}
              >
                {field?.name}
              </div>
            );
          })}
        </div>
      </div>

      {/* Save button */}
      <Button
        onClick={handleSave}
        disabled={saving}
        className="gap-1.5"
      >
        <Save className="h-4 w-4" />
        {saving ? "Saving..." : "Save Layout"}
      </Button>
    </div>
  );
}
