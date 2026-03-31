"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuSeparator,
 DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
 Dialog,
 DialogClose,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Trash2, ChevronUp, ChevronDown, Globe, Settings2, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { deleteField, moveField, toggleFieldShowInGrid } from "@/app/actions/studio";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { EditFieldLabelsDialog } from "@/components/edit-field-labels-dialog";
import { EditFieldDialog } from "@/components/edit-field-dialog";

type SimpleCollection = { id: string; name: string; slug: string };

interface Props {
 fieldId: string;
 fieldName: string;
 fieldType: string;
 fieldOptions: Record<string, unknown>;
 fieldIsRequired: boolean;
 fieldIsUnique: boolean;
 fieldIsTranslatable: boolean;
 sortOrder: number;
 collectionId: string;
 collectionSlug: string;
 isFirst: boolean;
 isLast: boolean;
 allCollections: SimpleCollection[];
 showInGrid: boolean;
}

export function FieldActions({
 fieldId,
 fieldName,
 fieldType,
 fieldOptions,
 fieldIsRequired,
 fieldIsUnique,
 fieldIsTranslatable,
 sortOrder,
 collectionId,
 collectionSlug,
 isFirst,
 isLast,
 allCollections,
 showInGrid,
}: Props) {
 const router = useRouter();
 const [deleteOpen, setDeleteOpen] = useState(false);
 const [labelsOpen, setLabelsOpen] = useState(false);
 const [editOpen, setEditOpen] = useState(false);
 const [loading, setLoading] = useState(false);
 const [gridVisible, setGridVisible] = useState(showInGrid);

 async function handleToggleGrid() {
   const next = !gridVisible;
   setGridVisible(next);
   const result = await toggleFieldShowInGrid(fieldId, next);
   if (result.error) {
     toast.error(result.error);
     setGridVisible(!next);
   }
 }

 const existingLabels = (fieldOptions?.labels as Record<string, string>) ?? {};

 async function handleMove(direction: "up" | "down") {
 const formData = new FormData();
 formData.set("field_id", fieldId);
 formData.set("direction", direction);
 formData.set("sort_order", String(sortOrder));
 formData.set("collection_id", collectionId);
 formData.set("collection_slug", collectionSlug);
 await moveField(formData);
 router.refresh();
 }

 async function handleDelete() {
 setLoading(true);
 const formData = new FormData();
 formData.set("field_id", fieldId);
 formData.set("collection_slug", collectionSlug);
 const result = await deleteField(formData);
 setLoading(false);
 if (result.error) {
 toast.error(result.error);
 return;
 }
 toast.success(`Field "${fieldName}" deleted`);
 setDeleteOpen(false);
 router.refresh();
 }

 return (
 <>
 <div className="flex items-center gap-0.5 flex-shrink-0">
 <Button
 variant="ghost"
 size="sm"
 className="h-7 w-7 p-0 text-zinc-600 hover:text-zinc-300 disabled:opacity-20"
 disabled={isFirst}
 onClick={() => handleMove("up")}
 title="Move up"
 >
 <ChevronUp className="h-3.5 w-3.5" />
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 w-7 p-0 text-zinc-600 hover:text-zinc-300 disabled:opacity-20"
 disabled={isLast}
 onClick={() => handleMove("down")}
 title="Move down"
 >
 <ChevronDown className="h-3.5 w-3.5" />
 </Button>

 <DropdownMenu>
 <DropdownMenuTrigger
 render={
 <Button
 variant="ghost"
 size="sm"
 className="h-7 w-7 p-0 text-zinc-500 hover:text-zinc-300"
 />
 }
 >
 <MoreHorizontal className="h-4 w-4" />
 </DropdownMenuTrigger>
 <DropdownMenuContent
 align="end"
 className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
 >
 <DropdownMenuItem
 className="gap-2 cursor-pointer text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-blue-400 dark:text-blue-400"
 onClick={handleToggleGrid}
 >
 <LayoutGrid className={`h-3.5 w-3.5 ${gridVisible ? "text-blue-500" : ""}`} />
 {gridVisible ? "Hide from grid" : "Show in grid"}
 </DropdownMenuItem>
 <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700" />
 <DropdownMenuItem
 className="gap-2 cursor-pointer text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-blue-400 dark:text-blue-400"
 onClick={() => setEditOpen(true)}
 >
 <Settings2 className="h-3.5 w-3.5" />
 Edit Field
 </DropdownMenuItem>
 <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700" />
 <DropdownMenuItem
 className="gap-2 cursor-pointer text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-blue-400 dark:text-blue-400"
 onClick={() => setLabelsOpen(true)}
 >
 <Globe className="h-3.5 w-3.5" />
 Edit Labels
 </DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>
 </div>

 {/* Edit Labels */}
 <EditFieldLabelsDialog
 open={labelsOpen}
 onOpenChange={setLabelsOpen}
 fieldId={fieldId}
 fieldName={fieldName}
 collectionSlug={collectionSlug}
 existingLabels={existingLabels}
 onDeleteRequest={() => { setLabelsOpen(false); setDeleteOpen(true); }}
 />

 {/* Edit Field structure */}
 <EditFieldDialog
 open={editOpen}
 onOpenChange={setEditOpen}
 fieldId={fieldId}
 fieldName={fieldName}
 fieldType={fieldType}
 fieldOptions={fieldOptions}
 fieldIsRequired={fieldIsRequired}
 fieldIsUnique={fieldIsUnique}
 fieldIsTranslatable={fieldIsTranslatable}
 collectionSlug={collectionSlug}
 allCollections={allCollections}
 />

 {/* Delete confirm */}
 <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
 <DialogContent className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
 <DialogHeader>
 <DialogTitle>Delete Field</DialogTitle>
 </DialogHeader>

 <ConfirmActionDialog
 isOpen={deleteOpen}
 severity="danger"
 message={`Delete "${fieldName}"? All item data stored in this field will be lost. If this is an M2M relation, the junction collection will also be deleted.`}
 confirmLabel="Delete"
 cancelLabel="Cancel"
 confirmVariant="destructive"
 onConfirm={handleDelete}
 onCancel={() => setDeleteOpen(false)}
 isLoading={loading}
 />

 <DialogFooter className="mt-4">
 <DialogClose render={<Button type="button" variant="outline" />}>
 Close
 </DialogClose>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </>
 );
}