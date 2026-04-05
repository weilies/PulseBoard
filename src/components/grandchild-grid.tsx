"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { createItem, deleteItem } from "@/app/actions/studio";
import { EditItemDialog, ItemFormFields, type Field, type CatalogItems } from "@/components/item-form-dialog";
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
import type { TenantLanguage } from "@/types/translations";
import type { GrandchildData } from "@/app/actions/relations";
import { fetchGrandchildItems } from "@/app/actions/relations";

const GRANDCHILD_PAGE_SIZE = 5;
import { getFieldLabel } from "@/lib/i18n";
import { formatDate, formatDatetime, datetimeLocalToISO } from "@/lib/timezone-constants";

function renderGrandchildCellValue(
  fieldType: string,
  value: unknown,
  options: Record<string, unknown>,
  catalogItems: CatalogItems,
  timezone: string,
): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (fieldType) {
    case "boolean":
      return value ? "Yes" : "No";
    case "date":
      return formatDate(value as string);
    case "datetime":
      return formatDatetime(value as string, timezone);
    case "select": {
      const slug = options?.catalog_slug as string | undefined;
      if (slug && catalogItems[slug]) {
        const found = catalogItems[slug].find((i) => i.value === value);
        return found?.label ?? String(value);
      }
      return String(value);
    }
    case "number":
      return String(value);
    default:
      return String(value).slice(0, 60);
  }
}

interface GrandchildGridProps {
  grandchild: GrandchildData;
  parentItemId: string;
  canWrite: boolean;
  timezone: string;
  currentLocale: string;
  tenantLanguages: TenantLanguage[];
}

