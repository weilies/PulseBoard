"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import * as LucideIcons from "lucide-react";
import { Workflow, MoreHorizontal, PlayCircle, PauseCircle, Settings, ScrollText, Trash2, CheckCircle2, XCircle, Clock, Store, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { pauseInstalledApp, resumeInstalledApp, uninstallPlatformApp } from "@/app/actions/platform-apps";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AppInfo {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  type: string;
  version: string;
  config_schema: { fields?: Array<{ key: string; type: string; label: string }> } | null;
}

interface JobRun {
  id: string;
  tenant_installed_app_id: string;
  triggered_at: string;
  completed_at: string | null;
  status: string;
  summary: Record<string, unknown> | null;
}

interface InstallEntry {
  id: string;
  enabled: boolean;
  config: Record<string, unknown>;
  installed_at: string;
  n8n_workflow_id: string | null;
  app: AppInfo;
  latestRun: JobRun | null;
}

interface ActivityEntry extends JobRun {
  appName: string;
  appIcon: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveIcon(name: string | null): React.ComponentType<{ className?: string }> {
  if (name) {
    const pascal = name.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
    const Comp = (LucideIcons as Record<string, unknown>)[pascal];
    if (Comp) return Comp as React.ComponentType<{ className?: string }>;
  }
  return Workflow;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function getCronField(app: AppInfo, config: Record<string, unknown>): string | null {
  const cronField = (app.config_schema?.fields ?? []).find((f) => f.type === "cron");
  if (!cronField) return null;
  return (config[cronField.key] as string) ?? null;
}

function describeCronSimple(expr: string | null): string {
  if (!expr) return "Manual";
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return "Custom";
  const [min, hour, dom, month, dow] = parts;
  if (min === "*" && hour === "*") return "Every minute";
  if (min === "0" && hour === "*") return "Hourly";
  if (dom === "*" && month === "*" && dow === "*" && !isNaN(parseInt(hour))) {
    const ampm = parseInt(hour) >= 12 ? "PM" : "AM";
    const h = parseInt(hour) % 12 || 12;
    return `Daily ${h}:${String(parseInt(min)).padStart(2, "0")} ${ampm}`;
  }
  if (dom === "*" && month === "*") {
    const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const d = parseInt(dow);
    if (!isNaN(d) && DAYS[d]) return `Weekly ${DAYS[d]}`;
  }
  return "Scheduled";
}

// ---------------------------------------------------------------------------
// Status dot
// ---------------------------------------------------------------------------

function StatusDot({ enabled, latestRun }: { enabled: boolean; latestRun: JobRun | null }) {
  if (!enabled) return <span className="h-2 w-2 rounded-full bg-gray-300 shrink-0 mt-1" title="Paused" />;
  if (!latestRun || latestRun.status === "running") return <span className="h-2 w-2 rounded-full bg-blue-400 shrink-0 mt-1 animate-pulse" title="Running / No runs yet" />;
  if (latestRun.status === "success") return <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 mt-1" title="Last run: success" />;
  return <span className="h-2 w-2 rounded-full bg-red-500 shrink-0 mt-1" title="Last run: failed" />;
}

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

function AppContextMenu({
  install,
  onAction,
}: {
  install: InstallEntry;
  onAction: (action: "pause" | "resume" | "uninstall") => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="rounded p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        aria-label="More options"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-7 z-20 w-44 rounded-lg border border-gray-200 bg-white shadow-lg py-1 text-sm">
            <Link
              href={`/dashboard/studio/automata/${install.id}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 w-full px-3 py-2 text-gray-700 hover:bg-gray-50"
            >
              <Settings className="h-3.5 w-3.5 text-gray-400" /> Configure
            </Link>
            <Link
              href={`/dashboard/studio/automata/${install.id}?tab=logs`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 w-full px-3 py-2 text-gray-700 hover:bg-gray-50"
            >
              <ScrollText className="h-3.5 w-3.5 text-gray-400" /> View Logs
            </Link>
            <div className="border-t border-gray-100 my-1" />
            {install.enabled ? (
              <button
                onClick={() => { setOpen(false); onAction("pause"); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-gray-700 hover:bg-gray-50"
              >
                <PauseCircle className="h-3.5 w-3.5 text-gray-400" /> Pause
              </button>
            ) : (
              <button
                onClick={() => { setOpen(false); onAction("resume"); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-gray-700 hover:bg-gray-50"
              >
                <PlayCircle className="h-3.5 w-3.5 text-gray-400" /> Resume
              </button>
            )}
            <div className="border-t border-gray-100 my-1" />
            <button
              onClick={() => { setOpen(false); onAction("uninstall"); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Uninstall
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Uninstall confirmation dialog
// ---------------------------------------------------------------------------

function UninstallDialog({
  install,
  onClose,
}: {
  install: InstallEntry;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleUninstall() {
    startTransition(async () => {
      const result = await uninstallPlatformApp(install.id);
      if (result.error) { setError(result.error); return; }
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Uninstall {install.app.name}?</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm text-gray-600">
          <p>This will:</p>
          <ul className="list-disc pl-4 space-y-1 text-gray-500">
            <li>Deactivate the n8n workflow</li>
            <li>Remove the install record from PulseBox</li>
            <li>Preserve historical job run logs</li>
          </ul>
          <p className="text-gray-500">Credentials stored in n8n vault are not deleted automatically — remove them manually in n8n if needed.</p>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button variant="destructive" onClick={handleUninstall} disabled={isPending}>
            {isPending ? "Uninstalling…" : "Confirm Uninstall"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// App row
// ---------------------------------------------------------------------------

function AppRow({ install: initialInstall }: { install: InstallEntry }) {
  const [install, setInstall] = useState(initialInstall);
  const [isPending, startTransition] = useTransition();
  const [uninstallTarget, setUninstallTarget] = useState(false);

  const Icon = resolveIcon(install.app.icon);
  const cron = getCronField(install.app, install.config);
  const schedule = describeCronSimple(cron);
  const lastRun = install.latestRun;

  function handleAction(action: "pause" | "resume" | "uninstall") {
    if (action === "uninstall") { setUninstallTarget(true); return; }
    startTransition(async () => {
      const fn = action === "pause" ? pauseInstalledApp : resumeInstalledApp;
      await fn(install.id);
      setInstall((prev) => ({ ...prev, enabled: action === "resume" }));
    });
  }

  return (
    <>
      <div className="flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0">
        <StatusDot enabled={install.enabled} latestRun={lastRun} />

        {/* Icon */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 border border-blue-100">
          <Icon className="h-4 w-4 text-blue-600" />
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/dashboard/studio/automata/${install.id}`}
              className="font-medium text-gray-900 text-sm hover:text-blue-600 transition-colors"
            >
              {install.app.name}
            </Link>
            <span className="text-xs text-gray-400 font-mono">v{install.app.version}</span>
            {!install.enabled && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Paused</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
            <span>{install.app.type === "n8n_workflow" ? "Workflow" : "Bundle"}</span>
            <span>·</span>
            <span>{schedule}</span>
          </div>
        </div>

        {/* Last run */}
        <div className="hidden sm:block text-right text-xs min-w-[120px]">
          {lastRun ? (
            <>
              <div className="flex items-center justify-end gap-1">
                {lastRun.status === "success" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                ) : lastRun.status === "running" ? (
                  <Clock className="h-3.5 w-3.5 text-blue-400 animate-spin" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-red-500" />
                )}
                <span className={lastRun.status === "success" ? "text-emerald-600" : lastRun.status === "running" ? "text-blue-500" : "text-red-500"}>
                  {lastRun.status === "running" ? "Running…" : lastRun.status}
                </span>
              </div>
              <span className="text-gray-400">{timeAgo(lastRun.triggered_at)}</span>
            </>
          ) : (
            <span className="text-gray-400">No runs yet</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {isPending && <Clock className="h-3.5 w-3.5 text-gray-400 animate-spin" />}
          <AppContextMenu install={install} onAction={handleAction} />
        </div>
      </div>

      {uninstallTarget && (
        <UninstallDialog install={install} onClose={() => setUninstallTarget(false)} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------

function ActivityFeed({ runs }: { runs: ActivityEntry[] }) {
  if (runs.length === 0) {
    return (
      <div className="text-center text-gray-400 py-6 text-sm">
        No activity yet — runs will appear here once automations execute.
      </div>
    );
  }

  // Group by day
  const groups: Record<string, ActivityEntry[]> = {};
  for (const run of runs) {
    const day = formatDate(run.triggered_at);
    if (!groups[day]) groups[day] = [];
    groups[day].push(run);
  }

  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([day, dayRuns]) => (
        <div key={day}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{day}</p>
          <div className="space-y-1">
            {dayRuns.map((run) => {
              const Icon = resolveIcon(run.appIcon);
              const rows = (run.summary as { total_rows?: number } | null)?.total_rows;
              const errors = (run.summary as { error_count?: number } | null)?.error_count;
              return (
                <div key={run.id} className="flex items-center gap-3 text-sm py-1.5 border-b border-gray-50">
                  <span className="text-xs text-gray-400 w-12 shrink-0">{formatTime(run.triggered_at)}</span>
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-gray-100">
                    <Icon className="h-3 w-3 text-gray-500" />
                  </div>
                  <span className="text-gray-700 flex-1 truncate">{run.appName}</span>
                  {run.status === "success" ? (
                    <span className="flex items-center gap-1 text-emerald-600 text-xs shrink-0">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {rows != null ? `${rows.toLocaleString()} rows` : "Success"}
                    </span>
                  ) : run.status === "running" ? (
                    <span className="flex items-center gap-1 text-blue-500 text-xs shrink-0">
                      <Clock className="h-3.5 w-3.5 animate-spin" /> Running…
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-500 text-xs shrink-0">
                      <XCircle className="h-3.5 w-3.5" />
                      {errors != null ? `${errors} error${errors !== 1 ? "s" : ""}` : run.status}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------

export function AutomataDashboard({
  installs,
  activityFeed,
}: {
  installs: InstallEntry[];
  activityFeed: ActivityEntry[];
}) {
  const active = installs.filter((i) => i.enabled).length;
  const errors = installs.filter(
    (i) => i.enabled && i.latestRun && !["success", "running"].includes(i.latestRun.status)
  ).length;
  const paused = installs.filter((i) => !i.enabled).length;

  // Empty state
  if (installs.length === 0) {
    return (
      <div className="space-y-6">
        {/* Guide banner */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-5 space-y-3">
          <div className="flex items-center gap-2 text-blue-700 font-semibold">
            <Info className="h-5 w-5" />
            Getting started with Automata
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-blue-800">
            <div className="flex flex-col gap-1">
              <span className="font-medium">① Browse App Store</span>
              <span className="text-blue-600 text-xs">Find n8n-powered integrations published by Next Novas for your vertical.</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-medium">② Install &amp; Configure</span>
              <span className="text-blue-600 text-xs">Run the 4-step wizard: overview → config fields → access policy → confirm. Your n8n workflow is cloned automatically.</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-medium">③ Monitor here</span>
              <span className="text-blue-600 text-xs">Automata dashboard shows real-time status, last run result, and an activity feed across all installed apps.</span>
            </div>
          </div>
          <div className="pt-1">
            <Link
              href="/dashboard/studio/app-store"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 transition-colors"
            >
              <Store className="h-4 w-4" /> Browse App Store
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-gray-500">
          <span className="text-4xl block mb-3">⚡</span>
          <p className="font-medium text-gray-700">No automations installed yet</p>
          <p className="text-sm mt-1 text-gray-400">Visit the App Store to install your first integration.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats strip */}
      <div className="flex items-center gap-6 text-sm text-gray-500">
        <span><strong className="text-gray-900">{installs.length}</strong> installed</span>
        <span>·</span>
        <span><strong className="text-emerald-600">{active}</strong> active</span>
        {errors > 0 && <><span>·</span><span><strong className="text-red-500">{errors}</strong> error{errors !== 1 ? "s" : ""}</span></>}
        {paused > 0 && <><span>·</span><span><strong className="text-gray-400">{paused}</strong> paused</span></>}
      </div>

      {/* App list */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Installed Apps</span>
          <span className="text-xs text-gray-300">— click an app name to configure or view details</span>
        </div>
        {installs.map((install) => (
          <AppRow key={install.id} install={install} />
        ))}
      </div>

      {/* Activity feed */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recent Activity</span>
          <span className="text-xs text-gray-300 ml-2">— last 20 runs across all apps</span>
        </div>
        <div className="p-4">
          <ActivityFeed runs={activityFeed} />
        </div>
      </div>
    </div>
  );
}
