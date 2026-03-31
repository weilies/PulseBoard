"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { GripVertical } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { reorderFields } from "@/app/actions/studio";
import { FieldActions } from "@/components/field-actions";
import { getFieldLabel } from "@/lib/i18n";

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  datetime: "Date & Time",
  boolean: "Toggle",
  file: "File",
  select: "Select",
  multiselect: "Multi-Select",
  richtext: "Rich Text",
  json: "JSON",
  relation: "Relation",
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
  json: "border-zinc-500/40 text-zinc-400",
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

interface DraggableFieldListProps {
  fields: Field[];
  collectionId: string;
  collectionSlug: string;
  allCollections: { id: string; name: string; slug: string }[];
  canEdit: boolean;
  currentLocale: string;
}

export function DraggableFieldList({
  fields: initialFields,
  collectionId,
  collectionSlug,
  allCollections,
  canEdit,
  currentLocale,
}: DraggableFieldListProps) {
  const router = useRouter();
  const [fields, setFields] = useState(initialFields);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleDrop() {
    if (!draggedId) return;

    const reorderedFieldIds = fields.map((f) => f.id);
    setDraggedId(null);
    setDragOverId(null);

    startTransition(async () => {
      const result = await reorderFields(reorderedFieldIds, collectionSlug);
      if (!result.error) {
        router.refresh();
      }
    });
  }

  function handleDragStart(fieldId: string) {
    setDraggedId(fieldId);
  }

  function handleDragOver(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    if (draggedId && draggedId !== targetId) {
      const draggedIndex = fields.findIndex((f) => f.id === draggedId);
      const targetIndex = fields.findIndex((f) => f.id === targetId);

      if (draggedIndex !== -1 && targetIndex !== -1) {
        const newFields = [...fields];
        [newFields[draggedIndex], newFields[targetIndex]] = [newFields[targetIndex], newFields[draggedIndex]];
        setFields(newFields);
      }
    }
    setDragOverId(targetId);
  }

  function handleDragLeave() {
    setDragOverId(null);
  }

  return (
    <div className="space-y-2">
      {fields.map((field, index) => (
        <DraggableFieldRow
          key={field.id}
          field={field}
          index={index}
          total={fields.length}
          collectionId={collectionId}
          collectionSlug={collectionSlug}
          allCollections={allCollections}
          canEdit={canEdit}
          currentLocale={currentLocale}
          isDragged={draggedId === field.id}
          isDraggedOver={dragOverId === field.id}
          onDragStart={() => handleDragStart(field.id)}
          onDragOver={(e) => handleDragOver(e, field.id)}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          isReordering={isPending}
        />
      ))}
    </div>
  );
}

interface DraggableFieldRowProps {
  field: Field;
  index: number;
  total: number;
  collectionId: string;
  collectionSlug: string;
  allCollections: { id: string; name: string; slug: string }[];
  canEdit: boolean;
  currentLocale: string;
  isDragged: boolean;
  isDraggedOver: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: () => void;
  isReordering: boolean;
}

function DraggableFieldRow({
  field,
  index,
  total,
  collectionId,
  collectionSlug,
  allCollections,
  canEdit,
  currentLocale,
  isDragged,
  isDraggedOver,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  isReordering,
}: DraggableFieldRowProps) {
  const opts = field.options as Record<string, unknown>;
  const typeColor = FIELD_TYPE_COLORS[field.field_type] ?? "border-zinc-500/40 text-zinc-400";

  let relationDetail: string | null = null;
  let relationStyle: string | null = null;
  if (field.field_type === "relation" && opts?.relation_type) {
    const relCol = allCollections.find((c) => c.id === opts.related_collection_id);
    const relLabel = relCol ? relCol.name : "unknown";
    const displayField = opts.display_field ? ` (shows: ${opts.display_field})` : "";
    relationDetail = `${String(opts.relation_type).toUpperCase()} → ${relLabel}${displayField}`;
    const style = opts.relationship_style as string | undefined;
    if (style === "child_of") relationStyle = "Child of";
    else if (style === "link") relationStyle = "Link";
  }

  return (
    <div
      draggable={canEdit}
      onDragStart={canEdit ? onDragStart : undefined}
      onDragOver={canEdit ? onDragOver : undefined}
      onDragLeave={canEdit ? onDragLeave : undefined}
      onDrop={canEdit ? onDrop : undefined}
      className={`flex items-center gap-3 rounded-lg border bg-white dark:bg-gray-900 px-4 py-3 transition-all ${
        isDragged
          ? "opacity-50 border-blue-400 dark:border-blue-400"
          : isDraggedOver
            ? "border-blue-500 dark:border-blue-500 bg-blue-50 dark:bg-blue-950/30"
            : "border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50"
      } ${canEdit ? "cursor-grab active:cursor-grabbing" : ""} ${isReordering ? "opacity-75" : ""}`}
    >
      {canEdit && (
        <GripVertical className="h-4 w-4 text-gray-500 dark:text-gray-400/40 flex-shrink-0 cursor-grab active:cursor-grabbing" />
      )}
      {!canEdit && <div className="h-4 w-4 flex-shrink-0" />}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{getFieldLabel(field, currentLocale)}</span>
          <code className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded px-1 font-mono">
            {field.slug}
          </code>
          <Badge variant="outline" className={`text-xs ${typeColor}`}>
            {FIELD_TYPE_LABELS[field.field_type] ?? field.field_type}
          </Badge>
          {field.is_required && (
            <Badge variant="outline" className="text-xs border-red-500/40 text-red-400">
              Required
            </Badge>
          )}
          {field.is_unique && (
            <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-400">
              Unique
            </Badge>
          )}
          {field.is_translatable && (
            <Badge variant="outline" className="text-xs border-violet-500/40 text-violet-400">
              i18n
            </Badge>
          )}
          {relationDetail && <span className="text-xs text-blue-600 dark:text-blue-400/70">{relationDetail}</span>}
          {relationStyle && (
            <Badge variant="outline" className="text-xs border-emerald-500/40 text-emerald-600">
              {relationStyle}
            </Badge>
          )}
        </div>
      </div>

      {canEdit && (
        <FieldActions
          fieldId={field.id}
          fieldName={field.name}
          fieldType={field.field_type}
          fieldOptions={field.options}
          fieldIsRequired={field.is_required}
          fieldIsUnique={field.is_unique}
          fieldIsTranslatable={field.is_translatable}
          sortOrder={field.sort_order}
          collectionId={collectionId}
          collectionSlug={collectionSlug}
          isFirst={index === 0}
          isLast={index === total - 1}
          allCollections={allCollections}
          showInGrid={field.show_in_grid}
        />
      )}
    </div>
  );
}