export function GrandchildGrid({
  grandchild,
  parentItemId,
  canWrite,
  timezone,
  currentLocale,
  tenantLanguages,
}: GrandchildGridProps) {
  const { collection: gc, items: initialItems, total: initialTotal, fields, catalogItems, effectiveDateField } = grandchild;

  const [pageItems, setPageItems] = useState(initialItems);
  const [localTotal, setLocalTotal] = useState(initialTotal);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingPage, setLoadingPage] = useState(false);
  const totalPages = Math.ceil(localTotal / GRANDCHILD_PAGE_SIZE);

  async function refreshGrid(goToPage = 1) {
    setLoadingPage(true);
    const result = await fetchGrandchildItems(parentItemId, gc.id, gc.fieldSlug, goToPage);
    setLoadingPage(false);
    if (result.data) {
      setPageItems(result.data.items);
      setLocalTotal(result.data.total);
      setCurrentPage(goToPage);
    }
  }

  async function handlePageChange(newPage: number) {
    await refreshGrid(newPage);
  }

  // Filter out the parent relation field from display
  const displayFields = fields.filter((f) => {
    if (f.slug === gc.fieldSlug) return false;
    if (["file", "richtext", "json"].includes(f.field_type)) return false;
    return true;
  });

  // Show up to 5 columns to keep it compact
  const visibleFields = displayFields.slice(0, 5);

  // Effective date: most recent <= today is "Current"
  let currentItemId: string | null = null;
  if (effectiveDateField && pageItems.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const eligible = pageItems
      .filter((item) => {
        const d = item.data[effectiveDateField] as string | undefined;
        return d && d <= today;
      })
      .sort((a, b) => {
        const aD = (a.data[effectiveDateField] as string) ?? "";
        const bD = (b.data[effectiveDateField] as string) ?? "";
        return bD.localeCompare(aD);
      });
    if (eligible.length > 0) currentItemId = eligible[0].id;
  }

  return (
    <div className="ml-8 mr-4 my-2 rounded border border-blue-100 dark:border-blue-900/30 bg-blue-50/30 dark:bg-gray-800/50">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
          {gc.name}
          <span className="ml-1.5 text-gray-400 dark:text-gray-500 font-normal">({localTotal})</span>
        </span>
        {canWrite && (
          <AddGrandchildDialog
            parentItemId={parentItemId}
            parentFieldSlug={gc.fieldSlug}
            fields={fields as Field[]}
            collectionId={gc.id}
            collectionSlug={gc.slug}
            catalogItems={catalogItems}
            timezone={timezone}
            onAdded={() => refreshGrid(1)}
          />
        )}
      </div>

      {/* Compact grid */}
      {pageItems.length === 0 ? (
        <div className="px-3 pb-3 text-xs text-gray-400 dark:text-gray-500">
          No records.{canWrite ? " Click \"+ Add\" to create one." : ""}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="border-blue-100 dark:border-blue-900/30 hover:bg-transparent">
                <TableHead className="text-gray-500 dark:text-gray-400 py-1 px-2 w-8">#</TableHead>
                {visibleFields.map((f) => (
                  <TableHead key={f.id} className="text-gray-500 dark:text-gray-400 py-1 px-2 whitespace-nowrap">
                    {getFieldLabel(f as Field, currentLocale)}
                  </TableHead>
                ))}
                {effectiveDateField && <TableHead className="text-gray-500 dark:text-gray-400 py-1 px-2 w-16">Status</TableHead>}
                {canWrite && <TableHead className="py-1 px-2 w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((item, idx) => {
                const isCurrent = item.id === currentItemId;
                const isHistorical = effectiveDateField && !isCurrent && currentItemId !== null;
                return (
                  <GrandchildRow
                    key={item.id}
                    item={item}
                    index={idx}
                    visibleFields={visibleFields}
                    allFields={fields as Field[]}
                    catalogItems={catalogItems}
                    timezone={timezone}
                    currentLocale={currentLocale}
                    isCurrent={isCurrent}
                    isHistorical={!!isHistorical}
                    effectiveDateField={effectiveDateField}
                    canWrite={canWrite}
                    collectionId={gc.id}
                    collectionSlug={gc.slug}
                    tenantLanguages={tenantLanguages}
                    onDeleted={() => refreshGrid(currentPage)}
                    onSaved={() => refreshGrid(currentPage)}
                  />
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 pb-2 pt-1 border-t border-blue-100 dark:border-blue-900/30">
          <span className="text-xs text-gray-400 dark:text-gray-500">{localTotal} records</span>
          <div className="flex items-center gap-1.5">
            <button
              disabled={currentPage === 1 || loadingPage}
              onClick={() => handlePageChange(currentPage - 1)}
              className="h-5 w-5 inline-flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-100/50 dark:hover:bg-blue-900/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs"
            >
              ←
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
              {loadingPage ? "…" : `${currentPage} / ${totalPages}`}
            </span>
            <button
              disabled={currentPage === totalPages || loadingPage}
              onClick={() => handlePageChange(currentPage + 1)}
              className="h-5 w-5 inline-flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-100/50 dark:hover:bg-blue-900/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GrandchildRow
// ---------------------------------------------------------------------------

function GrandchildRow({
  item,
  index,
  visibleFields,
  allFields,
  catalogItems,
  timezone,
  currentLocale,
  isCurrent,
  isHistorical,
  effectiveDateField,
  canWrite,
  collectionId,
  collectionSlug,
  tenantLanguages,
  onDeleted,
  onSaved,
}: {
  item: { id: string; data: Record<string, unknown>; created_at: string; updated_at: string };
  index: number;
  visibleFields: GrandchildData["fields"];
  allFields: Field[];
  catalogItems: CatalogItems;
  timezone: string;
  currentLocale: string;
  isCurrent: boolean;
  isHistorical: boolean;
  effectiveDateField?: string;
  canWrite: boolean;
  collectionId: string;
  collectionSlug: string;
  tenantLanguages: TenantLanguage[];
  onDeleted: () => void;
  onSaved: () => void;
}) {
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
    onDeleted();
  }

  return (
    <>
      <TableRow
        className={`border-blue-100 dark:border-blue-900/30 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 ${
          index % 2 === 0 ? "bg-transparent" : "bg-blue-50/20 dark:bg-blue-900/10"
        } ${isHistorical ? "opacity-50" : ""}`}
      >
        <TableCell className="text-gray-400 dark:text-gray-500 py-1 px-2">{index + 1}</TableCell>
        {visibleFields.map((f) => {
          const value = item.data?.[f.slug];
          return (
            <TableCell key={f.id} className="text-gray-900 dark:text-gray-100 py-1 px-2 max-w-[120px]">
              <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
                {renderGrandchildCellValue(f.field_type, value, f.options, catalogItems, timezone)}
              </span>
            </TableCell>
          );
        })}
        {effectiveDateField && (
          <TableCell className="py-1 px-2">
            {isCurrent ? (
              <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/40 text-[10px] px-1 py-0">
                Current
              </Badge>
            ) : isHistorical ? (
              <span className="text-[10px] text-gray-400 dark:text-gray-500">Historical</span>
            ) : null}
          </TableCell>
        )}
        {canWrite && (
          <TableCell className="text-right py-1 px-2">
            <div className="flex items-center gap-0.5 justify-end">
              <button
                onClick={() => setEditOpen(true)}
                className="h-6 w-6 inline-flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors"
                title="Edit"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
              </button>
              <button
                onClick={() => setDeleteOpen(true)}
                className="h-6 w-6 inline-flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title="Delete"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            </div>
          </TableCell>
        )}
      </TableRow>

      {canWrite && (
        <EditItemDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          item={{ id: item.id, data: item.data }}
          fields={allFields}
          collectionId={collectionId}
          collectionSlug={collectionSlug}
          catalogItems={catalogItems}
          tenantLanguages={tenantLanguages}
          currentLocale={currentLocale}
          timezone={timezone}
          onDeleteRequest={() => { setEditOpen(false); setDeleteOpen(true); }}
          onSaved={onSaved}
        />
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-gray-100">Delete Record</DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              This record will be permanently deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <DialogClose render={<Button type="button" variant="outline" className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800" />}>
              Cancel
            </DialogClose>
            <Button onClick={handleDelete} disabled={deleting} variant="destructive">
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// AddGrandchildDialog — compact add button for Level 3
// ---------------------------------------------------------------------------

function AddGrandchildDialog({
  parentItemId,
  parentFieldSlug,
  fields,
  collectionId,
  collectionSlug,
  catalogItems,
  timezone,
  onAdded,
}: {
  parentItemId: string;
  parentFieldSlug: string;
  fields: Field[];
  collectionId: string;
  collectionSlug: string;
  catalogItems: CatalogItems;
  timezone: string;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});

  const visibleFields = fields.filter((f) => f.slug !== parentFieldSlug);

  function handleChange(slug: string, value: unknown) {
    setFormValues((prev) => ({ ...prev, [slug]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const data = { ...formValues, [parentFieldSlug]: parentItemId };

    for (const field of fields) {
      if (field.field_type === "datetime" && data[field.slug]) {
        data[field.slug] = datetimeLocalToISO(data[field.slug] as string, timezone);
      }
    }

    const fd = new FormData();
    fd.set("collection_id", collectionId);
    fd.set("collection_slug", collectionSlug);
    fd.set("data", JSON.stringify(data));

    const result = await createItem(fd);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Record created");
    setOpen(false);
    setFormValues({});
    onAdded();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs gap-1 text-blue-600 dark:text-blue-400 hover:bg-blue-100/50 dark:hover:bg-blue-900/30"
          />
        }
      >
        <Plus className="h-3 w-3" />
        Add
      </DialogTrigger>

      <DialogContent className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle
              className="text-blue-600 dark:text-blue-400"
              style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
            >
              Add Record
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              Fill in the fields to create a new record.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 max-h-[60vh] overflow-y-auto pr-1">
            <ItemFormFields
              fields={visibleFields}
              values={formValues}
              onChange={handleChange}
              catalogItems={catalogItems}
              collectionSlug={collectionSlug}
            />
          </div>

          <DialogFooter className="mt-6">
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="outline"
                  className="border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-blue-400"
                  onClick={() => setFormValues({})}
                />
              }
            >
              Cancel
            </DialogClose>
            <Button
              type="submit"
              disabled={loading}
              className="bg-blue-50 dark:bg-blue-900/30 border border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/30 dark:hover:bg-blue-800/40"
            >
              {loading ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
