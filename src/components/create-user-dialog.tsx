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
 DialogTrigger,
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
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { createUser } from "@/app/actions/dashboard";
import { ROLES } from "@/lib/constants";

interface CreateUserDialogProps {
 tenantId: string;
 availableRoles: { slug: string; name: string }[];
}

export function CreateUserDialog({ tenantId, availableRoles }: CreateUserDialogProps) {
 const router = useRouter();
 const [open, setOpen] = useState(false);
 const [loading, setLoading] = useState(false);
 const [role, setRole] = useState<string>(ROLES.TENANT_ADMIN);

 async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
 e.preventDefault();
 setLoading(true);

 const form = e.currentTarget;
 const formData = new FormData(form);
 formData.set("tenantId", tenantId);
 formData.set("role", role);

 const result = await createUser(formData);
 setLoading(false);

 if (result.error) {
 toast.error(result.error);
 } else {
 toast.success("User created and assigned to tenant");
 setOpen(false);
 form.reset();
 setRole(ROLES.TENANT_ADMIN);
 router.refresh();
 }
 }

 return (
 <Dialog open={open} onOpenChange={setOpen}>
 <DialogTrigger render={<Button variant="outline" size="sm" className="gap-2 text-blue-600 dark:text-blue-400 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600" />}>
 <UserPlus className="h-4 w-4" />
 Create User
 </DialogTrigger>
 <DialogContent>
 <form onSubmit={handleSubmit}>
 <DialogHeader>
 <DialogTitle>Create New User</DialogTitle>
 <DialogDescription>
 Create a new user account and assign them to this tenant.
 </DialogDescription>
 </DialogHeader>
 <div className="mt-4 space-y-4">
 <div className="space-y-2">
 <Label htmlFor="user-fullname">Full Name</Label>
 <Input
 id="user-fullname"
 name="fullName"
 placeholder="John Doe"
 required
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="user-email">Email</Label>
 <Input
 id="user-email"
 name="email"
 type="email"
 placeholder="john@example.com"
 required
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="user-password">Temporary Password</Label>
 <Input
 id="user-password"
 name="password"
 type="password"
 placeholder="Minimum 6 characters"
 minLength={6}
 required
 />
 </div>
 <div className="space-y-2">
 <Label>Role</Label>
 <Select value={role} onValueChange={(v) => v && setRole(v)}>
 <SelectTrigger>
 <SelectValue>{availableRoles.find((r) => r.slug === role)?.name ?? role}</SelectValue>
 </SelectTrigger>
 <SelectContent>
 {availableRoles.map((r) => (
  <SelectItem key={r.slug} value={r.slug}>{r.name}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 </div>
 <DialogFooter className="mt-6">
 <DialogClose render={<Button type="button" variant="outline" />}>
 Cancel
 </DialogClose>
 <Button type="submit" disabled={loading}>
 {loading ? "Creating..." : "Create User"}
 </Button>
 </DialogFooter>
 </form>
 </DialogContent>
 </Dialog>
 );
}