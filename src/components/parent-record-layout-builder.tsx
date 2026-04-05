"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Plus, Trash2, ChevronUp, ChevronDown, Save, GripVertical, Layers, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveParentRecordLayout } from "@/app/actions/studio";
import type {
  ParentRecordLayout,
  ParentRecordElement,
  ParentRecordColumnGroup,
} from "@/types/parent-record-layout";

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

type SchemaField = { id: string; slug: string; name: string; field_type: string };

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Text", number: "Number", date: "Date", datetime: "DateTime",
  boolean: "Toggle", file: "File", select: "Select", multiselect: "Multi-Select",
  richtext: "Rich Text", json: "JSON", relation: "Relation", password: "Password / Secret",
};

function collectPlacedSlugs(elements: ParentRecordElement[]): string[] {
  return elements.flatMap((el) => {
    if (el.type === "field") return [el.fieldSlug];
    if (el.type === "column-group") return el.slots.flatMap((slot) => slot.map((s) => s.fieldSlug));
    return [];
  });
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const placedSlugs = new Set(collectPlacedSlugs(elements));
  const availableFields = fields.filter((f) => !placedSlugs.has(f.slug));

  function addElement(el: ParentRecordElement) {
    setElements((prev) => [...prev, el]);
  }

  function removeElement(idx: number) {
    setElements((prev) => prev.filter((_, i) => i !== idx));
  }

  function patchElement(idx: number, patch: Partial<ParentRecordElement>) {
    setElements((prev) =>
      prev.map((el, i) => (i === idx ? ({ ...el, ...patch } as ParentRecordElement) : el))
    );
  }

  function moveElement(idx: number, dir: "up" | "down") {
    setElements((prev) => {
      const arr = [...prev];
      const to = dir === "up" ? idx - 1 : idx + 1;
      if (to < 0 || to >= arr.length) return arr;
      [arr[idx], arr[to]] = [arr[to], arr[idx]];
      return arr;
    });
  }

  function handleElementDrop(dropIdx: number) {
    if (dragIdx === null || dragIdx === dropIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    setElements((prev) => {
      const arr = [...prev];
      const [moved] = arr.splice(dragIdx, 1);
      arr.splice(dropIdx, 0, moved);
      return arr;
    });
    setDragIdx(null);
    setDragOverIdx(null);
  }

  async function handleSave() {
    setSaving(true);
    const result = await saveParentRecordLayout(collectionId, { elements });
    setSaving(false);
    if ("error" in result) toast.error(result.error);
    else toast.success("Parent record layout saved");
  }

  if (!canEdit) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-10 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">Layout is read-only for this collection.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Configure which fields appear in the parent record card. Use column groups for multi-column rows.
          Fields not placed here are hidden from the card.
        </p>
        <Button
          onClick={handleSave}
          disabled={saving}
          size="sm"
          className="gap-1.5 bg-blue-50 dark:bg-blue-950 border border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/30 hover:text-[#a8c4ff] shrink-0"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving…" : "Save Layout"}
        </Button>
      </div>

      {/* Canvas */}
      <div className="space-y-3">
        {elements.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 py-10 text-center">
            <p className="text-sm text-gray-400 dark:text-gray-500">
              No elements yet — click Add Element below.
            </p>
          </div>
        )}

        {elements.map((el, idx) => (
          <div
            key={idx}
            draggable
            onDragStart={() => setDragIdx(idx)}
            onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
            onDragLeave={() => setDragOverIdx(null)}
            onDrop={(e) => { e.preventDefault(); handleElementDrop(idx); }}
            onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
          >
            <ParentElementRow
              element={el}
              index={idx}
              total={elements.length}
              fields={fields}
              placedSlugs={placedSlugs}
              onMove={(dir) => moveElement(idx, dir)}
              onRemove={() => removeElement(idx)}
              onPatch={(patch) => patchElement(idx, patch)}
              isDragOver={dragOverIdx === idx}
              isDragging={dragIdx === idx}
            />
          </div>
        ))}
      </div>

      {/* Add Element button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setDrawerOpen(true)}
        className="h-8 gap-1.5 text-xs border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-500/40"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Element
      </Button>

      {/* Unplaced fields notice */}
      {availableFields.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <p className="text-xs text-amber-400">
            <strong>{availableFields.length} unplaced field{availableFields.length > 1 ? "s" : ""}:</strong>{" "}
            {availableFields.map((f) => f.name).join(", ")}.
            These will not appear in the parent card.
          </p>
        </div>
      )}

      {/* Add Element Drawer */}
      <ParentAddElementDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        fields={fields}
        placedSlugs={placedSlugs}
        onAdd={addElement}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ParentElementRow
