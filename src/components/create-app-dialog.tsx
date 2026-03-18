"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Copy, Check, AlertTriangle } from "lucide-react";
import { createApp } from "@/app/actions/apps";
import { toast } from "sonner";

export function CreateAppDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [credentials, setCredentials] = useState<{ appId: string; appSecret: string } | null>(null);
  const [copied, setCopied] = useState<"id" | "secret" | null>(null);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    const result = await createApp(formData);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (result.appId && result.appSecret) {
      setCredentials({ appId: result.appId, appSecret: result.appSecret });
      toast.success("App created successfully");
    }
  }

  function handleCopy(value: string, type: "id" | "secret") {
    navigator.clipboard.writeText(value);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }

  function handleClose() {
    setOpen(false);
    setCredentials(null);
    setCopied(null);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      <DialogTrigger
        render={
          <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white" />
        }
      >
        <Plus className="h-4 w-4" />
        Create App
      </DialogTrigger>
      <DialogContent className="bg-white border-gray-200">
        <DialogHeader>
          <DialogTitle className="text-gray-900" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
            {credentials ? "App Credentials" : "Create API App"}
          </DialogTitle>
        </DialogHeader>

        {credentials ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
              <p className="text-xs text-yellow-800">
                Copy the <strong>App Secret</strong> now. It will not be shown again.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs text-gray-500">App ID</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 rounded bg-gray-100 px-3 py-2 text-xs text-gray-900 font-mono break-all">
                    {credentials.appId}
                  </code>
                  <Button variant="outline" size="sm" className="shrink-0 border-gray-200" onClick={() => handleCopy(credentials.appId, "id")}>
                    {copied === "id" ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5 text-gray-500" />}
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-xs text-gray-500">App Secret</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 rounded bg-gray-100 px-3 py-2 text-xs text-gray-900 font-mono break-all">
                    {credentials.appSecret}
                  </code>
                  <Button variant="outline" size="sm" className="shrink-0 border-gray-200" onClick={() => handleCopy(credentials.appSecret, "secret")}>
                    {copied === "secret" ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5 text-gray-500" />}
                  </Button>
                </div>
              </div>
            </div>

            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={handleClose}>
              Done
            </Button>
          </div>
        ) : (
          <form action={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="appName" className="text-sm text-gray-700">App Name *</Label>
              <Input
                id="appName"
                name="appName"
                placeholder="e.g. Payroll Integration"
                required
                className="mt-1 border-gray-200 bg-white text-gray-900 placeholder:text-gray-400"
              />
            </div>

            <div>
              <Label htmlFor="expiresAt" className="text-sm text-gray-700">Expires At (optional)</Label>
              <Input
                id="expiresAt"
                name="expiresAt"
                type="date"
                className="mt-1 border-gray-200 bg-white text-gray-900"
              />
              <p className="text-xs text-gray-400 mt-1">Leave empty for no expiry.</p>
            </div>

            <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
              {loading ? "Creating..." : "Create App"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
