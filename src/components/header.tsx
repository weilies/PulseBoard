"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuGroup,
 DropdownMenuItem,
 DropdownMenuLabel,
 DropdownMenuSeparator,
 DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { Building2, Clock, LogOut, Menu, Star } from "lucide-react";
import { TENANT_COOKIE } from "@/lib/constants";
import { LanguageSwitcher } from "@/components/language-switcher";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { AvatarUpload } from "@/components/avatar-upload";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { setDefaultTenant, updateUserTimezone } from "@/app/actions/dashboard";
import { COMMON_TIMEZONES } from "@/lib/timezone-constants";
import { toast } from "sonner";

interface HeaderProps {
 userEmail: string;
 userName: string;
 userRole: string | null;
 userId: string;
 userTimezone: string | null;
 avatarUrl?: string | null;
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 tenants: any[];
 currentTenantId: string | null;
 onMobileMenuClick?: () => void;
}

export function Header({
 userEmail,
 userName,
 userRole,
 userId,
 userTimezone,
 avatarUrl,
 tenants,
 currentTenantId,
 onMobileMenuClick,
}: HeaderProps) {
 const router = useRouter();
 const [selectedTz, setSelectedTz] = useState(userTimezone ?? "");

 async function handleLogout() {
 const supabase = createClient();
 await supabase.auth.signOut();
 router.push("/login");
 router.refresh();
 }

 function switchTenant(tenantId: string) {
 document.cookie = `${TENANT_COOKIE}=${tenantId};path=/;samesite=lax`;
 router.refresh();
 }

 async function handleSetDefault(tenantId: string, tenantName: string) {
 const formData = new FormData();
 formData.set("tenantId", tenantId);
 const result = await setDefaultTenant(formData);
 if (result.error) {
 toast.error(result.error);
 } else {
 toast.success(`Default tenant updated to '${tenantName}'`);
 router.refresh();
 }
 }

 async function handleTimezoneChange(tz: string) {
 setSelectedTz(tz);
 const fd = new FormData();
 fd.set("timezone", tz);
 const result = await updateUserTimezone(fd);
 if (result.error) {
 toast.error(result.error);
 } else {
 toast.success("Timezone updated");
 router.refresh();
 }
 }

 const initials = userName
 ? userName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
 : userEmail.slice(0, 2).toUpperCase();

 const currentTenant = tenants.find((t) => t.tenant_id === currentTenantId);
 const currentTenantName = currentTenant?.tenants?.name || "Tenant";

 return (
 <header className="flex h-14 items-center justify-between border-b bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 px-4">
 {/* Left: mobile brand + hamburger */}
 <div className="flex items-center gap-2">
 <button
 onClick={onMobileMenuClick}
 className="md:hidden p-1.5 rounded-md text-blue-400 dark:text-blue-300 hover:text-blue-600 dark:hover:text-blue-400 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
 aria-label="Open navigation"
 >
 <Menu className="h-5 w-5" />
 </button>
 <span className="text-sm font-bold text-blue-600 dark:text-blue-400 tracking-tight md:hidden">
 PulseBox
 </span>
 </div>

 {/* Right: theme toggle + language switcher + bell + avatar dropdown */}
 <div className="flex items-center gap-1">
 <ThemeToggle />
 <LanguageSwitcher />
 {currentTenantId && <NotificationBell tenantId={currentTenantId} />}
 <DropdownMenu>
 <DropdownMenuTrigger render={<Button variant="ghost" className="relative h-8 w-8 rounded-full p-0 hover:bg-gray-100 dark:hover:bg-gray-800" />}>
 <Avatar className="h-8 w-8 bg-gradient-to-br from-blue-500 to-indigo-500">
 {avatarUrl && <AvatarImage src={avatarUrl} alt="Avatar" />}
 <AvatarFallback className="text-xs font-bold text-white">{initials}</AvatarFallback>
 </Avatar>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end" className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 dark:border-gray-700 w-72">
 {/* User Info */}
 <DropdownMenuGroup>
 <DropdownMenuLabel className="text-blue-500 dark:text-blue-400">
 <div className="flex items-center gap-3">
 <AvatarUpload initials={initials} currentUrl={avatarUrl} size="lg" />
 <div className="flex flex-col space-y-0.5">
 <p className="text-sm font-medium text-gray-900 dark:text-gray-100" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
 {userName || "User"}
 </p>
 <p className="text-xs text-gray-500 dark:text-gray-400">{userEmail}</p>
 <p className="text-[10px] text-gray-400 dark:text-gray-400">Click avatar to change photo</p>
 </div>
 </div>
 </DropdownMenuLabel>
 </DropdownMenuGroup>

 {/* Current Tenant */}
 <DropdownMenuSeparator className="bg-blue-50 dark:bg-blue-950 dark:bg-gray-800" />
 <DropdownMenuGroup>
 <DropdownMenuLabel className="text-xs font-normal text-blue-400 dark:text-blue-300 uppercase tracking-wide">
 <div className="flex items-center gap-1">
 <Building2 className="h-3 w-3" />
 Current Tenant
 </div>
 </DropdownMenuLabel>
 <DropdownMenuItem
 disabled
 className="text-gray-900 dark:text-gray-100 font-semibold text-sm flex items-center justify-between"
 style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
 >
 <span>{currentTenantName}</span>
 </DropdownMenuItem>
 </DropdownMenuGroup>

 {/* Tenant Switcher */}
 {tenants.length > 1 && (
 <>
 <DropdownMenuSeparator className="bg-blue-50 dark:bg-blue-950 dark:bg-gray-800" />
 <DropdownMenuGroup>
 <DropdownMenuLabel className="text-xs font-normal text-blue-400 dark:text-blue-300 uppercase tracking-wide">
 Switch Tenant
 </DropdownMenuLabel>
 {tenants
 .filter((t) => t.tenant_id !== currentTenantId)
 .map((t) => (
 <div
 key={t.tenant_id}
 className="flex items-center justify-between px-2 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-blue-300 rounded-md cursor-pointer transition-all"
 style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
 >
 <span onClick={() => switchTenant(t.tenant_id)} className="flex-1">
 {t.tenants?.name || "Unknown"}
 </span>
 <button
 onClick={(e) => {
 e.stopPropagation();
 handleSetDefault(t.tenant_id, t.tenants?.name || "Unknown");
 }}
 className="ml-2 p-1 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded transition-colors"
 title={t.is_default ? "Default tenant" : "Set as default"}
 >
 <Star
 className="h-4 w-4 transition-all"
 style={{
 fill: t.is_default ? '#39ff14' : 'none',
 color: t.is_default ? '#39ff14' : '#8b92c4',
 }}
 />
 </button>
 </div>
 ))}
 </DropdownMenuGroup>
 </>
 )}

 {/* Timezone */}
 <DropdownMenuSeparator className="bg-blue-50 dark:bg-blue-950 dark:bg-gray-800" />
 <DropdownMenuGroup>
 <DropdownMenuLabel className="text-xs font-normal text-blue-400 dark:text-blue-300 uppercase tracking-wide">
 <div className="flex items-center gap-1">
 <Clock className="h-3 w-3" />
 My Timezone
 </div>
 </DropdownMenuLabel>
 <div className="px-2 pb-2">
 <Select value={selectedTz || "Asia/Singapore"} onValueChange={(v) => { if (v) handleTimezoneChange(v); }}>
 <SelectTrigger className="h-8 text-xs bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
 <SelectValue />
 </SelectTrigger>
 <SelectContent className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 dark:border-gray-700 max-h-52">
 {COMMON_TIMEZONES.map((tz) => (
 <SelectItem key={tz.value} value={tz.value} className="text-xs">
 {tz.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 <p className="text-[10px] text-gray-400 dark:text-gray-400 mt-1">Overrides tenant default for your account.</p>
 </div>
 </DropdownMenuGroup>

 {/* Sign out */}
 <DropdownMenuSeparator className="bg-blue-50 dark:bg-blue-950 dark:bg-gray-800" />
 <DropdownMenuGroup>
 <DropdownMenuItem
 onClick={handleLogout}
 className="text-red-400/80 hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
 style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
 >
 <LogOut className="mr-2 h-4 w-4" />
 Sign out
 </DropdownMenuItem>
 </DropdownMenuGroup>
 </DropdownMenuContent>
 </DropdownMenu>
 </div>
 </header>
 );
}