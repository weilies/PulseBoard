"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Eye, Shield, UserMinus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { updateUserRole, removeUserFromTenant, deleteUser } from "@/app/actions/dashboard";
import { ROLES } from "@/lib/constants";
import { UserDetailDialog } from "@/components/user-detail-dialog";

interface RoleOption {
  slug: string;
  name: string;
}

interface MemberActionsProps {
  userId: string;
  tenantId: string;
  currentRole: string;
  fullName: string;
  email: string;
  status: string;
  isSuperAdmin?: boolean;
  isSuperTenant?: boolean;
  allTenants?: any[];
  availableRoles: RoleOption[];
}

const ROLE_LABELS: Record<string, string> = {
  [ROLES.TENANT_ADMIN]: "Tenant Admin",
  [ROLES.SUPER_ADMIN]: "Super Admin",
};

export function MemberActions({
  userId,
  tenantId,
  currentRole,
  fullName,
  email,
  status,
  isSuperAdmin,
  isSuperTenant,
  allTenants,
  availableRoles,
}: MemberActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  async function handleRoleChange(newRole: string) {
    if (newRole === currentRole) return;
    setLoading(true);

    const formData = new FormData();
    formData.set("userId", userId);
    formData.set("tenantId", tenantId);
    formData.set("role", newRole);

    const result = await updateUserRole(formData);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Role updated to ${ROLE_LABELS[newRole] || newRole}`);
    }
  }

  async function handleRemove() {
    if (!confirm("Remove this user from the tenant? They will lose access but their account remains.")) {
      return;
    }
    setLoading(true);

    const formData = new FormData();
    formData.set("userId", userId);
    formData.set("tenantId", tenantId);

    const result = await removeUserFromTenant(formData);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("User removed from tenant");
      router.refresh();
    }
  }

  async function handleDelete() {
    if (!confirm(`Permanently delete user "${fullName || email}"? This cannot be undone.`)) {
      return;
    }
    setLoading(true);

    const formData = new FormData();
    formData.set("userId", userId);

    const result = await deleteUser(formData);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("User deleted");
      router.refresh();
    }
  }

  // Build role labels including custom roles
  const allRoleLabels: Record<string, string> = { ...ROLE_LABELS };
  for (const r of availableRoles) {
    if (!allRoleLabels[r.slug]) {
      allRoleLabels[r.slug] = r.name;
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={loading}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:text-blue-600 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-white border-gray-300 text-gray-900">
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => setDetailOpen(true)}
              className="cursor-pointer hover:bg-gray-100 hover:text-blue-600"
            >
              <Eye className="mr-2 h-4 w-4" />
              View / Edit
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator className="bg-blue-50" />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs font-normal text-gray-400 uppercase tracking-wide">
              <div className="flex items-center gap-1">
                <Shield className="h-3 w-3" />
                Change Role
              </div>
            </DropdownMenuLabel>
            {availableRoles.map(({ slug, name }) => (
              <DropdownMenuItem
                key={slug}
                onClick={() => handleRoleChange(slug)}
                className={`cursor-pointer hover:bg-gray-100 hover:text-blue-600 ${slug === currentRole ? "bg-gray-100 text-blue-600 font-medium" : ""}`}
              >
                {name}
                {slug === currentRole && " (current)"}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator className="bg-blue-50" />
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={handleRemove}
              className="cursor-pointer hover:bg-gray-100 hover:text-blue-600"
            >
              <UserMinus className="mr-2 h-4 w-4" />
              Remove from Tenant
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleDelete}
              className="cursor-pointer text-red-400 hover:bg-red-50 hover:text-red-300"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete User
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <UserDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        userId={userId}
        fullName={fullName}
        email={email}
        role={currentRole}
        status={status}
        isSuperAdmin={isSuperAdmin}
        allTenants={allTenants}
        tenantId={tenantId}
        availableRoles={availableRoles}
      />
    </>
  );
}
