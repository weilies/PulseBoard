"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuGroup,
 DropdownMenuItem,
 DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { MoreHorizontal, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { deleteTenant } from "@/app/actions/dashboard";
import { DestructiveAlert } from "@/components/destructive-alert";
import { EditTenantDialog } from "@/components/edit-tenant-dialog";

interface TenantActionsProps {
 tenantId: string;
 tenantName: string;
 tenantSlug: string;
 isSuper: boolean;
 contactName?: string | null;
 contactEmail?: string | null;
 timezone?: string | null;
}

export function TenantActions({ tenantId, tenantName, tenantSlug, isSuper, contactName, contactEmail, timezone }: TenantActionsProps) {
 const router = useRouter();
 const [editOpen, setEditOpen] = useState(false);
 const [confirmOpen, setConfirmOpen] = useState(false);
 const [loading, setLoading] = useState(false);

 async function handleDelete() {
 setLoading(true);
 setConfirmOpen(false);

 const formData = new FormData();
 formData.set("tenantId", tenantId);

 const result = await deleteTenant(formData);
 setLoading(false);

 if (result.error) {
 toast.error(result.error);
 } else {
 toast.success(`Tenant "${tenantName}" deleted`);
 }

 router.refresh();
 }

 return (
 <>
 <DropdownMenu>
 <DropdownMenuTrigger
 render={<Button variant="ghost" size="icon" className="h-8 w-8" disabled={loading} />}
 >
 <MoreHorizontal className="h-4 w-4" />
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end" className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
 <DropdownMenuGroup>
 <DropdownMenuItem
 onClick={() => setEditOpen(true)}
 className="text-gray-900 dark:text-gray-100 focus:bg-gray-100 dark:bg-gray-800 focus:text-blue-600 dark:text-blue-400"
 >
 <Pencil className="mr-2 h-4 w-4" />
 Edit
 </DropdownMenuItem>
 
 </DropdownMenuGroup>
 </DropdownMenuContent>
 </DropdownMenu>

 {/* Delete Confirmation */}
 <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
 <DialogContent className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 max-w-sm">
 <DialogHeader>
 <DialogTitle>Delete Tenant</DialogTitle>
 </DialogHeader>

 <DestructiveAlert
 severity="danger"
 message={`Delete "${tenantName}"? This will:`}
 >
 <ul className="mt-2 ml-3 list-disc text-xs space-y-0.5 text-red-700 dark:text-red-400">
 <li>Remove all user assignments for this tenant</li>
 <li>Permanently delete users who belong <em>only</em> to this tenant</li>
 <li>Users in multiple tenants will only have this tenant removed</li>
 </ul>
 <div className="flex gap-2 pt-4">
 <Button
 type="button"
 variant="outline"
 onClick={() => setConfirmOpen(false)}
 size="sm"
 >
 Cancel
 </Button>
 <Button
 type="button"
 onClick={handleDelete}
 disabled={loading}
 variant="destructive"
 size="sm"
 >
 {loading ? "Deleting..." : "Delete"}
 </Button>
 </div>
 </DestructiveAlert>

 <DialogFooter className="mt-2">
 <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
 Close
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 <EditTenantDialog
 open={editOpen}
 onOpenChange={setEditOpen}
 tenantId={tenantId}
 currentName={tenantName}
 currentSlug={tenantSlug}
 currentContactName={contactName}
 currentContactEmail={contactEmail}
 currentTimezone={timezone}
 onDeleteRequest={!isSuper ? () => { setEditOpen(false); setConfirmOpen(true); } : undefined}
 />
 </>
 );
}