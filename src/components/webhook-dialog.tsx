"use client";

import { useState, useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { createWebhook, updateWebhook } from "@/app/actions/webhooks";
import { toast } from "sonner";

const COLLECTION_EVENTS = [
 { value: "item.created", label: "item.created", desc: "Item inserted" },
 { value: "item.updated", label: "item.updated", desc: "Item updated" },
 { value: "item.deleted", label: "item.deleted", desc: "Item deleted" },
 { value: "item.pre_save", label: "item.pre_save", desc: "Before save (can block)" },
 { value: "item.post_save", label: "item.post_save", desc: "After save (sync/notify)" },
];

const AUTH_EVENTS = [
 { value: "auth.login", label: "auth.login", desc: "User logged in" },
 { value: "auth.logout", label: "auth.logout", desc: "User logged out" },
];

const BLOCKING_EVENTS = new Set(["item.pre_save"]);

type Webhook = {
 id: string;
 name: string;
 url: string;
 secret: string | null;
 events: string[];
 is_active: boolean;
 scope_type?: string;
 scope_id?: string | null;
 can_block?: boolean;
 config?: Record<string, unknown>;
};

interface WebhookDialogProps {
 collectionSlug?: string;
 collections?: { slug: string; name: string }[];
 webhook?: Webhook;
 children?: React.ReactNode;
 open?: boolean;
 onOpenChange?: (open: boolean) => void;
 onDeleteRequest?: () => void;
}

export function WebhookDialog({
 collectionSlug: initialSlug,
 collections,
 webhook,
 children,
 open: controlledOpen,
 onOpenChange: controlledOnOpenChange,
 onDeleteRequest,
}: WebhookDialogProps) {
 const [internalOpen, setInternalOpen] = useState(false);
 const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
 const setOpen = controlledOnOpenChange ?? setInternalOpen;

 const [scopeType, setScopeType] = useState(webhook?.scope_type ?? "collection");
 const [selectedSlug, setSelectedSlug] = useState(initialSlug ?? webhook?.scope_id ?? "");
 const [events, setEvents] = useState<string[]>(webhook?.events ?? []);
 const [timeoutMs, setTimeoutMs] = useState(
 (webhook?.config?.timeout_ms as number) ?? 5000
 );
 const [failStrict, setFailStrict] = useState(
 (webhook?.config?.fail_strict as boolean) ?? false
 );
 const [isPending, startTransition] = useTransition();
 const formRef = useRef<HTMLFormElement>(null);

 const isEdit = !!webhook;
 const collectionSlug = initialSlug ?? selectedSlug;
 const showCollectionPicker = !initialSlug && scopeType === "collection";
 const hasBlockingEvent = events.some((e) => BLOCKING_EVENTS.has(e));

 const availableEvents = scopeType === "auth" ? AUTH_EVENTS : COLLECTION_EVENTS;

 function toggleEvent(value: string) {
 setEvents((prev) =>
  prev.includes(value) ? prev.filter((e) => e !== value) : [...prev, value]
 );
 }

 function handleScopeChange(newScope: string) {
 setScopeType(newScope);
 setEvents([]); // reset events when scope changes
 }

 function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
 e.preventDefault();
 const form = e.currentTarget;
 const fd = new FormData(form);
 // Remove browser-appended events, re-add from state
 events.forEach((ev) => fd.append("events", ev));
 fd.set("scope_type", scopeType);
 fd.set("scope_id", scopeType === "collection" ? collectionSlug : "");
 fd.set("collection_slug", scopeType === "collection" ? collectionSlug : "");
 fd.set("can_block", hasBlockingEvent ? "true" : "false");
 if (hasBlockingEvent) {
  fd.set("timeout_ms", String(timeoutMs));
  fd.set("fail_strict", failStrict ? "true" : "false");
 }

 startTransition(async () => {
  try {
  if (isEdit) {
   fd.set("is_active", webhook.is_active ? "true" : "false");
   await updateWebhook(webhook.id, fd);
  } else {
   await createWebhook(fd);
  }
  toast.success(isEdit ? "Webhook updated" : "Webhook created");
  setOpen(false);
  formRef.current?.reset();
  if (!isEdit) setEvents([]);
  } catch (err) {
  toast.error(err instanceof Error ? err.message : "Failed to save webhook");
  }
 });
 }

 const isControlled = controlledOpen !== undefined;
 const trigger = children ?? (
 <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
  <Plus className="h-3.5 w-3.5" />
  Add Webhook
 </Button>
 );

 const canSubmit = events.length > 0 && !isPending && (scopeType !== "collection" || !!collectionSlug);

 return (
 <>
  {!isControlled && (
  <div onClick={() => setOpen(true)} className="contents">{trigger}</div>
  )}
  <Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="sm:max-w-md bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 flex flex-col max-h-[90vh]">
   <DialogHeader>
   <DialogTitle className="text-gray-900 dark:text-gray-100" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
    {isEdit ? "Edit Webhook" : "Add Webhook"}
   </DialogTitle>
   </DialogHeader>

   <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 pt-2 overflow-y-auto pr-2 flex-1">
   {/* Scope type */}
   {!isEdit && !initialSlug && (
    <div className="space-y-1.5">
    <Label className="text-xs text-gray-600 dark:text-gray-400">Scope</Label>
    <Select value={scopeType} onValueChange={(v) => handleScopeChange(v ?? "collection")}>
     <SelectTrigger className="border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 text-sm">
     <SelectValue />
     </SelectTrigger>
     <SelectContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">
     <SelectItem value="collection" className="text-sm">Collection</SelectItem>
     <SelectItem value="auth" className="text-sm">Auth</SelectItem>
     </SelectContent>
    </Select>
    </div>
   )}

   {/* Collection picker */}
   {showCollectionPicker && collections && (
    <div className="space-y-1.5">
    <Label className="text-xs text-gray-600 dark:text-gray-400">Collection</Label>
    <Select value={selectedSlug} onValueChange={(v) => setSelectedSlug(v ?? "")}>
     <SelectTrigger className="border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 text-sm">
     <SelectValue placeholder="Select a collection" />
     </SelectTrigger>
     <SelectContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">
     {collections.map((c) => (
      <SelectItem key={c.slug} value={c.slug} className="text-sm">
      {c.name} <span className="text-xs text-gray-400 dark:text-gray-500">({c.slug})</span>
      </SelectItem>
     ))}
     </SelectContent>
    </Select>
    </div>
   )}

   <div className="space-y-1.5">
    <Label className="text-xs text-gray-600 dark:text-gray-400">Name</Label>
    <Input
    name="name"
    defaultValue={webhook?.name}
    placeholder="Slack notification"
    required
    className="border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 text-sm"
    />
   </div>

   <div className="space-y-1.5">
    <Label className="text-xs text-gray-600 dark:text-gray-400">Endpoint URL</Label>
    <Input
    name="url"
    type="url"
    defaultValue={webhook?.url}
    placeholder="https://your-server.com/webhook"
    required
    className="border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 text-sm font-mono"
    />
   </div>

   <div className="space-y-1.5">
    <Label className="text-xs text-gray-600 dark:text-gray-400">
    Signing Secret <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span>
    </Label>
    <Input
    name="secret"
    defaultValue={webhook?.secret ?? ""}
    placeholder="Leave blank to skip signature"
    className="border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 text-sm font-mono"
    />
    <p className="text-xs text-gray-400 dark:text-gray-500">
    If set, each request includes <code className="text-blue-600 dark:text-blue-400">X-PulseBox-Signature: sha256=…</code>
    </p>
   </div>

   <div className="space-y-2">
    <Label className="text-xs text-gray-600 dark:text-gray-400">Events</Label>
    <div className="space-y-2">
    {availableEvents.map((ev) => (
     <label
     key={ev.value}
     className="flex items-center gap-3 cursor-pointer rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50"
     >
     <input
      type="checkbox"
      checked={events.includes(ev.value)}
      onChange={() => toggleEvent(ev.value)}
      className="accent-blue-600"
     />
     <div>
      <code className="text-xs text-blue-600 dark:text-blue-400 font-mono">{ev.label}</code>
      <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{ev.desc}</span>
     </div>
     </label>
    ))}
    </div>
    {events.length === 0 && (
    <p className="text-xs text-amber-600">Select at least one event.</p>
    )}
   </div>

   {/* Blocking config — only shown when a blocking event is selected */}
   {hasBlockingEvent && (
    <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-3">
    <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
     Blocking webhook — your endpoint&apos;s response can reject the save.
    </p>
    <div className="grid grid-cols-2 gap-3">
     <div className="space-y-1">
     <Label className="text-xs text-gray-600 dark:text-gray-400">Timeout (ms)</Label>
     <Input
      type="number"
      value={timeoutMs}
      onChange={(e) => setTimeoutMs(Number(e.target.value))}
      min={500}
      max={30000}
      className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
     />
     </div>
    </div>
    <label className="flex items-center gap-2 cursor-pointer">
     <input
     type="checkbox"
     checked={failStrict}
     onChange={(e) => setFailStrict(e.target.checked)}
     className="accent-red-500"
     />
     <span className="text-xs text-gray-600 dark:text-gray-400">
     <strong>Fail strict</strong> — block save if endpoint unreachable (default: fail-open)
     </span>
    </label>
    </div>
   )}

   <div className="flex items-center justify-between pt-2">
    {isEdit && onDeleteRequest && (
    <Button
     type="button"
     size="sm"
     variant="outline"
     className="text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
     onClick={onDeleteRequest}
    >
     Delete
    </Button>
    )}
    <div className="flex gap-2 ml-auto">
    <Button
     type="button"
     variant="ghost"
     size="sm"
     onClick={() => setOpen(false)}
     className="text-gray-500 dark:text-gray-400"
    >
     Cancel
    </Button>
    <Button
     type="submit"
     size="sm"
     disabled={!canSubmit}
     className="bg-blue-600 hover:bg-blue-700 text-white"
    >
     {isPending ? "Saving…" : isEdit ? "Save Changes" : "Create Webhook"}
    </Button>
    </div>
   </div>
   </form>
  </DialogContent>
  </Dialog>
 </>
 );
}
