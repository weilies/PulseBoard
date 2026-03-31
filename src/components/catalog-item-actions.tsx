"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
 DropdownMenu, DropdownMenuContent, DropdownMenuItem,
 DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
 Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Pencil, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { deleteCatalogItem, moveCatalogItem } from "@/app/actions/content-catalog";
import { EditCatalogItemDialog } from "@/components/create-catalog-item-dialog";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";

interface Props {
 item: { id: string; label: string; value: string; sort_order: number; is_active: boolean };
 catalogId: string;
 catalogSlug: string;
 isFirst: boolean;
 isLast: boolean;
}

export function CatalogItemActions({ item, catalogId, catalogSlug, isFirst, isLast }: Props) {
 const router = useRouter();
 const [editOpen, setEditOpen] = useState(false);
 const [deleteOpen, setDeleteOpen] = useState(false);
 const [loading, setLoading] = useState(false);

 async function handleMove(direction: "up" | "down") {
 const fd = new FormData();
 fd.set("item_id", item.id);
 fd.set("direction", direction);
 fd.set("sort_order", String(item.sort_order));
 fd.set("catalog_id", catalogId);
 fd.set("catalog_slug", catalogSlug);
 await moveCatalogItem(fd);
 router.refresh();
 }

 async function handleDelete() {
 setLoading(true);
 const fd = new FormData();
 fd.set("item_id", item.id);
 fd.set("catalog_slug", catalogSlug);
 const result = await deleteCatalogItem(fd);
 setLoading(false);
 if (result.error) { toast.error(result.error); return; }
 toast.success("Item deleted");
 setDeleteOpen(false);
 router.refresh();
 }

 return (
 <>
 <div className="flex items-center gap-0.5 flex-shrink-0">
 <Button
 variant="ghost" size="sm"
 className="h-7 w-7 p-0 text-zinc-600 hover:text-zinc-300 disabled:opacity-20"
 disabled={isFirst} onClick={() => handleMove("up")} title="Move up"
 >
 <ChevronUp className="h-3.5 w-3.5" />
 </Button>
 <Button
 variant="ghost" size="sm"
 className="h-7 w-7 p-0 text-zinc-600 hover:text-zinc-300 disabled:opacity-20"
 disabled={isLast} onClick={() => handleMove("down")} title="Move down"
 >
 <ChevronDown className="h-3.5 w-3.5" />
 </Button>

 <DropdownMenu>
 <DropdownMenuTrigger
 render={<Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-500 hover:text-zinc-300" />}
 >
 <MoreHorizontal className="h-4 w-4" />
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end" className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
 <DropdownMenuItem
 className="gap-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-blue-400 dark:text-blue-400"
 onClick={() => setEditOpen(true)}
 >
 <Pencil className="h-3.5 w-3.5" /> Edit
 </DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>
 </div>

 <EditCatalogItemDialog
 open={editOpen}
 onOpenChange={setEditOpen}
 item={item}
 catalogSlug={catalogSlug}
 onDeleteRequest={() => { setEditOpen(false); setDeleteOpen(true); }}
 />

 <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
 <DialogContent className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
 <DialogHeader>
 <DialogTitle>Delete Item</DialogTitle>
 </DialogHeader>

 <ConfirmActionDialog
 isOpen={deleteOpen}
 severity="danger"
 message={`Delete "${item.label}"? This cannot be undone.`}
 confirmLabel="Delete"
 cancelLabel="Cancel"
 confirmVariant="destructive"
 onConfirm={handleDelete}
 onCancel={() => setDeleteOpen(false)}
 isLoading={loading}
 />
 </DialogContent>
 </Dialog>
 </>
 );
}