// ---------------------------------------------------------------------------

function ParentElementRow({
  element,
  index,
  total,
  fields,
  placedSlugs,
  onMove,
  onRemove,
  onPatch,
  isDragOver,
  isDragging,
}: {
  element: ParentRecordElement;
  index: number;
  total: number;
  fields: SchemaField[];
  placedSlugs: Set<string>;
  onMove: (dir: "up" | "down") => void;
  onRemove: () => void;
  onPatch: (patch: Partial<ParentRecordElement>) => void;
  isDragOver?: boolean;
  isDragging?: boolean;
}) {
  if (element.type === "field") {
    const def = fields.find((f) => f.slug === element.fieldSlug);
    return (
      <div className={cn(
        "flex items-center gap-2 rounded-lg border bg-white dark:bg-gray-900 px-3 py-2.5 transition-colors h-full cursor-grab",
        isDragOver ? "border-blue-400 bg-blue-50 dark:bg-blue-950/30" : "border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700",
        isDragging && "opacity-50"
      )}>
        <GripVertical className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500 shrink-0" />
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <div className="h-2 w-2 rounded-full bg-blue-400 shrink-0" />
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {def?.name ?? element.fieldSlug}
          </span>
          <code className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 rounded px-1 font-mono shrink-0 hidden sm:block">
            {element.fieldSlug}
          </code>
          <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
            {def ? (FIELD_TYPE_LABELS[def.field_type] ?? def.field_type) : "?"}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => onMove("up")}
            disabled={index === 0}
            className="p-1 rounded text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-25 transition-colors"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onMove("down")}
            disabled={index === total - 1}
            className="p-1 rounded text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-25 transition-colors"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onRemove}
            className="p-1 rounded text-gray-400 dark:text-gray-500 hover:text-red-400 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  if (element.type === "column-group") {
    return (
      <div className={cn(
        "rounded-lg border border-green-500/30 bg-green-50/30 dark:bg-green-950/20 p-3 space-y-2",
        isDragOver && "border-blue-400",
        isDragging && "opacity-50"
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GripVertical className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500 cursor-grab shrink-0" />
            <span className="text-xs font-medium text-green-700 dark:text-green-400">
              {element.columns}-Column Layout
            </span>
          </div>
          <button
            onClick={onRemove}
            className="p-0.5 text-gray-500 dark:text-gray-400 hover:text-red-400 rounded"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className={`grid gap-2 ${element.columns === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
          {element.slots.map((slot, colIdx) => {
            const availableForSlot = fields.filter((f) => !placedSlugs.has(f.slug));
            return (
              <div
                key={colIdx}
                className="min-h-[60px] rounded border border-dashed border-gray-300 dark:border-gray-600 p-2 space-y-1"
              >
                <p className="text-[10px] text-gray-500 dark:text-gray-400">Col {colIdx + 1}</p>
                {slot.map((slotField, slotIdx) => {
                  const f = fields.find((fi) => fi.slug === slotField.fieldSlug);
                  return (
                    <div
                      key={slotIdx}
                      className="flex items-center justify-between gap-1 bg-white dark:bg-gray-800 rounded px-2 py-1 border border-gray-200 dark:border-gray-700 text-xs"
                    >
                      <span className="text-gray-900 dark:text-gray-100 truncate">
                        {f?.name ?? slotField.fieldSlug}
                      </span>
                      <button
                        onClick={() => {
                          const newSlots = element.slots.map((s, si) =>
                            si === colIdx ? s.filter((_, fi) => fi !== slotIdx) : s
                          );
                          onPatch({ slots: newSlots } as Partial<ParentRecordColumnGroup>);
                        }}
                        className="text-gray-500 dark:text-gray-400 hover:text-red-400 shrink-0"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
                {availableForSlot.length > 0 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <button className="w-full flex items-center justify-center gap-1 text-[10px] text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 border border-dashed border-gray-200 dark:border-gray-700 hover:border-blue-400 rounded py-1 px-2 transition-colors" />
                      }
                    >
                      <Plus className="h-2.5 w-2.5" /> Add field
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 max-h-48 overflow-y-auto"
                    >
                      {availableForSlot.map((f) => (
                        <DropdownMenuItem
                          key={f.slug}
                          onClick={() => {
                            const newSlots = element.slots.map((s, si) =>
                              si === colIdx ? [...s, { fieldSlug: f.slug }] : s
                            );
                            onPatch({ slots: newSlots } as Partial<ParentRecordColumnGroup>);
                          }}
                          className="text-sm cursor-pointer gap-2"
                        >
                          <span className="text-gray-900 dark:text-gray-100">{f.name}</span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {FIELD_TYPE_LABELS[f.field_type] ?? f.field_type}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 italic text-center py-1">
                    No fields available
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// ParentAddElementDrawer
// ---------------------------------------------------------------------------

function ParentAddElementDrawer({
  open,
  onOpenChange,
  fields,
  placedSlugs,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: SchemaField[];
  placedSlugs: Set<string>;
  onAdd: (el: ParentRecordElement) => void;
}) {
  const availableFields = fields.filter((f) => !placedSlugs.has(f.slug));
  const placedFields = fields.filter((f) => placedSlugs.has(f.slug));

  function addField(slug: string) {
    onAdd({ type: "field", fieldSlug: slug });
    onOpenChange(false);
  }

  function addColumnGroup(columns: 2 | 3) {
    onAdd({
      type: "column-group",
      columns,
      slots: Array.from({ length: columns }, () => []),
    });
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-72 sm:max-w-72 flex flex-col gap-0 p-0 bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800"
      >
        <SheetHeader className="border-b border-gray-200 dark:border-gray-800 px-4 py-3">
          <SheetTitle className="text-sm text-gray-900 dark:text-gray-100">Add Element</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Fields */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Fields
            </p>
            {availableFields.length === 0 && placedFields.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 italic">No fields in this collection yet.</p>
            )}
            {availableFields.map((f) => (
              <button
                key={f.slug}
                onClick={() => addField(f.slug)}
                className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
              >
                <div className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
                <span className="text-sm text-gray-900 dark:text-gray-100 flex-1 truncate">{f.name}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                  {FIELD_TYPE_LABELS[f.field_type] ?? f.field_type}
                </span>
                <Plus className="h-3.5 w-3.5 text-blue-400 opacity-0 group-hover:opacity-100 shrink-0" />
              </button>
            ))}
            {placedFields.length > 0 && (
              <div className="space-y-1">
                {placedFields.map((f) => (
                  <div
                    key={f.slug}
                    className="flex items-center gap-2 rounded-md px-3 py-2 opacity-40 cursor-not-allowed"
                  >
                    <div className="h-1.5 w-1.5 rounded-full bg-gray-400 shrink-0" />
                    <span className="text-sm text-gray-500 flex-1 truncate">{f.name}</span>
                    <span className="text-xs text-gray-400 shrink-0">placed</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Layout */}
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
              Layout
            </p>
            <button
              onClick={() => addColumnGroup(2)}
              className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
            >
              <Layers className="h-4 w-4 text-green-400 shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-gray-900 dark:text-gray-100">2 Columns</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">Two equal side-by-side columns</p>
              </div>
              <Plus className="h-3.5 w-3.5 text-blue-400 opacity-0 group-hover:opacity-100 shrink-0" />
            </button>
            <button
              onClick={() => addColumnGroup(3)}
              className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
            >
              <Layers className="h-4 w-4 text-green-400 shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-gray-900 dark:text-gray-100">3 Columns</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">Three equal columns</p>
              </div>
              <Plus className="h-3.5 w-3.5 text-blue-400 opacity-0 group-hover:opacity-100 shrink-0" />
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
