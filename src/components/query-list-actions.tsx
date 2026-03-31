"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";

interface QueryListActionsProps {
 queryId: string;
 queryName: string;
}

export function QueryListActions({ queryId, queryName }: QueryListActionsProps) {
 const router = useRouter();
 const [open, setOpen] = useState(false);
 const [deleting, setDeleting] = useState(false);

 const handleDelete = async () => {
  setDeleting(true);
  try {
   const res = await fetch(`/api/queries/${queryId}`, { method: "DELETE" });
   if (res.ok) {
    setOpen(false);
    router.refresh();
   }
  } finally {
   setDeleting(false);
  }
 };

 return (
  <>
   <Button
    variant="ghost"
    size="sm"
    className="h-7 w-7 p-0 text-gray-400 dark:text-gray-500 hover:text-red-400 hover:bg-red-500/10"
    onClick={() => setOpen(true)}
   >
    <Trash2 className="h-3.5 w-3.5" />
   </Button>

   <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
     <DialogHeader>
      <DialogTitle>Delete Query</DialogTitle>
     </DialogHeader>

     <ConfirmActionDialog
      isOpen={open}
      severity="danger"
      message={`Delete "${queryName}"? This cannot be undone.`}
      confirmLabel="Delete Query"
      cancelLabel="Cancel"
      confirmVariant="destructive"
      onConfirm={handleDelete}
      onCancel={() => setOpen(false)}
      isLoading={deleting}
     />
    </DialogContent>
   </Dialog>
  </>
 );
}
