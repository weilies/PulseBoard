"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
 Folder, FolderOpen, Box, Database, ChevronDown, ChevronUp, ChevronRight,
 Plus, Pencil, Trash2, FolderPlus, ArrowRight, GripVertical, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buildNavTree } from "@/lib/services/nav.service";
import type { NavFolder, NavItem } from "@/lib/services/nav.service";
import {
 createNavFolder, updateNavFolder, deleteNavFolder,
 addNavItem, removeNavItem, moveNavItemAction, moveNavFolderAction,
} from "@/app/actions/nav";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Collection {
 id: string;
 name: string;
 slug: string;
 type: string;
}

interface NavManagerProps {
 initialFolders: NavFolder[];
 initialItems: NavItem[];
 allCollections: Collection[];
}

// ---------------------------------------------------------------------------
// Inline edit input helper
// ---------------------------------------------------------------------------

function InlineInput({
 value,
 onSave,
 onCancel,
 placeholder,
}: {
 value: string;
 onSave: (val: string) => void;
 onCancel: () => void;
 placeholder?: string;
}) {
 const [val, setVal] = useState(value);
 return (
 <form
 className="flex items-center gap-1"
 onSubmit={(e) => { e.preventDefault(); if (val.trim()) onSave(val.trim()); }}
 >
 <input
 autoFocus
 value={val}
 onChange={(e) => setVal(e.target.value)}
 placeholder={placeholder}
 className="bg-gray-100 dark:bg-gray-800 border border-blue-500/40 rounded px-2 py-0.5 text-xs text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400 w-36"
 />
 <button type="submit" className="text-blue-600 dark:text-blue-400 hover:text-[#a8c4ff] text-xs px-1">Save</button>
 <button type="button" onClick={onCancel} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:text-gray-100 text-xs px-1">Cancel</button>
 </form>
 );
}

// ---------------------------------------------------------------------------
// Drop zone highlight
// ---------------------------------------------------------------------------

function DropZone({
 onDrop,
 label,
 className,
}: {
 onDrop: () => void;
 label: string;
 className?: string;
}) {
 const [over, setOver] = useState(false);
 return (
 <div
 onDragOver={(e) => { e.preventDefault(); setOver(true); }}
 onDragLeave={() => setOver(false)}
 onDrop={(e) => { e.preventDefault(); setOver(false); onDrop(); }}
 className={cn(
 "rounded border border-dashed text-center py-1.5 text-xs transition-colors",
 over ? "border-blue-400 bg-gray-100 dark:bg-gray-800 text-blue-600 dark:text-blue-400" : "border-gray-200 dark:border-gray-700 text-blue-500 dark:text-blue-400/40",
 className
 )}
 >
 {label}
 </div>
 );
}

// ---------------------------------------------------------------------------
// Main NavManager
// ---------------------------------------------------------------------------

