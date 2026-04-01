"use client";

import { useState, useTransition } from "react";
import { installApp, disableApp } from "@/app/actions/apps";
import * as LucideIcons from "lucide-react";
import { Store } from "lucide-react";

interface AppEntry {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  version: string;
  category: string;
  icon: string | null;
  is_system: boolean;
  installStatus: string | null; // "active" | "disabled" | null
}

const CATEGORY_LABELS: Record<string, string> = {
  hr: "HR",
  finance: "Finance",
  operations: "Operations",
  platform: "Platform",
};

const CATEGORY_COLORS: Record<string, string> = {
  hr: "bg-blue-50 text-blue-700 border-blue-200",
  finance: "bg-green-50 text-green-700 border-green-200",
  operations: "bg-orange-50 text-orange-700 border-orange-200",
  platform: "bg-purple-50 text-purple-700 border-purple-200",
};

function resolveIcon(name: string | null): React.ComponentType<{ className?: string }> {
  if (name) {
    const pascal = name.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
    const Comp = (LucideIcons as Record<string, unknown>)[pascal];
    if (Comp) return Comp as React.ComponentType<{ className?: string }>;
  }
  return Store;
}

function AppCard({ app, isSuperAdmin }: { app: AppEntry; isSuperAdmin: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [localStatus, setLocalStatus] = useState(app.installStatus);
  const [error, setError] = useState<string | null>(null);

  const Icon = resolveIcon(app.icon);
  const isActive = localStatus === "active";

  function handleInstall() {
    setError(null);
    startTransition(async () => {
      const result = await installApp(app.id);
      if (result.error) setError(result.error);
      else setLocalStatus("active");
    });
  }

  function handleDisable() {
    setError(null);
    startTransition(async () => {
      const result = await disableApp(app.id);
      if (result.error) setError(result.error);
      else setLocalStatus("disabled");
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 flex flex-col gap-3 hover:shadow-sm transition-shadow">
      {/* App header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 border border-blue-100">
          <Icon className="h-5 w-5 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
              {app.name}
            </span>
            <span className="text-xs text-gray-400 font-mono">v{app.version}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`inline-block rounded border px-1.5 py-0.5 text-xs font-medium ${CATEGORY_COLORS[app.category] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
              {CATEGORY_LABELS[app.category] ?? app.category}
            </span>
            {app.is_system && (
              <span className="inline-block rounded border px-1.5 py-0.5 text-xs font-medium bg-gray-50 text-gray-500 border-gray-200">
                Next Novas
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-500 leading-relaxed flex-1">
        {app.description ?? "No description provided."}
      </p>

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Action */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-100">
        {isActive ? (
          <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Installed
          </span>
        ) : localStatus === "disabled" ? (
          <span className="text-xs text-gray-400">Disabled</span>
        ) : (
          <span className="text-xs text-gray-400">Not installed</span>
        )}

        {isActive ? (
          <button
            onClick={handleDisable}
            disabled={isPending}
            className="rounded border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50"
          >
            {isPending ? "Disabling…" : "Disable"}
          </button>
        ) : (
          <button
            onClick={handleInstall}
            disabled={isPending}
            className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isPending ? "Installing…" : localStatus === "disabled" ? "Re-enable" : "Install"}
          </button>
        )}
      </div>
    </div>
  );
}

export function AppStoreClient({ apps, isSuperAdmin }: { apps: AppEntry[]; isSuperAdmin: boolean }) {
  if (apps.length === 0) {
    return (
      <div className="text-center text-gray-500 py-16 rounded-lg border border-gray-200 bg-gray-50">
        <Store className="h-8 w-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm">No apps available yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {apps.map((app) => (
        <AppCard key={app.id} app={app} isSuperAdmin={isSuperAdmin} />
      ))}
    </div>
  );
}
