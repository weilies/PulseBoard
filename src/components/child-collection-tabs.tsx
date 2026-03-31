"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { Plus, ChevronRight, ChevronDown, Loader2 } from "lucide-react";
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
import type { ChildCollection, GrandchildData } from "@/app/actions/relations";
import { fetchGrandchildData } from "@/app/actions/relations";
import { GrandchildGrid } from "@/components/grandchild-grid";
import { getFieldLabel } from "@/lib/i18n";
import { formatDate, formatDatetime, datetimeLocalToISO } from "@/lib/timezone-constants";

type Item = {
  id: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

interface Props {
  parentItemId: string;
  parentCollectionSlug: string;
  childCollections: ChildCollection[];
  childCounts: Record<string, number>;
  activeTab: string | null;
  activeChildItems: Item[];
  activeChildTotal: number;
  activeChildFields: Field[];
  activeChildCatalogItems: CatalogItems;
  activeChild: ChildCollection | null;
  childPage: number;
  childPageSize: number;
  canWrite: boolean;
  /** Per-child-collection write permission. Falls back to canWrite if not provided. */
  childCanWriteMap?: Record<string, boolean>;
  timezone: string;
  currentLocale: string;
  tenantLanguages: TenantLanguage[];
  effectiveDateField?: string;
  hasGrandchildren?: boolean;
  /** Override the base URL path for tab/pagination links. Defaults to Studio path. */
  basePathOverride?: string;
  /** Pre-resolved labels for relation fields: { fieldSlug → { itemId → label } } */
  activeChildRelatedLabels?: Record<string, Record<string, string>>;
}

function renderChildCellValue(
  fieldType: string,
  fieldSlug: string,
  value: unknown,
  options: Record<string, unknown>,
  catalogItems: CatalogItems,
  timezone: string,
  relatedLabels?: Record<string, Record<string, string>>,
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
    case "multiselect": {
      const arr = Array.isArray(value) ? value : [value];
      const slug = options?.catalog_slug as string | undefined;
      if (slug && catalogItems[slug]) {
        return arr.map((v) => {
          const found = catalogItems[slug].find((i) => i.value === v);
          return found?.label ?? String(v);
        }).join(", ");
      }
      return arr.join(", ");
    }
    case "relation": {
      if (typeof value === "string" && relatedLabels?.[fieldSlug]?.[value]) {
        return relatedLabels[fieldSlug][value];
      }
      return typeof value === "string" ? value.slice(0, 8) : String(value);
    }
    case "number":
      return String(value);
    case "json":
      return JSON.stringify(value).slice(0, 40);
    default:
      return String(value).slice(0, 80);
  }
}

