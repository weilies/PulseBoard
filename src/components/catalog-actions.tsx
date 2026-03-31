"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
 DropdownMenu, DropdownMenuContent, DropdownMenuItem,
 DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
 Dialog, DialogClose, DialogContent, DialogDescription,
 DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { updateCatalog, deleteCatalog } from "@/app/actions/content-catalog";

interface Props {
 catalogId: string;
 catalogName: string;
 catalogSlug: string;
 description: string;
}

export function CatalogActions({ catalogId, catalogName, catalogSlug: _slug, description }: Props) {
 const router = useRouter();
 const [editOpen, setEditOpen] = useState(false);
 const [deleteOpen, setDeleteOpen] = useState(false);
 const [name, setName] = useState(catalogName);
 const [desc, setDesc] = useState(description);
 const [loading, setLoading] = useState(false);

 async function handleEdit(e: React.FormEvent) {
 e.preventDefault();
 setLoading(true);
 const fd = new FormData();
 fd.set("catalog_id", catalogId);
 fd.set("name", name);
 fd.set("description", desc);
 const result = await updateCatalog(fd);
 setLoading(false);
 if (result.error) { toast.error(result.error); return; }
 toast.success("Catalog updated");
 setEditOpen(false);
 router.refresh();
 }

 async function handleDelete() {
 setLoading(true);
 const fd = new FormData();
 fd.set("catalog_id", catalogId);
 const result = await deleteCatalog(fd);
 setLoading(false);
 if (result.error) { toast.error(result.error); return; }
 toast.success(`"${catalogName}" deleted`);
 setDeleteOpen(false);
 router.refresh();
 }

 return (
 <>
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

 <Dialog open={editOpen} onOpenChange={setEditOpen}>
 <DialogContent className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
 <form onSubmit={handleEdit}>
 <DialogHeader>
 <DialogTitle className="text-blue-600 dark:text-blue-400">Edit Catalog</DialogTitle>
 <DialogDescription className="text-gray-500 dark:text-gray-400">Slug cannot be changed.</DialogDescription>
 </DialogHeader>
 <div className="mt-4 space-y-4">
 <div className="space-y-2">
 <Label className="text-gray-900 dark:text-gray-100">Name</Label>
 <Input value={name} onChange={(e) => setName(e.target.value)} required
 className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100" />
 </div>
 <div className="space-y-2">
 <Label className="text-gray-900 dark:text-gray-100">Description</Label>
 <Input value={desc} onChange={(e) => setDesc(e.target.value)}
 className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100" />
 </div>
 </div>
 <DialogFooter className="mt-6">
 <div className="flex w-full items-center justify-between">
 <Button
 type="button"
 variant="outline"
 size="sm"
 className="text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
 onClick={() => { setEditOpen(false); setDeleteOpen(true); }}
 >
 <Trash2 className="h-3.5 w-3.5 mr-1.5" />
 Delete
 </Button>
 <div className="flex gap-2">
 <DialogClose render={<Button type="button" variant="outline" className="border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800" />}>Cancel</DialogClose>
 <Button type="submit" disabled={loading} className="bg-blue-50 dark:bg-blue-950 border border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/30">
 {loading ? "Saving..." : "Save"}
 </Button>
 </div>
 </div>
 </DialogFooter>
 </form>
 </DialogContent>
 </Dialog>

 <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
 <DialogContent className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
 <DialogHeader>
 <DialogTitle>Delete Catalog</DialogTitle>
 </DialogHeader>

 <ConfirmActionDialog
 isOpen={deleteOpen}
 severity="danger"
 message={`This will permanently delete "${catalogName}" and all its items. This cannot be undone.`}
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