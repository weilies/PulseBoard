export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "PulseBox";
export const SUPER_TENANT_SLUG = process.env.NEXT_PUBLIC_SUPER_TENANT_SLUG || "nextnovas";
export const TENANT_COOKIE = "pb-tenant";

export const ROLES = {
  SUPER_ADMIN: "super_admin",
  TENANT_ADMIN: "tenant_admin",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  suspended: "Suspended",
};

export const LANG_COOKIE = "pb-lang";

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English", short: "EN" },
  { code: "zh-CN", name: "中文", short: "中" },
  { code: "ja", name: "日本語", short: "日" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export const PUBLIC_ROUTES = ["/login", "/signup", "/auth/callback", "/developer", "/forgot-password", "/reset-password"];

export const AUTH_FLOW_RECOVERY = "recovery";
