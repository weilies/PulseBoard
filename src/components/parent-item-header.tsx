"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { EditItemDialog, type Field, type CatalogItems } from "@/components/item-form-dialog";
import type { TenantLanguage } from "@/types/translations";
import type { ParentRecordLayout } from "@/types/parent-record-layout";
import type { FormLayout } from "@/types/form-layout";
import { getFieldLabel } from "@/lib/i18n";
import { formatDate, formatDatetime } from "@/lib/timezone-constants";
import { FileCellDownload } from "@/components/file-cell-download";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { toast } from "sonner";
import { deleteItem } from "@/app/actions/studio";

type Item = {
  id: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

interface Props {
  item: Item;
  fields: Field[];
  displayTitle: string;
  collectionSlug: string;
  collectionId: string;
  collectionType: string;
  catalogItems: CatalogItems;
  relatedLabels: Record<string, Record<string, string>>;
  timezone: string;
  currentLocale: string;
  canWrite: boolean;
  tenantLanguages: TenantLanguage[];
  displayKeyFields: string[];
  parentLayout?: ParentRecordLayout | null;
  formLayout?: FormLayout | null;
}

function renderValue(
  field: Field,
  value: unknown,
  catalogItems: CatalogItems,
  relatedLabels: Record<string, Record<string, string>>,
  timezone: string,
): string | React.ReactNode {
  if (value === null || value === undefined || value === "") return "—";
  switch (field.field_type) {
    case "boolean":
      return value ? "Yes" : "No";
    case "date":
      return formatDate(value as string);
    case "datetime":
      return formatDatetime(value as string, timezone);
    case "select": {
      const slug = field.options?.catalog_slug as string | undefined;
      if (slug && catalogItems[slug]) {
        const found = catalogItems[slug].find((i) => i.value === value);
        return found?.label ?? String(value);
      }
      return String(value);
    }
    case "relation": {
      const id = String(value);
      return relatedLabels[field.slug]?.[id] ?? id.slice(0, 8);
    }
    case "file":
      return <FileCellDownload path={String(value)} />;
    default:
      return String(value).slice(0, 100);
  }
}

export function ParentItemHeader({
  item,
  fields,
  displayTitle,
  collectionSlug,
  collectionId,
  collectionType,
  catalogItems,
  relatedLabels,
  timezone,
  currentLocale,
  canWrite,
  tenantLanguages,
  displayKeyFields,
  parentLayout,
  formLayout,
}: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const fd = new FormData();
    fd.set("item_id", item.id);
    fd.set("collection_slug", collectionSlug);
    const result = await deleteItem(fd);
    setDeleting(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Record deleted");
    setDeleteOpen(false);
    router.push(`/dashboard/studio/collections/${collectionSlug}/items`);
  }

  // Use configured parent layout or fall back to default logic
  const renderContent = () => {
    if (parentLayout?.elements && parentLayout.elements.length > 0) {
      const hasColumnGroups = parentLayout.elements.some((el) => el.type === "column-group");

      const h2 = (
        <h2
          className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4"
          style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
        >
          {displayTitle}
        </h2>
      );

      if (hasColumnGroups) {
        // New format: column-groups + full-width field elements
        return (
          <div>
            {h2}
            <div className="space-y-3">
              {parentLayout.elements.map((el, elIdx) => {
                if (el.type === "column-group") {
                  return (
                    <div
                      key={elIdx}
                      className={`grid gap-4 ${el.columns === 2 ? "grid-cols-2" : "grid-cols-3"}`}
                    >
                      {el.slots.map((slot, slotIdx) => (
                        <div key={slotIdx} className="space-y-2">
                          {slot.map((slotField) => {
                            const field = fields.find((f) => f.slug === slotField.fieldSlug);
                            if (!field) return null;
                            const val = item.data[field.slug];
                            const rendered = renderValue(field, val, catalogItems, relatedLabels, timezone);
                            return (
                              <div key={slotField.fieldSlug} className="flex flex-col gap-1">
                                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                                  {getFieldLabel(field, currentLocale)}
                                </span>
                                <div className="text-sm text-gray-900 dark:text-gray-100">
                                  {rendered === "—" ? <span className="text-gray-500 dark:text-gray-400">—</span> : rendered}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  );
                }
                if (el.type === "field") {
                  const field = fields.find((f) => f.slug === el.fieldSlug);
                  if (!field) return null;
                  const val = item.data[field.slug];
                  const rendered = renderValue(field, val, catalogItems, relatedLabels, timezone);
                  return (
                    <div key={elIdx} className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                        {getFieldLabel(field, currentLocale)}
                      </span>
                      <div className="text-sm text-gray-900 dark:text-gray-100">
                        {rendered === "—" ? <span className="text-gray-500 dark:text-gray-400">—</span> : rendered}
                      </div>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        );
      }

      // Legacy format: flat list of field elements with optional width for a 3-col grid
      return (
        <div>
          {h2}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {parentLayout.elements.map((el, elIdx) => {
              if (el.type !== "field") return null;
              const field = fields.find((f) => f.slug === el.fieldSlug);
              if (!field) return null;
              const val = item.data[field.slug];
              const rendered = renderValue(field, val, catalogItems, relatedLabels, timezone);
              const colClass =
                el.width === "1" ? "col-span-1" : el.width === "2" ? "col-span-2" : "col-span-3";
              return (
                <div key={elIdx} className={colClass}>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                      {getFieldLabel(field, currentLocale)}
                    </span>
                    <div className="text-sm text-gray-900 dark:text-gray-100">
                      {rendered === "—" ? (
                        <span className="text-gray-500 dark:text-gray-400">—</span>
                      ) : (
                        rendered
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // Default fallback: show display title + summary fields (6 max)
    const summaryFields = fields.filter((f) => {
      // Skip child_of relation fields (those are shown in tabs)
      if (f.field_type === "relation" && f.options?.relationship_style === "child_of") return false;
      // Skip file, json, richtext from summary
      if (["file", "json", "richtext"].includes(f.field_type)) return false;
      return true;
    });

    const visibleFields = summaryFields.slice(0, 6);

    return (
      <>
        <h2
          className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate"
          style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
        >
          {displayTitle}
        </h2>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
          {visibleFields.map((f) => {
            const val = item.data[f.slug];
            const displayed = renderValue(f, val, catalogItems, relatedLabels, timezone);
            // Skip displaying if it's already in the title
            if (displayKeyFields.includes(f.slug)) return null;
            return (
              <span key={f.slug} className="text-sm text-gray-500 dark:text-gray-400">
                <span className="text-gray-400 dark:text-gray-500">{getFieldLabel(f, currentLocale)}:</span>{" "}
                <span className="text-gray-700 dark:text-gray-300">{displayed}</span>
              </span>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">{renderContent()}</div>
          {canWrite && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(true)}
              className="shrink-0 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-600 gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {canWrite && (
        <>
          <EditItemDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            item={{ id: item.id, data: item.data }}
            fields={fields}
            collectionId={collectionId}
            collectionSlug={collectionSlug}
            catalogItems={catalogItems}
            tenantLanguages={tenantLanguages}
            currentLocale={currentLocale}
            timezone={timezone}
            formLayout={formLayout}
            onDeleteRequest={() => { setEditOpen(false); setDeleteOpen(true); }}
          />

          {/* Delete confirmation dialog */}
          <ConfirmActionDialog
            isOpen={deleteOpen}
            severity="danger"
            message={`Delete "${displayTitle}"? This action cannot be undone.`}
            confirmLabel="Delete"
            cancelLabel="Cancel"
            confirmVariant="destructive"
            onConfirm={handleDelete}
            onCancel={() => setDeleteOpen(false)}
            isLoading={deleting}
          />
        </>
      )}
    </>
  );
}
