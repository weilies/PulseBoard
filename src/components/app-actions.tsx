"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
 DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
 DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
 Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { MoreHorizontal, RefreshCw, Power, Copy, Check, AlertTriangle, Settings, Trash2 } from "lucide-react";
import { rotateAppSecret, toggleApp, deleteApp } from "@/app/actions/apps";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { toast } from "sonner";

interface AppActionsProps {
 app: {
  id: string;
  app_name: string;
  app_id: string;
  is_active: boolean;
 };
}

export function AppActions({ app }: AppActionsProps) {
 const [rotatedSecret, setRotatedSecret] = useState<string | null>(null);
 const [showRotateDialog, setShowRotateDialog] = useState(false);
 const [showManageDialog, setShowManageDialog] = useState(false);
 const [confirmDelete, setConfirmDelete] = useState(false);
 const [copied, setCopied] = useState(false);
 const [loading, setLoading] = useState(false);

 async function handleRotate() {
  setLoading(true);
  const fd = new FormData();
  fd.set("id", app.id);
  const result = await rotateAppSecret(fd);
  setLoading(false);

  if (result.error) {
   toast.error(result.error);
   return;
  }

  if (result.appSecret) {
   setRotatedSecret(result.appSecret);
   setShowRotateDialog(true);
   toast.success("Secret rotated successfully");
  }
 }

 async function handleToggle() {
  const fd = new FormData();
  fd.set("id", app.id);
  fd.set("isActive", String(!app.is_active));
  const result = await toggleApp(fd);
  if (result.error) toast.error(result.error);
  else toast.success(`App ${app.is_active ? "deactivated" : "activated"}`);
 }

 async function handleDelete() {
  setLoading(true);
  const fd = new FormData();
  fd.set("id", app.id);
  const result = await deleteApp(fd);
  setLoading(false);

  if (result.error) {
   toast.error(result.error);
   return;
  }
  toast.success("App deleted");
  setShowManageDialog(false);
  setConfirmDelete(false);
 }

 function handleCopy(value: string) {
  navigator.clipboard.writeText(value);
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
 }

 return (
  <>
   <DropdownMenu>
    <DropdownMenuTrigger
     render={
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-400 dark:text-gray-500 hover:text-gray-600" />
     }
    >
     <MoreHorizontal className="h-4 w-4" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
     <DropdownMenuGroup>
      <DropdownMenuItem onClick={handleRotate} className="text-gray-700 focus:bg-gray-50 dark:bg-gray-800/50">
       <RefreshCw className="h-3.5 w-3.5 mr-2" />
       Rotate Secret
      </DropdownMenuItem>
      <DropdownMenuItem onClick={handleToggle} className="text-gray-700 focus:bg-gray-50 dark:bg-gray-800/50">
       <Power className="h-3.5 w-3.5 mr-2" />
       {app.is_active ? "Deactivate" : "Activate"}
      </DropdownMenuItem>
      <DropdownMenuSeparator className="bg-gray-100 dark:bg-gray-800" />
      <DropdownMenuItem onClick={() => { setConfirmDelete(false); setShowManageDialog(true); }} className="text-gray-700 focus:bg-gray-50 dark:bg-gray-800/50">
       <Settings className="h-3.5 w-3.5 mr-2" />
       Manage App
      </DropdownMenuItem>
     </DropdownMenuGroup>
    </DropdownMenuContent>
   </DropdownMenu>

   {/* Rotate Secret Result Dialog */}
   <Dialog open={showRotateDialog} onOpenChange={(v) => { if (!v) { setShowRotateDialog(false); setRotatedSecret(null); setCopied(false); } }}>
    <DialogContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
     <DialogHeader>
      <DialogTitle className="text-gray-900 dark:text-gray-100" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
       New Secret for &quot;{app.app_name}&quot;
      </DialogTitle>
     </DialogHeader>
     <div className="space-y-4">
      <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 flex items-start gap-2">
       <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
       <p className="text-xs text-yellow-800">
        Copy the new secret now. The old secret is immediately invalidated.
       </p>
      </div>
      <div className="flex items-center gap-2">
       <code className="flex-1 rounded bg-gray-100 dark:bg-gray-800 px-3 py-2 text-xs text-gray-900 dark:text-gray-100 font-mono break-all">
        {rotatedSecret}
       </code>
       <Button variant="outline" size="sm" className="shrink-0 border-gray-200 dark:border-gray-700" onClick={() => handleCopy(rotatedSecret!)}>
        {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />}
       </Button>
      </div>
      <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={() => { setShowRotateDialog(false); setRotatedSecret(null); }}>
       Done
      </Button>
     </div>
    </DialogContent>
   </Dialog>

   {/* Manage App Dialog (contains delete) */}
   <Dialog open={showManageDialog} onOpenChange={(v) => { setShowManageDialog(v); if (!v) setConfirmDelete(false); }}>
    <DialogContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
     <DialogHeader>
      <DialogTitle className="text-gray-900 dark:text-gray-100" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
       Manage &quot;{app.app_name}&quot;
      </DialogTitle>
     </DialogHeader>
     <div className="space-y-4">
      <div className="space-y-1">
       <p className="text-xs text-gray-500 dark:text-gray-400">Client ID</p>
       <code className="block rounded bg-gray-100 dark:bg-gray-800 px-3 py-2 text-xs text-blue-600 dark:text-blue-400 font-mono">
        {app.app_id}
       </code>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
       {!confirmDelete ? (
        <Button
         variant="outline"
         size="sm"
         className="w-full text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
         onClick={() => setConfirmDelete(true)}
        >
         <Trash2 className="h-4 w-4 mr-2" />
         Delete App
        </Button>
       ) : (
        <ConfirmActionDialog
         isOpen={confirmDelete}
         severity="danger"
         message={`This will permanently revoke all API access. ${app.app_id} will stop working immediately.`}
         confirmLabel="Delete App"
         cancelLabel="Cancel"
         confirmVariant="destructive"
         onConfirm={handleDelete}
         onCancel={() => setConfirmDelete(false)}
         isLoading={loading}
        />
       )}
      </div>
     </div>
    </DialogContent>
   </Dialog>
  </>
 );
}
