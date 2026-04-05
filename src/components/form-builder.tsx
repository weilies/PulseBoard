"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  AlignLeft,
  ExternalLink,
  Save,
  Layers,
  Minus,
  GripVertical,
} from "lucide-react";
import { saveFormLayout } from "@/app/actions/studio";
import { cn } from "@/lib/utils";
import type {
  FormLayout,
  FormTab,
  FormElement,
  FormElementField,
  FormElementNote,
  FormElementButton,
  FormElementTabGroup,
  FormElementColumnGroup,
  FieldWidget,
} from "@/types/form-layout";

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Text", number: "Number", date: "Date", datetime: "DateTime",
  boolean: "Toggle", file: "File", select: "Select", multiselect: "Multi-Select",
  richtext: "Rich Text", json: "JSON", relation: "Relation",
};

const WIDGET_LABELS: Record<FieldWidget, string> = {
  auto: "auto",
  input: "input",
  textarea: "textarea",
  wysiwyg: "wysiwyg",
};

type SchemaField = { id: string; slug: string; name: string; field_type: string };
type DrawerAddFn = (el: FormElement) => void;

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function widgetOptionsForFieldType(fieldType: string): FieldWidget[] {
  if (fieldType === "text" || fieldType === "richtext") {
    return ["auto", "input", "textarea", "wysiwyg"];
  }
  return ["auto"];
}

function collectPlacedSlugs(elements: FormElement[]): string[] {
  return elements.flatMap((el) => {
    if (el.type === "field") return [el.fieldSlug];
    if (el.type === "tab-group") return el.tabs.flatMap((t) => collectPlacedSlugs(t.elements));
    if (el.type === "column-group") return el.slots.flatMap((slot) => slot.map((s) => s.fieldSlug));
    return [];
  });
}

// ---------------------------------------------------------------------------
// FormBuilder — main component
// ---------------------------------------------------------------------------

