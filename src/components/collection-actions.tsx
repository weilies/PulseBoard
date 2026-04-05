"use client";

import { useState, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoreHorizontal, Pencil, Trash2, LayoutList, Database, Settings, PanelLeft, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { updateCollection, updateCollectionTranslations, deleteCollection } from "@/app/actions/studio";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { LANG_COOKIE, SUPPORTED_LANGUAGES } from "@/lib/constants";

interface Props {
 collectionId: string;
 collectionName: string;
 collectionSlug: string;
 description: string;
 icon: string;
 metadata?: Record<string, unknown> | null;
}

function getCurrentLocale(): string {
 if (typeof document === "undefined") return "en";
 const match = document.cookie.match(new RegExp(`(?:^|; )${LANG_COOKIE}=([^;]*)`));
 return match?.[1] ?? "en";
}

export function CollectionActions({
 collectionId,
 collectionName,
 collectionSlug,
 description,
 icon,
 metadata,
}: Props) {
 const router = useRouter();
 const base = `/dashboard/studio/collections/${collectionSlug}`;
 const [editOpen, setEditOpen] = useState(false);
 const [deleteOpen, setDeleteOpen] = useState(false);
 const [name, setName] = useState(collectionName);
 const [desc, setDesc] = useState(description);
 const [iconVal, setIconVal] = useState(icon);
 const [loading, setLoading] = useState(false);
 const [locale, setLocale] = useState("en");

 // Detect current locale
 useEffect(() => {
 setLocale(getCurrentLocale());
 }, []);

 // Sync form values when dialog opens
 useEffect(() => {
 if (!editOpen) return;
 const currentLocale = getCurrentLocale();
 setLocale(currentLocale);
 if (currentLocale === "en") {
 setName(collectionName);
 setDesc(description);
 } else {
 const nameTranslations = metadata?.name_translations as Record<string, string> | undefined;
 const descTranslations = metadata?.description_translations as Record<string, string> | undefined;
 setName(nameTranslations?.[currentLocale] ?? "");
 setDesc(descTranslations?.[currentLocale] ?? "");
 }
 setIconVal(icon);
 }, [editOpen, collectionName, description, icon, metadata]);

 const langLabel = SUPPORTED_LANGUAGES.find((l) => l.code === locale)?.short ?? locale.toUpperCase();
 const isTranslating = locale !== "en";

 async function handleEdit(e: React.FormEvent) {
 e.preventDefault();
 setLoading(true);

 if (isTranslating) {
 // Save translations only
 const nameTranslations = { ...(metadata?.name_translations as Record<string, string> ?? {}), [locale]: name };
 const descTranslations = { ...(metadata?.description_translations as Record<string, string> ?? {}), [locale]: desc };
 const result = await updateCollectionTranslations(collectionId, nameTranslations, descTranslations);
 setLoading(false);
 if (result.error) { toast.error(result.error); return; }
 toast.success(`Translation saved (${langLabel})`);
 } else {
 // Save canonical EN values
 const formData = new FormData();
 formData.set("collection_id", collectionId);
 formData.set("name", name);
 formData.set("description", desc);
 formData.set("icon", iconVal);
 const result = await updateCollection(formData);
 setLoading(false);
 if (result.error) { toast.error(result.error); return; }
 toast.success("Collection updated");
 }

 setEditOpen(false);
 router.refresh();
 }

 async function handleDelete() {
 setLoading(true);
 const formData = new FormData();
 formData.set("collection_id", collectionId);
 const result = await deleteCollection(formData);
 setLoading(false);
 if (result.error) {
 toast.error(result.error);
 return;
 }
 toast.success(`"${collectionName}" deleted`);
 setDeleteOpen(false);
 router.refresh();
 }

 return (
 <>
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
 className="gap-2 cursor-pointer text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-blue-400"
 onClick={() => router.push(`${base}/schema`)}
 >
 <Database className="h-3.5 w-3.5" />
 Model
 </DropdownMenuItem>
 <DropdownMenuItem
 className="gap-2 cursor-pointer text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-blue-400"
 onClick={() => router.push(`${base}/items`)}
 >
 <LayoutList className="h-3.5 w-3.5" />
 Items
 </DropdownMenuItem>
 <DropdownMenuItem
 className="gap-2 cursor-pointer text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-blue-400"
 onClick={() => router.push(`${base}/settings`)}
 >
 <Settings className="h-3.5 w-3.5" />
 Settings
 </DropdownMenuItem>
 <DropdownMenuItem
 className="gap-2 cursor-pointer text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-blue-400"
 onClick={() => router.push(`${base}/form`)}
 >
 <PanelLeft className="h-3.5 w-3.5" />
 Layout
 </DropdownMenuItem>
 <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700" />
 <DropdownMenuItem
 className="gap-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-blue-400 dark:text-blue-400"
 onClick={() => setEditOpen(true)}
 >
 <Pencil className="h-3.5 w-3.5" />
 Edit
 </DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>

 {/* Edit Dialog */}
 <Dialog open={editOpen} onOpenChange={setEditOpen}>
 <DialogContent className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 flex flex-col max-h-[90vh]">
 <form onSubmit={handleEdit} className="flex flex-col flex-1">
 <DialogHeader>
 <DialogTitle className="text-blue-600 dark:text-blue-400">
 {isTranslating ? `Translate Collection (${langLabel})` : "Edit Collection"}
 </DialogTitle>
 <DialogDescription className="text-gray-500 dark:text-gray-400">
 {isTranslating
 ? `Enter translated name and description for ${SUPPORTED_LANGUAGES.find((l) => l.code === locale)?.name}. Leave blank to use English default.`
 : "Update collection metadata. Slug cannot be changed."}
 </DialogDescription>
 </DialogHeader>

 <div className="mt-3 space-y-4 overflow-y-auto pr-2 flex-1">
 {isTranslating && (
 <div className="rounded-md bg-violet-500/10 border border-violet-500/20 px-3 py-2">
 <p className="text-xs text-violet-300">
 English name: <strong>{collectionName}</strong>
 {description && <><br />English description: <strong>{description}</strong></>}
 </p>
 </div>
 )}

 <div className="space-y-4">
 <div className="space-y-2">
 <Label className="text-gray-900 dark:text-gray-100">
 Name {isTranslating && <span className="text-xs text-gray-500 dark:text-gray-400">({langLabel})</span>}
 </Label>
 <Input
 value={name}
 onChange={(e) => setName(e.target.value)}
 required={!isTranslating}
 placeholder={isTranslating ? collectionName : undefined}
 className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:text-gray-400/40"
 />
 </div>
 <div className="space-y-2">
 <Label className="text-gray-900 dark:text-gray-100">
 Description {isTranslating && <span className="text-xs text-gray-500 dark:text-gray-400">({langLabel})</span>}
 </Label>
 <Input
 value={desc}
 onChange={(e) => setDesc(e.target.value)}
 placeholder={isTranslating ? (description || "") : undefined}
 className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:text-gray-400/40"
 />
 </div>
 {!isTranslating && (
 <div className="space-y-2">
 <Label className="text-gray-900 dark:text-gray-100">Icon (lucide name)</Label>
 <Input
 value={iconVal}
 onChange={(e) => setIconVal(e.target.value)}
 className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
 />
 <div className="flex items-start gap-1.5 rounded-md bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 px-2.5 py-2">
 <HelpCircle className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400 mt-0.5 shrink-0" />
 <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
 Use the icon name from{" "}
 <span className="text-blue-600 dark:text-blue-400 font-mono">lucide.dev/icons</span>.
 {" "}e.g. URL <span className="font-mono text-gray-700 dark:text-gray-300">lucide.dev/icons/air-vent</span> → enter <span className="font-mono text-blue-600 dark:text-blue-400">air-vent</span>.
 </p>
 </div>
 </div>
 )}
 </div>
 </div>
 <DialogFooter className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
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
 <DialogClose
 render={
 <Button
 type="button"
 variant="outline"
 className="border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
 />
 }
 >
 Cancel
 </DialogClose>
 <Button
 type="submit"
 disabled={loading}
 className="bg-blue-50 dark:bg-blue-950 border border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/30"
 >
 {loading ? "Saving..." : isTranslating ? `Save (${langLabel})` : "Save"}
 </Button>
 </div>
 </div>
 </DialogFooter>
 </form>
 </DialogContent>
 </Dialog>

 {/* Delete Confirm Dialog */}
 <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
 <DialogContent className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
 <DialogHeader>
 <DialogTitle>Delete Collection</DialogTitle>
 </DialogHeader>

 <ConfirmActionDialog
 isOpen={deleteOpen}
 severity="danger"
 message={`This will permanently delete "${collectionName}" and all its fields and items. This cannot be undone.`}
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