export function NavManager({ initialFolders, initialItems, allCollections }: NavManagerProps) {
 const router = useRouter();
 const [isPending, startTransition] = useTransition();

 // ---- drag state ----
 const [dragItemId, setDragItemId] = useState<string | null>(null);
 const [dragFolderId, setDragFolderId] = useState<string | null>(null);

 // ---- inline edit state ----
 const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
 const [creatingFolderParentId, setCreatingFolderParentId] = useState<string | null | "root">(undefined as unknown as null);
 const [isCreatingRootFolder, setIsCreatingRootFolder] = useState(false);

 // ---- expanded folders ----
 const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());

 const { rootFolders, rootItems } = useMemo(
 () => buildNavTree(initialFolders, initialItems),
 [initialFolders, initialItems]
 );

 // Collections already in nav
 const navCollectionIds = new Set(
 initialItems.filter((i) => i.resource_type === "collection").map((i) => i.resource_id)
 );
 const availableCollections = allCollections.filter((c) => !navCollectionIds.has(c.id));

 // ---- sibling position helpers ----
 const getFolderSiblings = (parentId: string | null) => {
 const siblings = initialFolders.filter(f => f.parent_id === parentId);
 return siblings.sort((a, b) => a.sort_order - b.sort_order);
 };

 const getFolderPosition = (folderId: string, parentId: string | null) => {
 const siblings = getFolderSiblings(parentId);
 return siblings.findIndex(f => f.id === folderId);
 };

 // ---- move folder handler ----
 const handleMoveFolder = async (
 folderId: string,
 parentId: string | null,
 direction: 'up' | 'down'
 ) => {
 startTransition(async () => {
 const siblings = getFolderSiblings(parentId);
 const currentIndex = getFolderPosition(folderId, parentId);

 let targetIndex: number;
 if (direction === 'up' && currentIndex > 0) {
 targetIndex = currentIndex - 1;
 } else if (direction === 'down' && currentIndex < siblings.length - 1) {
 targetIndex = currentIndex + 1;
 } else {
 return; // out of bounds, do nothing
 }

 const targetSortOrder = siblings[targetIndex].sort_order;
 const fd = new FormData();
 fd.set("folder_id", folderId);
 if (parentId) fd.set("parent_id", parentId);
 fd.set("sort_order", String(targetSortOrder));

 const result = await moveNavFolderAction(fd);
 if (result.error) toast.error(result.error);
 else { refresh(); }
 });
 };

 // ---- helpers ----
 function refresh() {
 router.refresh();
 }

 async function handleCreateFolder(name: string, parentId: string | null) {
 const fd = new FormData();
 fd.set("name", name);
 if (parentId) fd.set("parent_id", parentId);
 startTransition(async () => {
 const result = await createNavFolder(fd);
 if (result.error) toast.error(result.error);
 else { toast.success("Folder created"); refresh(); }
 });
 setIsCreatingRootFolder(false);
 setCreatingFolderParentId(undefined as unknown as null);
 }

 async function handleRenameFolder(folderId: string, name: string) {
 const fd = new FormData();
 fd.set("folder_id", folderId);
 fd.set("name", name);
 startTransition(async () => {
 const result = await updateNavFolder(fd);
 if (result.error) toast.error(result.error);
 else { toast.success("Folder renamed"); refresh(); }
 });
 setEditingFolderId(null);
 }

 async function handleDeleteFolder(folderId: string) {
 if (!confirm("Delete this folder? Items inside will be moved to root.")) return;
 const fd = new FormData();
 fd.set("folder_id", folderId);
 startTransition(async () => {
 const result = await deleteNavFolder(fd);
 if (result.error) toast.error(result.error);
 else { toast.success("Folder deleted"); refresh(); }
 });
 }

 async function handleAddCollection(collectionId: string, folderId?: string | null) {
 const fd = new FormData();
 fd.set("resource_type", "collection");
 fd.set("resource_id", collectionId);
 if (folderId) fd.set("folder_id", folderId);
 startTransition(async () => {
 const result = await addNavItem(fd);
 if (result.error) toast.error(result.error);
 else { toast.success("Added to nav"); refresh(); }
 });
 }

 async function handleRemoveItem(itemId: string) {
 const fd = new FormData();
 fd.set("item_id", itemId);
 startTransition(async () => {
 const result = await removeNavItem(fd);
 if (result.error) toast.error(result.error);
 else { toast.success("Removed from nav"); refresh(); }
 });
 }

 async function handleMoveItemToFolder(itemId: string, folderId: string | null) {
 const fd = new FormData();
 fd.set("item_id", itemId);
 if (folderId) fd.set("folder_id", folderId);
 fd.set("sort_order", "0");
 startTransition(async () => {
 const result = await moveNavItemAction(fd);
 if (result.error) toast.error(result.error);
 else { refresh(); }
 });
 }

 async function handleMoveFolderToParent(folderId: string, parentId: string | null) {
 const fd = new FormData();
 fd.set("folder_id", folderId);
 if (parentId) fd.set("parent_id", parentId);
 fd.set("sort_order", "0");
 startTransition(async () => {
 const result = await moveNavFolderAction(fd);
 if (result.error) toast.error(result.error);
 else { refresh(); }
 });
 }

 // ---- DnD handlers ----
 function onItemDragStart(itemId: string) {
 setDragItemId(itemId);
 setDragFolderId(null);
 }
 function onFolderDragStart(folderId: string) {
 setDragFolderId(folderId);
 setDragItemId(null);
 }

 function onDropToFolder(targetFolderId: string | null) {
 if (dragItemId) handleMoveItemToFolder(dragItemId, targetFolderId);
 if (dragFolderId && dragFolderId !== targetFolderId) handleMoveFolderToParent(dragFolderId, targetFolderId);
 setDragItemId(null);
 setDragFolderId(null);
 }

 // ---- render item ----
 function renderItem(item: NavItem, depth: number = 0) {
 const col = allCollections.find((c) => c.id === item.resource_id);
 const displayName = item.label ?? col?.name ?? item.resource_id;
 const Icon = col?.type === "system" ? Database : Box;

 return (
 <div
 key={item.id}
 draggable
 onDragStart={() => onItemDragStart(item.id)}
 className={cn(
 "group flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-all",
 "bg-gray-100 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:border-gray-600",
 depth > 0 && "ml-4",
 dragItemId === item.id && "opacity-50"
 )}
 >
 <GripVertical className="h-3 w-3 text-blue-500 dark:text-blue-400/30 cursor-grab shrink-0" />
 <Icon className="h-3.5 w-3.5 text-blue-400 dark:text-blue-300 shrink-0" />
 <span className="flex-1 truncate text-gray-900 dark:text-gray-100">{displayName}</span>
 <button
 onClick={() => handleRemoveItem(item.id)}
 disabled={isPending}
 className="opacity-0 group-hover:opacity-100 text-gray-500 dark:text-gray-400 hover:text-red-400 transition-all ml-1"
 title="Remove from nav"
 >
 <X className="h-3 w-3" />
 </button>
 </div>
 );
 }

 // ---- render folder (recursive) ----
 function renderFolder(folder: NavFolder, depth: number = 0) {
 const isOpen = expandedFolders.has(folder.id);
 const isEditing = editingFolderId === folder.id;
 const isCreatingChild = creatingFolderParentId === folder.id;

 const currentIndex = getFolderPosition(folder.id, folder.parent_id);
 const siblings = getFolderSiblings(folder.parent_id);
 const isFirstSibling = currentIndex === 0;
 const isLastSibling = currentIndex === siblings.length - 1;

 return (
 <div key={folder.id} className={cn(depth > 0 && "ml-4")}>
 {/* Folder header */}
 <div
 draggable={!isEditing}
 onDragStart={() => !isEditing && onFolderDragStart(folder.id)}
 onDragOver={(e) => e.preventDefault()}
 onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDropToFolder(folder.id); }}
 className={cn(
 "group flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all",
 "hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent hover:border-gray-200 dark:border-gray-700",
 dragFolderId === folder.id && "opacity-50"
 )}
 >
 <GripVertical className="h-3 w-3 text-blue-500 dark:text-blue-400/30 cursor-grab shrink-0" />
 <button
 onClick={() => setExpandedFolders((prev) => {
 const next = new Set(prev);
 if (next.has(folder.id)) next.delete(folder.id); else next.add(folder.id);
 return next;
 })}
 className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
 title={`ID: ${folder.id}`}
 >
 {isOpen ? <FolderOpen className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" /> : <Folder className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
 {isEditing ? (
 <InlineInput
 value={folder.name}
 onSave={(name) => handleRenameFolder(folder.id, name)}
 onCancel={() => setEditingFolderId(null)}
 />
 ) : (
 <span className="text-gray-900 dark:text-gray-100 truncate flex-1">{folder.name}</span>
 )}
 {!isEditing && (
 <span className="ml-auto shrink-0">
  {isOpen ? <ChevronDown className="h-3 w-3 text-gray-500 dark:text-gray-400" /> : <ChevronRight className="h-3 w-3 text-gray-500 dark:text-gray-400" />}
 </span>
 )}
 </button>

 {!isEditing && (
 <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all ml-1">
 <button
 onClick={() => { setCreatingFolderParentId(folder.id); setExpandedFolders((p) => new Set([...p, folder.id])); }}
 className="p-0.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 dark:text-blue-400 rounded"
 title="New subfolder"
 ><FolderPlus className="h-3 w-3" /></button>
 <button
 onClick={() => setEditingFolderId(folder.id)}
 className="p-0.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 dark:text-blue-400 rounded"
 title="Rename"
 ><Pencil className="h-3 w-3" /></button>
 <button
 onClick={() => handleDeleteFolder(folder.id)}
 disabled={isPending}
 className="p-0.5 text-gray-500 dark:text-gray-400 hover:text-red-400 rounded"
 title="Delete"
 ><Trash2 className="h-3 w-3" /></button>
 {!isFirstSibling && (
 <button
 onClick={() => handleMoveFolder(folder.id, folder.parent_id, 'up')}
 disabled={isPending}
 className="p-0.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors"
 title="Move folder up"
 ><ChevronUp className="h-4 w-4" /></button>
 )}
 {!isLastSibling && (
 <button
 onClick={() => handleMoveFolder(folder.id, folder.parent_id, 'down')}
 disabled={isPending}
 className="p-0.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors"
 title="Move folder down"
 ><ChevronDown className="h-4 w-4" /></button>
 )}
 </div>
 )}
 </div>

 {/* Folder contents */}
 {isOpen && (
 <div className="ml-2 mt-0.5 space-y-0.5 pl-2 border-l border-gray-100 dark:border-gray-800">
 {/* New subfolder input */}
 {isCreatingChild && (
 <div className="px-2 py-1">
 <InlineInput
 value=""
 onSave={(name) => handleCreateFolder(name, folder.id)}
 onCancel={() => setCreatingFolderParentId(undefined as unknown as null)}
 placeholder="Folder name"
 />
 </div>
 )}

 {/* Sub-folders */}
 {(folder.children ?? []).map((child) => renderFolder(child, depth + 1))}

 {/* Items in this folder */}
 {(folder.items ?? []).map((item) => renderItem(item, depth + 1))}

 {/* Drop zone inside folder */}
 {(dragItemId || dragFolderId) && (
 <DropZone
 onDrop={() => onDropToFolder(folder.id)}
 label={`Drop here → ${folder.name}`}
 className="mx-1 my-1"
 />
 )}

 {/* Empty state */}
 {(folder.children ?? []).length === 0 && (folder.items ?? []).length === 0 && !isCreatingChild && (
 <p className="text-[10px] text-blue-500 dark:text-blue-400/30 px-3 py-1 italic">Empty folder</p>
 )}
 </div>
 )}
 </div>
 );
 }

 return (
 <div className="grid lg:grid-cols-2 gap-6">
 {/* Left: Current Nav Structure */}
 <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
 <div className="flex items-center justify-between">
 <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
 Navigation Structure
 </h2>
 <button
 onClick={() => setIsCreatingRootFolder(true)}
 className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-[#a8c4ff] bg-gray-100 dark:bg-gray-800 hover:bg-blue-100 border border-gray-300 dark:border-gray-600 rounded-md px-2.5 py-1 transition-all"
 >
 <Plus className="h-3 w-3" />
 New Folder
 </button>
 </div>

 <div className="space-y-0.5 min-h-[200px]">
 {/* Root folder creation */}
 {isCreatingRootFolder && (
 <div className="px-2 py-1">
 <InlineInput
 value=""
 onSave={(name) => handleCreateFolder(name, null)}
 onCancel={() => setIsCreatingRootFolder(false)}
 placeholder="Folder name"
 />
 </div>
 )}

 {/* Root-level folders */}
 {rootFolders.map((folder) => renderFolder(folder, 0))}

 {/* Root-level collection items */}
 {rootItems.filter((i) => i.resource_type === "collection").map((item) => renderItem(item, 0))}

 {/* Root drop zone */}
 {(dragItemId || dragFolderId) && (
 <DropZone
 onDrop={() => onDropToFolder(null)}
 label="Drop here → Root level"
 className="mt-2"
 />
 )}

 {/* Empty state */}
 {rootFolders.length === 0 && rootItems.filter((i) => i.resource_type === "collection").length === 0 && !isCreatingRootFolder && (
 <div className="text-center py-12">
 <Folder className="h-10 w-10 text-blue-500 dark:text-blue-400/20 mx-auto mb-2" />
 <p className="text-xs text-gray-500 dark:text-gray-400">No navigation items yet.</p>
 <p className="text-xs text-blue-500 dark:text-blue-400/40 mt-1">Create a folder or add collections from the right panel.</p>
 </div>
 )}
 </div>

 <p className="text-[10px] text-blue-500 dark:text-blue-400/30" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
 Drag items between folders. Hover to rename or delete folders.
 </p>
 </div>

 {/* Right: Available Collections */}
 <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
 <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
 Available Collections
 </h2>

 {availableCollections.length === 0 ? (
 <div className="text-center py-12">
 <Box className="h-10 w-10 text-blue-500 dark:text-blue-400/20 mx-auto mb-2" />
 <p className="text-xs text-gray-500 dark:text-gray-400">All collections are in the nav.</p>
 </div>
 ) : (
 <div className="space-y-1.5">
 {availableCollections.map((col) => {
 const Icon = col.type === "system" ? Database : Box;
 return (
 <div
 key={col.id}
 className="flex items-center gap-2.5 rounded-lg px-3 py-2 bg-gray-100 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:border-gray-600 transition-all group"
 >
 <Icon className="h-4 w-4 text-blue-400 dark:text-blue-300 shrink-0" />
 <div className="flex-1 min-w-0">
 <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{col.name}</p>
 <p className="text-[10px] text-gray-500 dark:text-gray-400 font-mono truncate">{col.slug}</p>
 </div>
 <button
 onClick={() => handleAddCollection(col.id, null)}
 disabled={isPending}
 className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 hover:text-[#a8c4ff] bg-gray-100 dark:bg-gray-800 hover:bg-blue-100 border border-gray-300 dark:border-gray-600 rounded px-2 py-0.5 transition-all opacity-0 group-hover:opacity-100 shrink-0"
 title="Add to nav root"
 >
 <ArrowRight className="h-3 w-3" />
 Add
 </button>
 </div>
 );
 })}
 </div>
 )}

 {/* Currently in nav — summary */}
 {navCollectionIds.size > 0 && (
 <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
 <p className="text-[10px] text-blue-500 dark:text-blue-400/40 mb-2" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
 IN NAV ({navCollectionIds.size})
 </p>
 <div className="space-y-1">
 {allCollections
 .filter((c) => navCollectionIds.has(c.id))
 .map((col) => {
 const Icon = col.type === "system" ? Database : Box;
 const item = initialItems.find((i) => i.resource_type === "collection" && i.resource_id === col.id);
 return (
 <div key={col.id} className="flex items-center gap-2 px-2 py-1 rounded text-[10px] text-gray-500 dark:text-gray-400">
 <Icon className="h-3 w-3 shrink-0 text-gray-400 dark:text-gray-500" />
 <span className="flex-1 truncate">{col.name}</span>
 {item && (
 <button
 onClick={() => handleRemoveItem(item.id)}
 disabled={isPending}
 className="text-gray-500 dark:text-gray-400 hover:text-red-400 transition-colors"
 title="Remove from nav"
 >
 <X className="h-3 w-3" />
 </button>
 )}
 </div>
 );
 })}
 </div>
 </div>
 )}
 </div>
 </div>
 );
}