export function FormBuilder({
  collectionId,
  fields,
  initialLayout,
  canEdit,
}: {
  collectionId: string;
  fields: SchemaField[];
  initialLayout: FormLayout | null;
  canEdit: boolean;
}) {
  const defaultTabs: FormTab[] = [{ id: genId(), label: "General", elements: [] }];
  const [tabs, setTabs] = useState<FormTab[]>(
    initialLayout?.tabs?.length ? initialLayout.tabs : defaultTabs
  );
  const [activeTabId, setActiveTabId] = useState<string>(
    initialLayout?.tabs?.[0]?.id ?? defaultTabs[0].id
  );
  const [saving, setSaving] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Drawer state — stores the callback to use when adding an element
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerState, setDrawerState] = useState<{ addFn: DrawerAddFn } | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  const placedSlugs = new Set(
    tabs.flatMap((t) => collectPlacedSlugs(t.elements))
  );
  const availableFields = fields.filter((f) => !placedSlugs.has(f.slug));

  function openDrawer(addFn: DrawerAddFn) {
    setDrawerState({ addFn });
    setDrawerOpen(true);
  }

  function updateTab(tabId: string, updater: (t: FormTab) => FormTab) {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? updater(t) : t)));
  }

  function addTab() {
    const t: FormTab = { id: genId(), label: "New Tab", elements: [] };
    setTabs((prev) => [...prev, t]);
    setActiveTabId(t.id);
  }

  function deleteTab(tabId: string) {
    if (tabs.length <= 1) { toast.error("Keep at least one tab"); return; }
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId);
      if (activeTabId === tabId) setActiveTabId(next[0]?.id ?? "");
      return next;
    });
  }

  function removeElement(tabId: string, idx: number) {
    updateTab(tabId, (t) => ({ ...t, elements: t.elements.filter((_, i) => i !== idx) }));
  }

  function moveElement(tabId: string, idx: number, dir: "up" | "down") {
    updateTab(tabId, (t) => {
      const arr = [...t.elements];
      const to = dir === "up" ? idx - 1 : idx + 1;
      if (to < 0 || to >= arr.length) return t;
      [arr[idx], arr[to]] = [arr[to], arr[idx]];
      return { ...t, elements: arr };
    });
  }

  function handleElementDrop(tabId: string, dropIdx: number) {
    if (dragIdx === null || dragIdx === dropIdx) { setDragIdx(null); setDragOverIdx(null); return; }
    updateTab(tabId, (t) => {
      const arr = [...t.elements];
      const [moved] = arr.splice(dragIdx, 1);
      arr.splice(dropIdx, 0, moved);
      return { ...t, elements: arr };
    });
    setDragIdx(null);
    setDragOverIdx(null);
  }

  function patchElement(tabId: string, idx: number, patch: Partial<FormElement>) {
    updateTab(tabId, (t) => ({
      ...t,
      elements: t.elements.map((el, i) => (i === idx ? { ...el, ...patch } : el)) as FormElement[],
    }));
  }

  async function handleSave() {
    setSaving(true);
    const result = await saveFormLayout(collectionId, { tabs });
    setSaving(false);
    if (result.error) toast.error(result.error);
    else toast.success("Form layout saved");
  }

  if (!canEdit) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-10 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">Form layout is read-only for this collection.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Define how the item form is laid out when creating or editing records.
          Fields not placed here appear at the bottom of the form automatically.
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

      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b border-gray-200 dark:border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            className={`px-4 py-2 text-sm transition-colors -mb-px ${
              tab.id === activeTabId
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-400 font-medium"
                : "text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <button
          onClick={addTab}
          className="px-3 py-2 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          title="Add tab"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Active tab content */}
      {activeTab && (
        <div className="space-y-4">
          {/* Tab settings */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Tab label</Label>
              <Input
                value={activeTab.label}
                onChange={(e) => updateTab(activeTab.id, (t) => ({ ...t, label: e.target.value }))}
                className="h-8 text-sm bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 w-48"
              />
            </div>
            {tabs.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => deleteTab(activeTab.id)}
                className="h-8 gap-1 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Tab
              </Button>
            )}
          </div>

          {/* Elements canvas — 2-column grid for half/full preview */}
          <div className="grid grid-cols-2 gap-3">
            {activeTab.elements.length === 0 && (
              <div className="col-span-2 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 py-10 text-center">
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  No elements yet — click Add Element below.
                </p>
              </div>
            )}

            {activeTab.elements.map((el, idx) => {
              const span = el.type === "field" && el.width === "half" ? "col-span-1" : "col-span-2";
              return (
                <div
                  key={idx}
                  className={span}
                  draggable
                  onDragStart={() => setDragIdx(idx)}
                  onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
                  onDragLeave={() => setDragOverIdx(null)}
                  onDrop={(e) => { e.preventDefault(); handleElementDrop(activeTab.id, idx); }}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                >
                  <ElementRow
                    element={el}
                    index={idx}
                    total={activeTab.elements.length}
                    fields={fields}
                    onMove={(dir) => moveElement(activeTab.id, idx, dir)}
                    onRemove={() => removeElement(activeTab.id, idx)}
                    onPatch={(patch) => patchElement(activeTab.id, idx, patch)}
                    openDrawer={openDrawer}
                    placedSlugs={placedSlugs}
                    isDragOver={dragOverIdx === idx}
                    isDragging={dragIdx === idx}
                  />
                </div>
              );
            })}
          </div>

          {/* Add element button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              openDrawer((el) =>
                updateTab(activeTab.id, (t) => ({ ...t, elements: [...t.elements, el] }))
              )
            }
            className="h-8 gap-1.5 text-xs border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-500/40"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Element
          </Button>
        </div>
      )}

      {/* Unplaced fields notice */}
      {availableFields.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <p className="text-xs text-amber-400">
            <strong>{availableFields.length} unplaced field{availableFields.length > 1 ? "s" : ""}:</strong>{" "}
            {availableFields.map((f) => f.name).join(", ")}.
            These will appear in a fallback section at the bottom of the form.
          </p>
        </div>
      )}

      {/* Add Element Drawer */}
      <AddElementDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        fields={fields}
        placedSlugs={placedSlugs}
        onAdd={(el) => {
          drawerState?.addFn(el);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ElementRow — renders a single layout element (dispatches on type)
// ---------------------------------------------------------------------------

function ElementRow({
  element,
  index,
  total,
  fields,
  onMove,
  onRemove,
  onPatch,
  openDrawer,
  placedSlugs,
  isDragOver,
  isDragging,
}: {
  element: FormElement;
  index: number;
  total: number;
  fields: SchemaField[];
  onMove: (dir: "up" | "down") => void;
  onRemove: () => void;
  onPatch: (patch: Partial<FormElement>) => void;
  openDrawer: (addFn: DrawerAddFn) => void;
  placedSlugs: Set<string>;
  isDragOver?: boolean;
  isDragging?: boolean;
}) {
  if (element.type === "field") {
    const def = fields.find((f) => f.slug === element.fieldSlug);
    const widgetOptions = def ? widgetOptionsForFieldType(def.field_type) : ["auto" as FieldWidget];
    const currentWidget = element.widget ?? "auto";

    return (
      <div className={cn("flex items-center gap-2 rounded-lg border bg-white dark:bg-gray-900 px-3 py-2.5 transition-colors h-full cursor-grab", isDragOver ? "border-blue-400 bg-blue-50 dark:bg-blue-950/30" : "border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700", isDragging && "opacity-50")}>
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

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Widget selector */}
          {widgetOptions.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button className="text-xs px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-blue-500/40 hover:text-blue-500 transition-colors font-mono" />
                }
              >
                {WIDGET_LABELS[currentWidget]}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-28">
                {widgetOptions.map((w) => (
                  <DropdownMenuItem
                    key={w}
                    onClick={() => onPatch({ widget: w })}
                    className={`text-xs font-mono ${w === currentWidget ? "text-blue-500" : ""}`}
                  >
                    {w === currentWidget && <span className="mr-1">✓</span>}
                    {WIDGET_LABELS[w]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="text-xs px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 font-mono">
              auto
            </span>
          )}
        </div>

        <MoveControls index={index} total={total} onMove={onMove} onRemove={onRemove} />
      </div>
    );
  }

  if (element.type === "note") {
    return (
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <AlignLeft className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-xs font-medium text-blue-400">Note / Helper text</span>
          </div>
          <MoveControls index={index} total={total} onMove={onMove} onRemove={onRemove} />
        </div>
        <textarea
          value={element.text}
          onChange={(e) => onPatch({ text: e.target.value })}
          placeholder="Enter helper text visible to users filling in the form…"
          rows={2}
          className="w-full rounded-md border border-blue-500/20 bg-transparent px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-500/50 dark:placeholder:text-gray-400/40 focus:outline-none focus:ring-1 focus:ring-blue-500/40 resize-none"
        />
      </div>
    );
  }

  if (element.type === "button") {
    return (
      <div className="rounded-lg border border-green-500/20 bg-green-500/5 px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ExternalLink className="h-3.5 w-3.5 text-green-400" />
            <span className="text-xs font-medium text-green-400">Button Link</span>
          </div>
          <MoveControls index={index} total={total} onMove={onMove} onRemove={onRemove} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Label</p>
            <Input
              value={element.label}
              onChange={(e) => onPatch({ label: e.target.value })}
              placeholder="Button text"
              className="h-7 text-xs bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">URL (opens in new tab)</p>
            <Input
              value={element.url}
              onChange={(e) => onPatch({ url: e.target.value })}
              placeholder="https://…"
              className="h-7 text-xs bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
            />
          </div>
        </div>
      </div>
    );
  }

  if (element.type === "divider") {
    return (
      <div className="flex items-center gap-2 py-2">
        <div className="flex-1 border-t border-dashed border-gray-200 dark:border-gray-700" />
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-gray-400 dark:text-gray-500">Divider</span>
          <MoveControls index={index} total={total} onMove={onMove} onRemove={onRemove} />
        </div>
        <div className="flex-1 border-t border-dashed border-gray-200 dark:border-gray-700" />
      </div>
    );
  }

  if (element.type === "tab-group") {
    return (
      <TabGroupRow
        element={element}
        index={index}
        total={total}
        fields={fields}
        onMove={onMove}
        onRemove={onRemove}
        onPatch={onPatch}
        openDrawer={openDrawer}
        placedSlugs={placedSlugs}
      />
    );
  }

  if (element.type === "column-group") {
    return (
      <div className={cn("rounded-lg border border-green-500/30 bg-green-50/30 dark:bg-green-950/20 p-3 space-y-2", isDragOver && "border-blue-400", isDragging && "opacity-50")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GripVertical className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500 cursor-grab shrink-0" />
            <span className="text-xs font-medium text-green-700 dark:text-green-400">
              {element.columns}-Column Layout
            </span>
          </div>
          <button onClick={onRemove} className="p-0.5 text-gray-500 dark:text-gray-400 hover:text-red-400 rounded" title="Remove">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className={`grid gap-2 ${element.columns === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
          {element.slots.map((slot, colIdx) => {
            const availableForSlot = fields.filter((f) => !placedSlugs.has(f.slug));
            return (
              <div
                key={colIdx}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const fieldSlug = e.dataTransfer.getData("fieldSlug");
                  if (!fieldSlug || placedSlugs.has(fieldSlug)) return;
                  const newSlots = element.slots.map((s, si) =>
                    si === colIdx ? [...s, { type: "field" as const, fieldSlug, width: "full" as const }] : s
                  );
                  onPatch({ slots: newSlots } as Partial<FormElementColumnGroup>);
                }}
                className="min-h-[60px] rounded border border-dashed border-gray-300 dark:border-gray-600 p-2 space-y-1"
              >
                <p className="text-[10px] text-gray-500 dark:text-gray-400">Col {colIdx + 1}</p>
                {slot.map((slotEl, slotIdx) => {
                  const f = fields.find((fi) => fi.slug === slotEl.fieldSlug);
                  return (
                    <div key={slotIdx} className="flex items-center justify-between gap-1 bg-white dark:bg-gray-800 rounded px-2 py-1 border border-gray-200 dark:border-gray-700 text-xs">
                      <span className="text-gray-900 dark:text-gray-100 truncate">{f?.name ?? slotEl.fieldSlug}</span>
                      <button
                        onClick={() => {
                          const newSlots = element.slots.map((s, si) =>
                            si === colIdx ? s.filter((_, fi) => fi !== slotIdx) : s
                          );
                          onPatch({ slots: newSlots } as Partial<FormElementColumnGroup>);
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
                    <DropdownMenuContent align="start" className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 max-h-48 overflow-y-auto">
                      {availableForSlot.map((f) => (
                        <DropdownMenuItem
                          key={f.slug}
                          onClick={() => {
                            const newSlots = element.slots.map((s, si) =>
                              si === colIdx ? [...s, { type: "field" as const, fieldSlug: f.slug, width: "full" as const }] : s
                            );
                            onPatch({ slots: newSlots } as Partial<FormElementColumnGroup>);
                          }}
                          className="text-sm cursor-pointer gap-2"
                        >
                          <span className="text-gray-900 dark:text-gray-100">{f.name}</span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">{FIELD_TYPE_LABELS[f.field_type] ?? f.field_type}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 italic text-center py-1">No fields available</p>
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
// TabGroupRow — nested mini-builder for tab-group elements
// ---------------------------------------------------------------------------

function TabGroupRow({
  element,
  index,
  total,
  fields,
  onMove,
  onRemove,
  onPatch,
  openDrawer,
  placedSlugs,
}: {
  element: FormElementTabGroup;
  index: number;
  total: number;
  fields: SchemaField[];
  onMove: (dir: "up" | "down") => void;
  onRemove: () => void;
  onPatch: (patch: Partial<FormElement>) => void;
  openDrawer: (addFn: DrawerAddFn) => void;
  placedSlugs: Set<string>;
}) {
  const [activeNestedTabId, setActiveNestedTabId] = useState(element.tabs[0]?.id ?? "");
  const activeNestedTab = element.tabs.find((t) => t.id === activeNestedTabId) ?? element.tabs[0];

  function patchTabGroup(updater: (tg: FormElementTabGroup) => FormElementTabGroup) {
    const updated = updater(element);
    onPatch({ tabs: updated.tabs } as Partial<FormElementTabGroup>);
  }

  function addNestedTab() {
    const t: FormTab = { id: genId(), label: "New Tab", elements: [] };
    patchTabGroup((tg) => ({ ...tg, tabs: [...tg.tabs, t] }));
    setActiveNestedTabId(t.id);
  }

  function deleteNestedTab(tabId: string) {
    if (element.tabs.length <= 1) return;
    const next = element.tabs.filter((t) => t.id !== tabId);
    patchTabGroup(() => ({ ...element, tabs: next }));
    if (activeNestedTabId === tabId) setActiveNestedTabId(next[0].id);
  }

  function updateNestedTabLabel(tabId: string, label: string) {
    patchTabGroup((tg) => ({
      ...tg,
      tabs: tg.tabs.map((t) => (t.id === tabId ? { ...t, label } : t)),
    }));
  }

  function appendToNestedTab(tabId: string, el: FormElement) {
    patchTabGroup((tg) => ({
      ...tg,
      tabs: tg.tabs.map((t) =>
        t.id === tabId ? { ...t, elements: [...t.elements, el] } : t
      ),
    }));
  }

  function moveNestedElement(tabId: string, idx: number, dir: "up" | "down") {
    patchTabGroup((tg) => ({
      ...tg,
      tabs: tg.tabs.map((t) => {
        if (t.id !== tabId) return t;
        const arr = [...t.elements];
        const to = dir === "up" ? idx - 1 : idx + 1;
        if (to < 0 || to >= arr.length) return t;
        [arr[idx], arr[to]] = [arr[to], arr[idx]];
        return { ...t, elements: arr };
      }),
    }));
  }

  function removeNestedElement(tabId: string, idx: number) {
    patchTabGroup((tg) => ({
      ...tg,
      tabs: tg.tabs.map((t) =>
        t.id === tabId ? { ...t, elements: t.elements.filter((_, i) => i !== idx) } : t
      ),
    }));
  }

  function patchNestedElement(tabId: string, idx: number, patch: Partial<FormElement>) {
    patchTabGroup((tg) => ({
      ...tg,
      tabs: tg.tabs.map((t) => {
        if (t.id !== tabId) return t;
        return {
          ...t,
          elements: t.elements.map((el, i) =>
            i === idx ? ({ ...el, ...patch } as FormElement) : el
          ),
        };
      }),
    }));
  }

  return (
    <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-purple-400" />
          <span className="text-xs font-medium text-purple-400">Tab Group</span>
        </div>
        <MoveControls index={index} total={total} onMove={onMove} onRemove={onRemove} />
      </div>

      {/* Nested tab bar */}
      <div className="flex items-center gap-0 border-b border-purple-500/20">
        {element.tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveNestedTabId(t.id)}
            className={`px-3 py-1.5 text-xs transition-colors -mb-px ${
              t.id === activeNestedTabId
                ? "text-purple-400 border-b-2 border-purple-400 font-medium"
                : "text-gray-500 dark:text-gray-400 hover:text-purple-400"
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={addNestedTab}
          className="px-2 py-1.5 text-gray-400 dark:text-gray-500 hover:text-purple-400 transition-colors"
          title="Add nested tab"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Nested tab settings */}
      {activeNestedTab && (
        <div className="flex items-center gap-2">
          <Input
            value={activeNestedTab.label}
            onChange={(e) => updateNestedTabLabel(activeNestedTab.id, e.target.value)}
            className="h-7 text-xs bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 w-36"
          />
          {element.tabs.length > 1 && (
            <button
              onClick={() => deleteNestedTab(activeNestedTab.id)}
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              <Minus className="h-3 w-3" />
              Delete
            </button>
          )}
        </div>
      )}

      {/* Nested elements grid */}
      {activeNestedTab && (
        <div className="grid grid-cols-2 gap-2">
          {activeNestedTab.elements.length === 0 && (
            <div className="col-span-2 rounded border border-dashed border-purple-500/20 py-6 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">No elements yet.</p>
            </div>
          )}
          {activeNestedTab.elements.map((el, idx) => {
            const span = el.type === "field" && el.width === "half" ? "col-span-1" : "col-span-2";
            return (
              <div key={idx} className={span}>
                <ElementRow
                  element={el}
                  index={idx}
                  total={activeNestedTab.elements.length}
                  fields={fields}
                  onMove={(dir) => moveNestedElement(activeNestedTab.id, idx, dir)}
                  onRemove={() => removeNestedElement(activeNestedTab.id, idx)}
                  onPatch={(patch) => patchNestedElement(activeNestedTab.id, idx, patch)}
                  openDrawer={openDrawer}
                  placedSlugs={placedSlugs}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Add element to nested tab */}
      {activeNestedTab && (
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            openDrawer((el) => appendToNestedTab(activeNestedTab.id, el))
          }
          className="h-7 gap-1 text-xs border-purple-500/30 text-purple-400 hover:bg-purple-500/10 hover:text-purple-300"
        >
          <Plus className="h-3 w-3" />
          Add Element
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MoveControls — up / down / remove
// ---------------------------------------------------------------------------

function MoveControls({
  index,
  total,
  onMove,
  onRemove,
}: {
  index: number;
  total: number;
  onMove: (dir: "up" | "down") => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <button
        onClick={() => onMove("up")}
        disabled={index === 0}
        className="p-1 rounded text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-25 transition-colors"
        title="Move up"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => onMove("down")}
        disabled={index === total - 1}
        className="p-1 rounded text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-25 transition-colors"
        title="Move down"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onRemove}
        className="p-1 rounded text-gray-400 dark:text-gray-500 hover:text-red-400 transition-colors"
        title="Remove"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddElementDrawer — Sheet-based element picker
// ---------------------------------------------------------------------------

function AddElementDrawer({
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
  onAdd: (el: FormElement) => void;
}) {
  const availableFields = fields.filter((f) => !placedSlugs.has(f.slug));
  const placedFields = fields.filter((f) => placedSlugs.has(f.slug));

  function addField(slug: string) {
    onAdd({ type: "field", fieldSlug: slug, width: "full" } as FormElementField);
  }

  function addNote() {
    onAdd({ type: "note", text: "" } as FormElementNote);
  }

  function addButton() {
    onAdd({ type: "button", label: "Open Link", url: "" } as FormElementButton);
  }

  function addDivider() {
    onAdd({ type: "divider" });
  }

  function addTabGroup() {
    onAdd({
      type: "tab-group",
      tabs: [{ id: genId(), label: "Tab 1", elements: [] }],
    } as FormElementTabGroup);
  }

  function addColumnGroup(columns: 2 | 3) {
    onAdd({
      type: "column-group",
      id: genId(),
      columns,
      slots: Array.from({ length: columns }, () => []),
    } as FormElementColumnGroup);
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
          {/* FIELDS section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Fields
              </p>
              {availableFields.length === 0 && (
                <Badge variant="outline" className="text-xs text-gray-400 border-gray-300 dark:border-gray-700">
                  All placed
                </Badge>
              )}
            </div>

            {availableFields.length === 0 && placedFields.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 italic">No fields in this collection yet.</p>
            )}

            {availableFields.map((f) => (
              <button
                key={f.slug}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("fieldSlug", f.slug)}
                onClick={() => addField(f.slug)}
                className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group cursor-grab"
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

          {/* LAYOUT section */}
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
              Layout
            </p>
            <button
              onClick={addNote}
              className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
            >
              <AlignLeft className="h-4 w-4 text-blue-400 shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-gray-900 dark:text-gray-100">Note / Helper text</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">Informational text for users</p>
              </div>
              <Plus className="h-3.5 w-3.5 text-blue-400 opacity-0 group-hover:opacity-100 shrink-0" />
            </button>
            <button
              onClick={addDivider}
              className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
            >
              <Minus className="h-4 w-4 text-gray-400 shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-gray-900 dark:text-gray-100">Divider</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">Horizontal separator line</p>
              </div>
              <Plus className="h-3.5 w-3.5 text-blue-400 opacity-0 group-hover:opacity-100 shrink-0" />
            </button>
            <button
              onClick={addTabGroup}
              className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
            >
              <Layers className="h-4 w-4 text-purple-400 shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-gray-900 dark:text-gray-100">Tab Group</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">Nested tabs within this tab</p>
              </div>
              <Plus className="h-3.5 w-3.5 text-blue-400 opacity-0 group-hover:opacity-100 shrink-0" />
            </button>
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

          {/* ACTIONS section */}
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
              Actions
            </p>
            <button
              onClick={addButton}
              className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
            >
              <ExternalLink className="h-4 w-4 text-green-400 shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-gray-900 dark:text-gray-100">Button / Link</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">External link that opens in new tab</p>
              </div>
              <Plus className="h-3.5 w-3.5 text-blue-400 opacity-0 group-hover:opacity-100 shrink-0" />
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
