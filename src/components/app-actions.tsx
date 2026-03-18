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
import { MoreHorizontal, RefreshCw, Power, Trash2, Copy, Check, AlertTriangle } from "lucide-react";
import { rotateAppSecret, toggleApp, deleteApp } from "@/app/actions/apps";
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
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
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
    setShowDeleteDialog(false);
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
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600" />
          }
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-white border-gray-200">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={handleRotate} className="text-gray-700 focus:bg-gray-50">
              <RefreshCw className="h-3.5 w-3.5 mr-2" />
              Rotate Secret
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleToggle} className="text-gray-700 focus:bg-gray-50">
              <Power className="h-3.5 w-3.5 mr-2" />
              {app.is_active ? "Deactivate" : "Activate"}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-gray-100" />
            <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} className="text-red-600 focus:bg-red-50 focus:text-red-600">
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Rotate Secret Result Dialog */}
      <Dialog open={showRotateDialog} onOpenChange={(v) => { if (!v) { setShowRotateDialog(false); setRotatedSecret(null); setCopied(false); } }}>
        <DialogContent className="bg-white border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-gray-900" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
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
              <code className="flex-1 rounded bg-gray-100 px-3 py-2 text-xs text-gray-900 font-mono break-all">
                {rotatedSecret}
              </code>
              <Button variant="outline" size="sm" className="shrink-0 border-gray-200" onClick={() => handleCopy(rotatedSecret!)}>
                {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5 text-gray-500" />}
              </Button>
            </div>
            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={() => { setShowRotateDialog(false); setRotatedSecret(null); }}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="bg-white border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-gray-900" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
              Delete &quot;{app.app_name}&quot;?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              This will permanently revoke all API access for this app.
              Any integrations using <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-blue-600 font-mono">{app.app_id}</code> will stop working immediately.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" className="border-gray-200 text-gray-700" onClick={() => setShowDeleteDialog(false)}>
                Cancel
              </Button>
              <Button variant="destructive" disabled={loading} onClick={handleDelete}>
                {loading ? "Deleting..." : "Delete App"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
