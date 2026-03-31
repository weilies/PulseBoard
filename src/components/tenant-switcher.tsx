"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuGroup,
 DropdownMenuItem,
 DropdownMenuLabel,
 DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Building2, ChevronDown, Star } from "lucide-react";
import { TENANT_COOKIE } from "@/lib/constants";

interface TenantSwitcherProps {
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 tenants: any[];
 currentTenantId: string | null;
 basePath?: string;
}

export function TenantSwitcher({ tenants, currentTenantId, basePath = "/dashboard/users" }: TenantSwitcherProps) {
 const router = useRouter();
 const currentTenant = tenants.find((t) => t.tenant_id === currentTenantId);
 const currentName = currentTenant?.tenants?.name || "Select tenant";

 function filterTenant(tenantId: string) {
  router.push(`${basePath}?tenant=${tenantId}`);
 }

 if (tenants.length <= 1) {
  return (
   <div className="flex items-center gap-2 text-sm font-medium">
    <Building2 className="h-4 w-4" />
    {currentName}
   </div>
  );
 }

 return (
  <DropdownMenu>
   <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="gap-2" />}>
    <Building2 className="h-4 w-4" />
    {currentName}
    <ChevronDown className="h-3 w-3" />
   </DropdownMenuTrigger>
   <DropdownMenuContent>
    <DropdownMenuGroup>
     <DropdownMenuLabel>Filter Tenant</DropdownMenuLabel>
     {tenants.map((t) => (
      <DropdownMenuItem
       key={t.tenant_id}
       onClick={() => filterTenant(t.tenant_id)}
       className={t.tenant_id === currentTenantId ? "bg-zinc-100 dark:bg-zinc-800" : ""}
      >
       <span className="flex-1">{t.tenants?.name || "Unknown"}</span>
       {t.is_default && <Star className="ml-2 h-3 w-3 fill-amber-400 text-amber-400" />}
      </DropdownMenuItem>
     ))}
    </DropdownMenuGroup>
   </DropdownMenuContent>
  </DropdownMenu>
 );
}
