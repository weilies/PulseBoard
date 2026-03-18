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
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { updateCollection, updateCollectionTranslations, deleteCollection } from "@/app/actions/studio";
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
  collectionSlug: _slug,
  description,
  icon,
  metadata,
}: Props) {
  const router = useRouter();
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
          className="bg-white border-gray-300 text-gray-900"
        >
          <DropdownMenuItem
            className="gap-2 cursor-pointer hover:bg-gray-100 hover:text-blue-600"
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-blue-50" />
          <DropdownMenuItem
            className="gap-2 cursor-pointer text-red-400 hover:bg-red-50 hover:text-red-300"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-white border border-gray-300 text-gray-900">
          <form onSubmit={handleEdit}>
            <DialogHeader>
              <DialogTitle className="text-blue-600">
                {isTranslating ? `Translate Collection (${langLabel})` : "Edit Collection"}
              </DialogTitle>
              <DialogDescription className="text-gray-500">
                {isTranslating
                  ? `Enter translated name and description for ${SUPPORTED_LANGUAGES.find((l) => l.code === locale)?.name}. Leave blank to use English default.`
                  : "Update collection metadata. Slug cannot be changed."}
              </DialogDescription>
            </DialogHeader>

            {isTranslating && (
              <div className="mt-3 rounded-md bg-violet-500/10 border border-violet-500/20 px-3 py-2">
                <p className="text-xs text-violet-300">
                  English name: <strong>{collectionName}</strong>
                  {description && <><br />English description: <strong>{description}</strong></>}
                </p>
              </div>
            )}

            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-900">
                  Name {isTranslating && <span className="text-xs text-gray-500">({langLabel})</span>}
                </Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={!isTranslating}
                  placeholder={isTranslating ? collectionName : undefined}
                  className="bg-gray-100 border-gray-300 text-gray-900 placeholder:text-gray-500/40"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-900">
                  Description {isTranslating && <span className="text-xs text-gray-500">({langLabel})</span>}
                </Label>
                <Input
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder={isTranslating ? (description || "") : undefined}
                  className="bg-gray-100 border-gray-300 text-gray-900 placeholder:text-gray-500/40"
                />
              </div>
              {!isTranslating && (
                <div className="space-y-2">
                  <Label className="text-gray-900">Icon (lucide name)</Label>
                  <Input
                    value={iconVal}
                    onChange={(e) => setIconVal(e.target.value)}
                    className="bg-gray-100 border-gray-300 text-gray-900"
                  />
                </div>
              )}
            </div>
            <DialogFooter className="mt-6">
              <DialogClose
                render={
                  <Button
                    type="button"
                    variant="outline"
                    className="border-gray-300 text-gray-500 hover:bg-gray-100"
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
                {loading ? "Saving..." : isTranslating ? `Save (${langLabel})` : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="bg-white border border-red-500/30 text-gray-900">
          <DialogHeader>
            <DialogTitle className="text-red-400">Delete Collection</DialogTitle>
            <DialogDescription className="text-gray-500">
              This will permanently delete <strong className="text-gray-900">{collectionName}</strong>{" "}
              and all its fields and items. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="outline"
                  className="border-zinc-600 text-gray-500 hover:bg-zinc-700"
                />
              }
            >
              Cancel
            </DialogClose>
            <Button
              onClick={handleDelete}
              disabled={loading}
              className="bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30"
            >
              {loading ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