export function ChildCollectionTabs({
  parentItemId,
  parentCollectionSlug,
  childCollections,
  childCounts,
  activeTab,
  activeChildItems,
  activeChildTotal,
  activeChildFields,
  activeChildCatalogItems,
  activeChild,
  childPage,
  childPageSize,
  canWrite,
  childCanWriteMap,
  timezone,
  currentLocale,
  tenantLanguages,
  effectiveDateField,
  hasGrandchildren,
  basePathOverride,
  activeChildRelatedLabels,
}: Props) {
  // Resolve write permission for the active child tab
  const activeChildCanWrite = activeChild
    ? (childCanWriteMap?.[activeChild.slug] ?? canWrite)
    : canWrite;
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const totalPages = Math.ceil(activeChildTotal / childPageSize);

  // Filter out the parent relation field from display columns
  const displayFields = activeChildFields.filter((f) => {
    if (!activeChild) return true;
    // Hide the child_of relation field (redundant — we're already viewing from the parent)
    if (f.slug === activeChild.fieldSlug) return false;
    // Hide file/json/richtext from grid
    if (["file", "richtext", "json"].includes(f.field_type)) return false;
    return true;
  });

  // Determine effective date: most recent record gets "Current" badge
  let currentItemId: string | null = null;
  if (effectiveDateField && activeChildItems.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const eligible = activeChildItems
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

  const basePath = basePathOverride ?? `/dashboard/studio/collections/${parentCollectionSlug}/items/${parentItemId}`;

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700">
        {childCollections.map((child) => {
          const isActive = child.slug === activeTab;
          const count = childCounts[child.slug] ?? 0;
          return (
            <Link
              key={child.slug}
              href={`${basePath}?child_tab=${child.slug}&child_page=1`}
              className={`px-4 py-2 text-sm transition-colors flex items-center gap-1.5 ${
                isActive
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-400 font-medium"
                  : "text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
              }`}
            >
              {child.name}
              <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                isActive ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400" : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
              }`}>
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Active child grid */}
      {activeChild && (
        <div className="space-y-3">
          {/* Child grid header */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">
              {activeChildTotal} record{activeChildTotal !== 1 ? "s" : ""}
            </span>
            {activeChildCanWrite && (
              <AddChildDialog
                parentItemId={parentItemId}
                parentFieldSlug={activeChild.fieldSlug}
                fields={activeChildFields}
                collectionId={activeChild.id}
                collectionSlug={activeChild.slug}
                catalogItems={activeChildCatalogItems}
                parentCollectionSlug={parentCollectionSlug}
                timezone={timezone}
              />
            )}
          </div>

          {/* Table */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden overflow-x-auto">
            <Table className="min-w-full">
              <TableHeader className="bg-gray-100 dark:bg-gray-800">
                <TableRow className="border-gray-200 dark:border-gray-700 hover:bg-transparent">
                  <TableHead className="w-10 text-gray-500 dark:text-gray-400">#</TableHead>
                  {displayFields.map((f) => (
                    <TableHead key={f.id} className="text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {getFieldLabel(f, currentLocale)}
                    </TableHead>
                  ))}
                  {effectiveDateField && <TableHead className="text-gray-500 dark:text-gray-400 w-20">Status</TableHead>}
                  {activeChildCanWrite && <TableHead className="w-10" />}
                  {hasGrandchildren && <TableHead className="w-8" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeChildItems.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={displayFields.length + (activeChildCanWrite ? 3 : 2) + (hasGrandchildren ? 1 : 0)}
                      className="text-center text-gray-500 dark:text-gray-400 py-10 bg-white dark:bg-gray-900"
                    >
                      No records yet.{activeChildCanWrite ? " Click \"+ Add\" to create the first record." : ""}
                    </TableCell>
                  </TableRow>
                ) : (
                  activeChildItems.map((item, index) => {
                    const isCurrent = item.id === currentItemId;
                    const isHistorical = effectiveDateField && !isCurrent && currentItemId !== null;
                    return (
                      <ChildRow
                        key={item.id}
                        item={item}
                        index={(childPage - 1) * childPageSize + index}
                        displayFields={displayFields}
                        allFields={activeChildFields}
                        catalogItems={activeChildCatalogItems}
                        relatedLabels={activeChildRelatedLabels}
                        timezone={timezone}
                        currentLocale={currentLocale}
                        isCurrent={isCurrent}
                        isHistorical={!!isHistorical}
                        effectiveDateField={effectiveDateField}
                        canWrite={activeChildCanWrite}
                        collectionId={activeChild.id}
                        collectionSlug={activeChild.slug}
                        parentCollectionSlug={parentCollectionSlug}
                        tenantLanguages={tenantLanguages}
                        hasGrandchildren={hasGrandchildren}
                        isExpanded={expandedRowId === item.id}
                        onToggleExpand={() => setExpandedRowId(expandedRowId === item.id ? null : item.id)}
                        totalColumns={displayFields.length + (activeChildCanWrite ? 3 : 2) + (hasGrandchildren ? 1 : 0)}
                      />
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              {childPage > 1 && (
                <Link
                  href={`${basePath}?child_tab=${activeChild.slug}&child_page=${childPage - 1}`}
                  className="inline-flex items-center h-8 px-3 text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 border border-gray-200 dark:border-gray-700 hover:border-blue-500/40 rounded-md transition-colors"
                >
                  Previous
                </Link>
              )}
              <span className="text-xs text-gray-500">
                Page {childPage} of {totalPages}
              </span>
              {childPage < totalPages && (
                <Link
                  href={`${basePath}?child_tab=${activeChild.slug}&child_page=${childPage + 1}`}
                  className="inline-flex items-center h-8 px-3 text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 border border-gray-200 dark:border-gray-700 hover:border-blue-500/40 rounded-md transition-colors"
                >
                  Next
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChildRow — single row with edit/delete support
// ---------------------------------------------------------------------------

function ChildRow({
  item,
  index,
  displayFields,
  allFields,
  catalogItems,
  relatedLabels,
  timezone,
  currentLocale,
  isCurrent,
  isHistorical,
  effectiveDateField,
  canWrite,
  collectionId,
  collectionSlug,
  parentCollectionSlug,
  tenantLanguages,
  hasGrandchildren,
  isExpanded,
  onToggleExpand,
  totalColumns,
}: {
  item: Item;
  index: number;
  displayFields: Field[];
  allFields: Field[];
  catalogItems: CatalogItems;
  relatedLabels?: Record<string, Record<string, string>>;
  timezone: string;
  currentLocale: string;
  isCurrent: boolean;
  isHistorical: boolean;
  effectiveDateField?: string;
  canWrite: boolean;
  collectionId: string;
  collectionSlug: string;
  parentCollectionSlug: string;
  tenantLanguages: TenantLanguage[];
  hasGrandchildren?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  totalColumns?: number;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [grandchildData, setGrandchildData] = useState<GrandchildData[] | null>(null);
  const [loadingGrandchildren, setLoadingGrandchildren] = useState(false);

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
    router.refresh();
  }

  async function handleExpand() {
    if (onToggleExpand) onToggleExpand();
    if (!isExpanded && grandchildData === null) {
      setLoadingGrandchildren(true);
      const result = await fetchGrandchildData(item.id, collectionId);
      setLoadingGrandchildren(false);
      if (result.data) setGrandchildData(result.data);
    }
  }

  return (
    <>
      <TableRow
        className={`border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
          index % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800/50"
        } ${isHistorical ? "opacity-50" : ""}`}
      >
        <TableCell className="text-gray-500 dark:text-gray-400 text-xs">{index + 1}</TableCell>
        {displayFields.map((f) => {
          const value = item.data?.[f.slug];
          return (
            <TableCell key={f.id} className="text-gray-900 dark:text-gray-100 text-sm max-w-[160px]">
              <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
                {renderChildCellValue(f.field_type, f.slug, value, f.options, catalogItems, timezone, relatedLabels)}
              </span>
            </TableCell>
          );
        })}
        {effectiveDateField && (
          <TableCell>
            {isCurrent ? (
              <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
                Current
              </Badge>
            ) : isHistorical ? (
              <span className="text-xs text-gray-400">Historical</span>
            ) : null}
          </TableCell>
        )}
        {canWrite && (
          <TableCell className="text-right">
            <div className="flex items-center gap-1 justify-end">
              <button
                onClick={() => setEditOpen(true)}
                className="h-7 w-7 inline-flex items-center justify-center rounded text-gray-400 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Edit"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
              </button>
              <button
                onClick={() => setDeleteOpen(true)}
                className="h-7 w-7 inline-flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                title="Delete"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            </div>
          </TableCell>
        )}
        {hasGrandchildren && (
          <TableCell className="text-center px-1">
            <button
              onClick={handleExpand}
              className="h-7 w-7 inline-flex items-center justify-center rounded text-gray-400 hover:text-blue-600 hover:bg-gray-100 transition-colors"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {loadingGrandchildren ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          </TableCell>
        )}
      </TableRow>

      {/* Grandchild expansion row */}
      {hasGrandchildren && isExpanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={totalColumns} className="p-0 border-0">
            {loadingGrandchildren ? (
              <div className="flex items-center justify-center py-4 text-gray-400 text-xs gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading...
              </div>
            ) : grandchildData && grandchildData.length > 0 ? (
              <div className="space-y-1 py-1">
                {grandchildData.map((gc) => (
                  <GrandchildGrid
                    key={gc.collection.slug}
                    grandchild={gc}
                    parentItemId={item.id}
                    canWrite={canWrite}
                    timezone={timezone}
                    currentLocale={currentLocale}
                    tenantLanguages={tenantLanguages}
                  />
                ))}
              </div>
            ) : grandchildData && grandchildData.length === 0 ? (
              <div className="ml-8 mr-4 my-2 text-xs text-gray-400">No sub-collections found.</div>
            ) : null}
          </TableCell>
        </TableRow>
      )}

      {/* Edit dialog */}
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
        />
      )}

      {/* Delete confirmation */}
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
// AddChildDialog — pre-populates parent relation field
// ---------------------------------------------------------------------------

function AddChildDialog({
  parentItemId,
  parentFieldSlug,
  fields,
  collectionId,
  collectionSlug,
  catalogItems,
  parentCollectionSlug,
  timezone,
}: {
  parentItemId: string;
  parentFieldSlug: string;
  fields: Field[];
  collectionId: string;
  collectionSlug: string;
  catalogItems: CatalogItems;
  parentCollectionSlug: string;
  timezone: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});

  // Filter out the parent relation field from the form (it's auto-filled)
  const visibleFields = fields.filter((f) => f.slug !== parentFieldSlug);

  function handleChange(slug: string, value: unknown) {
    setFormValues((prev) => ({ ...prev, [slug]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    // Auto-fill parent relation field
    const data = { ...formValues, [parentFieldSlug]: parentItemId };

    // Normalize datetime fields
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
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size="sm"
            className="gap-1.5 bg-blue-50 border border-blue-500/40 text-blue-600 hover:bg-blue-500/30"
          />
        }
      >
        <Plus className="h-3.5 w-3.5" />
        Add
      </DialogTrigger>

      <DialogContent className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle
              className="text-blue-600"
              style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
            >
              Add Record
            </DialogTitle>
            <DialogDescription className="text-gray-500">
              Fill in the fields to create a new child record.
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
                  className="border-gray-300 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
                  onClick={() => setFormValues({})}
                />
              }
            >
              Cancel
            </DialogClose>
            <Button
              type="submit"
              disabled={loading}
              className="bg-blue-50 border border-blue-500/40 text-blue-600 hover:bg-blue-500/30"
            >
              {loading ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
