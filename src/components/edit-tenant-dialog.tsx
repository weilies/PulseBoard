"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
 Dialog,
 DialogClose,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { updateTenant } from "@/app/actions/dashboard";
import { COMMON_TIMEZONES } from "@/lib/timezone-constants";

interface EditTenantDialogProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 tenantId: string;
 currentName: string;
 currentSlug: string;
 currentContactName?: string | null;
 currentContactEmail?: string | null;
 currentTimezone?: string | null;
 currentFeedbackMode?: boolean;
 onDeleteRequest?: () => void;
}

export function EditTenantDialog({
 open,
 onOpenChange,
 tenantId,
 currentName,
 currentSlug,
 currentContactName,
 currentContactEmail,
 currentTimezone,
 currentFeedbackMode = false,
 onDeleteRequest,
}: EditTenantDialogProps) {
 const router = useRouter();
 const [name, setName] = useState(currentName);
 const [slug, setSlug] = useState(currentSlug);
 const [contactName, setContactName] = useState(currentContactName ?? "");
 const [contactEmail, setContactEmail] = useState(currentContactEmail ?? "");
 const [timezone, setTimezone] = useState(currentTimezone ?? "Asia/Singapore");
 const [feedbackMode, setFeedbackMode] = useState(currentFeedbackMode);
 const [loading, setLoading] = useState(false);

 async function handleSubmit(e: React.FormEvent) {
 e.preventDefault();
 setLoading(true);

 const formData = new FormData();
 formData.set("tenantId", tenantId);
 formData.set("name", name);
 formData.set("slug", slug);
 formData.set("timezone", timezone);
 formData.set("feedbackMode", String(feedbackMode));
 if (contactName) formData.set("contactName", contactName);
 if (contactEmail) formData.set("contactEmail", contactEmail);

 const result = await updateTenant(formData);
 setLoading(false);

 if (result.error) {
 toast.error(result.error);
 } else {
 toast.success("Tenant updated");
 onOpenChange(false);
 router.refresh();
 }
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 shadow-[0_0_40px_rgba(0,240,255,0.15)] flex flex-col max-h-[90vh]">
 <form onSubmit={handleSubmit} className="flex flex-col flex-1">
 <DialogHeader>
 <DialogTitle className="text-blue-600 dark:text-blue-400" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
 Edit Tenant
 </DialogTitle>
 <DialogDescription className="text-gray-500 dark:text-gray-400">
 Update tenant information.
 </DialogDescription>
 </DialogHeader>
 <div className="mt-4 space-y-4 overflow-y-auto pr-2 flex-1">
 <div className="space-y-2">
 <Label htmlFor="edit-tenant-name" className="text-gray-900 dark:text-gray-100">
 Tenant Name <span className="text-red-400">*</span>
 </Label>
 <Input
 id="edit-tenant-name"
 value={name}
 onChange={(e) => setName(e.target.value)}
 required
 className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500/50 dark:placeholder:text-gray-400/50 focus:border-blue-500/60 focus:ring-blue-500/20"
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="edit-tenant-slug" className="text-gray-900 dark:text-gray-100">
 Slug <span className="text-red-400">*</span>
 </Label>
 <Input
 id="edit-tenant-slug"
 value={slug}
 onChange={(e) => setSlug(e.target.value)}
 required
 className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500/50 dark:placeholder:text-gray-400/50 focus:border-blue-500/60 focus:ring-blue-500/20"
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="edit-tenant-contact-name" className="text-gray-900 dark:text-gray-100">Person In Charge</Label>
 <Input
 id="edit-tenant-contact-name"
 placeholder="Jane Smith"
 value={contactName}
 onChange={(e) => setContactName(e.target.value)}
 className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500/50 dark:placeholder:text-gray-400/50 focus:border-blue-500/60 focus:ring-blue-500/20"
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="edit-tenant-contact-email" className="text-gray-900 dark:text-gray-100">Person In Charge Email</Label>
 <Input
 id="edit-tenant-contact-email"
 type="email"
 placeholder="jane@acmecorp.com"
 value={contactEmail}
 onChange={(e) => setContactEmail(e.target.value)}
 className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500/50 dark:placeholder:text-gray-400/50 focus:border-blue-500/60 focus:ring-blue-500/20"
 />
 </div>
 <div className="space-y-2">
 <Label className="text-gray-900 dark:text-gray-100">
 Default Timezone <span className="text-red-400">*</span>
 </Label>
 <Select value={timezone} onValueChange={(v) => { if (v) setTimezone(v); }}>
 <SelectTrigger className="bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
 <SelectValue />
 </SelectTrigger>
 <SelectContent className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 max-h-60">
 {COMMON_TIMEZONES.map((tz) => (
 <SelectItem key={tz.value} value={tz.value} className="text-sm">
 {tz.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 <p className="text-xs text-gray-500 dark:text-gray-400">Users can override this in their profile.</p>
 </div>
 <div className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
  <div>
   <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Feedback Mode</p>
   <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Allow users to right-click and annotate UI elements for batch fixes.</p>
  </div>
  <button
   type="button"
   role="switch"
   aria-checked={feedbackMode}
   onClick={() => setFeedbackMode((v) => !v)}
   className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${feedbackMode ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`}
  >
   <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${feedbackMode ? "translate-x-4" : "translate-x-0"}`} />
  </button>
 </div>
 </div>
 <DialogFooter className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
 <div className="flex w-full items-center justify-between">
 {onDeleteRequest ? (
 <Button type="button" variant="outline" size="sm" className="text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300" onClick={onDeleteRequest}>
 Delete Tenant
 </Button>
 ) : <span />}
 <div className="flex gap-2">
 <DialogClose render={<Button type="button" variant="outline" className="border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-blue-400 dark:text-blue-400" />}>
 Cancel
 </DialogClose>
 <Button
 type="submit"
 disabled={loading}
 className="bg-blue-50 dark:bg-blue-950 border border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/30 hover:text-[#a8c4ff]"
 >
 {loading ? "Saving..." : "Save Changes"}
 </Button>
 </div>
 </div>
 </DialogFooter>
 </form>
 </DialogContent>
 </Dialog>
 );
}