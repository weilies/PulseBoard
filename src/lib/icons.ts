import * as LucideIcons from "lucide-react";
import { Settings, Box } from "lucide-react";

/**
 * Resolve a Lucide icon name to a React component.
 * Falls back to defaultIcon if name is not found.
 */
export function resolveIcon(
  name: string | null | undefined,
  defaultIcon: React.ComponentType<{ className?: string }>
): React.ComponentType<{ className?: string }> {
  if (name) {
    const pascal = name.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
    const Comp = (LucideIcons as Record<string, unknown>)[pascal];
    if (Comp) return Comp as React.ComponentType<{ className?: string }>;
  }
  return defaultIcon;
}

/** Resolve collection icon (system collections default to Settings/cog, tenant collections to Box) */
export function resolveCollectionIcon(
  icon: string | null | undefined,
  isSystem: boolean
): React.ComponentType<{ className?: string }> {
  return resolveIcon(icon, isSystem ? Settings : Box);
}
