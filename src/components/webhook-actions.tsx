"use client";

import { useState, useTransition } from "react";
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { MoreHorizontal, Pencil, Send } from "lucide-react";
import { deleteWebhook, testWebhook } from "@/app/actions/webhooks";
import { WebhookDialog } from "@/components/webhook-dialog";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { toast } from "sonner";

type Webhook = {
 id: string;
 name: string;
 url: string;
 secret: string | null;
 events: string[];
 is_active: boolean;
};

export function WebhookActions({
 webhook,
 collectionSlug,
}: {
 webhook: Webhook;
 collectionSlug: string;
}) {
 const [isPending, startTransition] = useTransition();
 const [editOpen, setEditOpen] = useState(false);
 const [deleteOpen, setDeleteOpen] = useState(false);
 const [deleting, setDeleting] = useState(false);

 function handleDeleteRequest() {
  setEditOpen(false);
  setDeleteOpen(true);
 }

 async function handleDelete() {
  setDeleting(true);
  try {
   await deleteWebhook(webhook.id);
   toast.success("Webhook deleted");
   setDeleteOpen(false);
  } catch (err) {
   toast.error(err instanceof Error ? err.message : "Failed to delete");
  } finally {
   setDeleting(false);
  }
 }

 function handleTest() {
  startTransition(async () => {
   try {
    await testWebhook(webhook.id);
    toast.success("Test delivery sent — check the logs below");
   } catch (err) {
    toast.error(err instanceof Error ? err.message : "Test failed");
   }
  });
 }

 return (
  <>
   {/* Edit dialog — controlled via editOpen state */}
   <WebhookDialog
    collectionSlug={collectionSlug}
    webhook={webhook}
    open={editOpen}
    onOpenChange={setEditOpen}
    onDeleteRequest={handleDeleteRequest}
   >
    {/* No children — dialog is controlled externally */}
    <span />
   </WebhookDialog>

   <DropdownMenu>
    <DropdownMenuTrigger
     render={
      <Button
       variant="ghost"
       size="icon"
       className="h-7 w-7 text-gray-400 dark:text-gray-500 hover:text-gray-700"
       disabled={isPending}
      />
     }
    >
     <MoreHorizontal className="h-4 w-4" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-40 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
     <DropdownMenuItem
      className="text-gray-700 cursor-pointer gap-2"
      onClick={() => setEditOpen(true)}
     >
      <Pencil className="h-3.5 w-3.5" /> Edit
     </DropdownMenuItem>
     <DropdownMenuItem
      className="text-blue-600 dark:text-blue-400 cursor-pointer gap-2"
      onClick={handleTest}
     >
      <Send className="h-3.5 w-3.5" /> Send Test
     </DropdownMenuItem>
    </DropdownMenuContent>
   </DropdownMenu>

   {/* Delete Confirmation Dialog */}
   <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
    <DialogContent className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
     <DialogHeader>
      <DialogTitle>Delete Webhook</DialogTitle>
     </DialogHeader>

     <ConfirmActionDialog
      isOpen={deleteOpen}
      severity="danger"
      message={`Delete "${webhook.name}"? This will stop all webhook deliveries immediately. This cannot be undone.`}
      confirmLabel="Delete Webhook"
      cancelLabel="Cancel"
      confirmVariant="destructive"
      onConfirm={handleDelete}
      onCancel={() => setDeleteOpen(false)}
      isLoading={deleting}
     />
    </DialogContent>
   </Dialog>
  </>
 );
}
