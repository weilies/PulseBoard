"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import * as LucideIcons from "lucide-react";
import {
  Workflow, PlayCircle, PauseCircle, RefreshCw, CheckCircle2, XCircle, Clock,
  ShieldCheck, Settings, ScrollText, Eye, KeyRound, Info, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  pauseInstalledApp, resumeInstalledApp,
  updateInstalledAppConfig, updateInstalledAppAccess, updateAppCredential,
} from "@/app/actions/platform-apps";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConfigSchemaField {
  key: string;
  label: string;
  type: "text" | "cron" | "credential" | "select" | "boolean";
  options?: string[];
  n8n_credential_type?: string;
  required?: boolean;
  placeholder?: string;
}

interface AppInfo {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  type: string;
  version: string;
  config_schema: { fields?: ConfigSchemaField[] } | null;
}

interface InstallInfo {
  id: string;
  enabled: boolean;
  config: Record<string, unknown>;
  access_policy: Record<string, unknown>;
  installed_at: string;
  installed_by_email: string | null;
  n8n_workflow_id: string | null;
}

interface Credential {
  credential_key: string;
  last_updated_at: string;
}

interface Role { id: string; name: string; }

interface JobStats {
  totalRuns: number;
  successRate: number | null;
  lastRun: { id: string; status: string; triggered_at: string; completed_at: string | null; summary: Record<string, unknown> | null } | null;
}

interface WorkflowNode { index: number; name: string; type: string; parameters: Record<string, unknown>; }
interface LogRun {
  id: string; n8n_execution_id: string | null; triggered_at: string;
  completed_at: string | null; duration_ms: number | null; status: string;
  summary: Record<string, unknown> | null;
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
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDuration(ms: number | null): string {
  if (ms == null || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return "Custom schedule";
  const [min, hour, dom, month, dow] = parts;
  if (min === "*" && hour === "*" && dom === "*" && month === "*" && dow === "*") return "Every minute";
  if (min === "0" && hour === "*") return "Every hour, on the hour";
  if (hour?.startsWith("*/")) return `Every ${hour.slice(2)} hours`;
  const h = parseInt(hour), m = parseInt(min);
  if (!isNaN(h) && !isNaN(m)) {
    const ampm = h >= 12 ? "PM" : "AM";
    const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const time = `${dh}:${String(m).padStart(2, "0")} ${ampm}`;
    if (dom === "*" && month === "*" && dow === "*") return `Every day at ${time}`;
    const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    if (dom === "*" && month === "*" && !isNaN(parseInt(dow)) && DAYS[parseInt(dow)]) {
      return `Every ${DAYS[parseInt(dow)]} at ${time}`;
    }
    if (dom === "1" && month === "*" && dow === "*") return `1st of every month at ${time}`;
  }
  return "Custom schedule — " + expr;
}

function nextCronRun(expr: string): Date | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, , , dow] = parts;
  const h = parseInt(hour), m = parseInt(min);
  if (isNaN(h) || isNaN(m)) return null;
  const now = new Date();
  if (dow !== "*" && !isNaN(parseInt(dow))) {
    const d = parseInt(dow);
    const next = new Date(now);
    const dayDiff = (d - now.getDay() + 7) % 7 || 7;
    next.setDate(next.getDate() + dayDiff);
    next.setHours(h, m, 0, 0);
    return next;
  }
  const next = new Date(now);
  next.setHours(h, m, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}

// ---------------------------------------------------------------------------
// Cron preset buttons
// ---------------------------------------------------------------------------

const CRON_PRESETS = [
  { label: "Daily 6AM", value: "0 6 * * *" },
  { label: "Daily midnight", value: "0 0 * * *" },
  { label: "Hourly", value: "0 * * * *" },
  { label: "Every Mon 8AM", value: "0 8 * * 1" },
  { label: "1st of month 9AM", value: "0 9 1 * *" },
];

// ---------------------------------------------------------------------------
// Tab: Overview
// ---------------------------------------------------------------------------

function OverviewTab({ install, app, stats }: { install: InstallInfo; app: AppInfo; stats: JobStats }) {
  const Icon = resolveIcon(app.icon);
  const lastRun = stats.lastRun;

  return (
    <div className="space-y-6">
      {/* App identity card */}
      <div className="flex items-start gap-4 p-5 rounded-lg border border-gray-200 bg-white">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-blue-50 border border-blue-100">
          <Icon className="h-7 w-7 text-blue-600" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-bold text-gray-900">{app.name}</span>
            <span className="text-sm text-gray-400 font-mono">v{app.version}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${install.enabled ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-gray-100 text-gray-500 border border-gray-200"}`}>
              {install.enabled ? "Active" : "Paused"}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">{app.description ?? "No description."}</p>
          <div className="mt-2 flex gap-4 text-xs text-gray-400">
            <span>Type: <span className="text-gray-600">{app.type === "n8n_workflow" ? "n8n Workflow" : "Collection Bundle"}</span></span>
            <span>Published by: <span className="text-gray-600">Next Novas</span></span>
          </div>
        </div>
      </div>

      {/* Install metadata */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="p-3 rounded-lg border border-gray-200 bg-white">
          <p className="text-xs text-gray-400 mb-1">Installed</p>
          <p className="text-gray-700">{new Date(install.installed_at).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <div className="p-3 rounded-lg border border-gray-200 bg-white">
          <p className="text-xs text-gray-400 mb-1">Installed by</p>
          <p className="text-gray-700">{install.installed_by_email ?? "—"}</p>
        </div>
      </div>

      {/* Quick stats — last 30 days */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Last 30 Days</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="p-4 rounded-lg border border-gray-200 bg-white text-center">
            <p className="text-2xl font-bold text-gray-900">{stats.totalRuns}</p>
            <p className="text-xs text-gray-400 mt-1">Total Runs</p>
            <p className="text-xs text-gray-300 mt-0.5">All executions triggered in the past 30 days</p>
          </div>
          <div className="p-4 rounded-lg border border-gray-200 bg-white text-center">
            <p className={`text-2xl font-bold ${stats.successRate == null ? "text-gray-300" : stats.successRate >= 90 ? "text-emerald-600" : stats.successRate >= 70 ? "text-yellow-500" : "text-red-500"}`}>
              {stats.successRate == null ? "—" : `${stats.successRate}%`}
            </p>
            <p className="text-xs text-gray-400 mt-1">Success Rate</p>
            <p className="text-xs text-gray-300 mt-0.5">% of runs that completed without errors</p>
          </div>
          <div className="p-4 rounded-lg border border-gray-200 bg-white text-center">
            <p className="text-sm font-semibold text-gray-700 truncate">{lastRun ? timeAgo(lastRun.triggered_at) : "—"}</p>
            <p className="text-xs text-gray-400 mt-1">Last Run</p>
            {lastRun && (
              <p className={`text-xs mt-0.5 ${lastRun.status === "success" ? "text-emerald-500" : "text-red-500"}`}>{lastRun.status}</p>
            )}
          </div>
        </div>
      </div>

      {/* Last run summary */}
      {lastRun?.summary && Object.keys(lastRun.summary).length > 0 && (
        <div className="p-4 rounded-lg border border-gray-100 bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Last Run Summary</p>
          <div className="flex flex-wrap gap-4 text-sm">
            {Object.entries(lastRun.summary).map(([k, v]) => (
              <span key={k} className="text-gray-600">
                <span className="text-gray-400">{k.replace(/_/g, " ")}: </span>
                <strong>{String(v)}</strong>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Schedule
// ---------------------------------------------------------------------------

function ScheduleTab({ install, app, onUpdate }: { install: InstallInfo; app: AppInfo; onUpdate: (config: Record<string, unknown>) => void }) {
  const cronField = (app.config_schema?.fields ?? []).find((f) => f.type === "cron");
  const [cronValue, setCronValue] = useState(
    cronField ? ((install.config[cronField.key] as string) ?? "") : ""
  );
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPausing, startPauseTransition] = useTransition();

  const nextRun = cronValue ? nextCronRun(cronValue) : null;

  function handleSave() {
    if (!cronField) return;
    setError(null); setSaved(false);
    startTransition(async () => {
      const newConfig = { ...install.config, [cronField.key]: cronValue };
      const fd = new FormData();
      fd.set("installed_app_id", install.id);
      fd.set("config", JSON.stringify(newConfig));
      const result = await updateInstalledAppConfig(fd);
      if (result.error) { setError(result.error); return; }
      onUpdate(newConfig);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  function handleToggle() {
    startPauseTransition(async () => {
      const fn = install.enabled ? pauseInstalledApp : resumeInstalledApp;
      await fn(install.id);
    });
  }

  return (
    <div className="space-y-5">
      {/* Guide */}
      <div className="flex items-start gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded-lg p-4">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium">How scheduling works</p>
          <p className="text-blue-600 text-xs">The cron expression below controls when this automation runs. Changes here update the PulseBox config. If n8n is connected, the workflow schedule is managed there. Use the preset buttons for common patterns, or enter a custom cron expression.</p>
        </div>
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 bg-white">
        <div>
          <p className="font-medium text-gray-800">Workflow Active</p>
          <p className="text-xs text-gray-400 mt-0.5">When paused, the n8n workflow is deactivated and will not run on schedule.</p>
        </div>
        <button
          onClick={handleToggle}
          disabled={isPausing}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${install.enabled ? "bg-gray-100 text-gray-600 hover:bg-gray-200" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}
        >
          {install.enabled ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
          {isPausing ? "Updating…" : install.enabled ? "Pause" : "Resume"}
        </button>
      </div>

      {cronField ? (
        <>
          {/* Presets */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Quick Presets</p>
            <div className="flex flex-wrap gap-2">
              {CRON_PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setCronValue(p.value)}
                  className={`rounded border px-3 py-1 text-xs transition-colors ${cronValue === p.value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:text-blue-600"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cron input */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Cron Expression</label>
            <div className="flex gap-2">
              <Input
                value={cronValue}
                onChange={(e) => setCronValue(e.target.value)}
                placeholder="0 6 * * *"
                className="font-mono"
              />
              <Button onClick={handleSave} disabled={isPending || !cronValue}>
                {isPending ? "Saving…" : saved ? "Saved ✓" : "Save"}
              </Button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Format: minute hour day month weekday (0–59 0–23 1–31 1–12 0–6)</p>
            <p className="text-xs text-gray-400 mt-0.5">Examples: <span className="font-mono text-blue-500">0 6 * * *</span> = daily 6AM · <span className="font-mono text-blue-500">0 * * * *</span> = hourly · <span className="font-mono text-blue-500">0 8 * * 1</span> = every Monday 8AM</p>
          </div>

          {/* Preview */}
          {cronValue && (
            <div className="p-4 rounded-lg border border-gray-100 bg-gray-50 space-y-1 text-sm">
              <p className="text-gray-500">Schedule: <strong className="text-gray-800">{describeCron(cronValue)}</strong></p>
              {nextRun && (
                <p className="text-gray-400 text-xs">Next run: {nextRun.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="p-5 text-center text-gray-400 border border-gray-200 rounded-lg">
          <Clock className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p className="font-medium text-gray-500">Manual execution only</p>
          <p className="text-sm mt-1">This app does not have a scheduled trigger configured. Use &ldquo;Run Now&rdquo; to execute it manually.</p>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Credentials
// ---------------------------------------------------------------------------

function UpdateCredentialDialog({
  installedAppId,
  credKey,
  onClose,
}: {
  installedAppId: string;
  credKey: string;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    if (!value.trim()) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("installed_app_id", installedAppId);
      fd.set("credential_key", credKey);
      fd.set("value", JSON.stringify({ value }));
      const result = await updateAppCredential(fd);
      if (result.error) { setError(result.error); return; }
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Update Credential: {credKey}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded p-3">
            <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
            <span>The value you enter is sent directly to the n8n credential vault. PulseBox stores only the credential reference ID — your secret is never retained here.</span>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">New value</label>
            <Input
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter new credential value…"
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending || !value.trim()}>
            {isPending ? "Saving…" : "Update in n8n"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CredentialsTab({ install, app, credentials }: { install: InstallInfo; app: AppInfo; credentials: Credential[] }) {
  const [updateTarget, setUpdateTarget] = useState<string | null>(null);

  const credFields = (app.config_schema?.fields ?? []).filter((f) => f.type === "credential");
  const credMap = new Map(credentials.map((c) => [c.credential_key, c]));

  if (credFields.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400 border border-gray-200 rounded-lg">
        <KeyRound className="h-8 w-8 mx-auto mb-2 text-gray-300" />
        <p>This app does not require credentials.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-4">
        <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Credentials are stored securely in n8n</p>
          <p className="text-xs text-amber-600 mt-0.5">PulseBox only stores a reference ID. You can update credentials below, but values are never displayed here. To revoke access, update the credential in n8n directly.</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 overflow-hidden">
        {credFields.map((field, i) => {
          const stored = credMap.get(field.key);
          return (
            <div key={field.key} className={`flex items-center gap-4 p-4 ${i > 0 ? "border-t border-gray-100" : ""}`}>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">{field.label}</p>
                <p className="text-xs text-gray-400 font-mono mt-0.5">type: {field.n8n_credential_type ?? "generic"}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-400 font-mono tracking-widest">••••••••</p>
                {stored ? (
                  <p className="text-xs text-gray-300 mt-0.5">Updated {new Date(stored.last_updated_at).toLocaleDateString()}</p>
                ) : (
                  <p className="text-xs text-orange-400 mt-0.5">Not configured</p>
                )}
              </div>
              <button
                onClick={() => setUpdateTarget(field.key)}
                className="rounded border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
              >
                Update
              </button>
            </div>
          );
        })}
      </div>

      {updateTarget && (
        <UpdateCredentialDialog
          installedAppId={install.id}
          credKey={updateTarget}
          onClose={() => setUpdateTarget(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Config
// ---------------------------------------------------------------------------

function ConfigTab({ install, app, onUpdate }: { install: InstallInfo; app: AppInfo; onUpdate: (config: Record<string, unknown>) => void }) {
  const nonCredFields = (app.config_schema?.fields ?? []).filter((f) => f.type !== "credential");
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(nonCredFields.map((f) => [f.key, String(install.config[f.key] ?? "")]))
  );
  const [cronPreviews, setCronPreviews] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange(key: string, value: string, type: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (type === "cron") setCronPreviews((prev) => ({ ...prev, [key]: describeCron(value) }));
  }

  function handleSave() {
    setError(null); setSaved(false);
    startTransition(async () => {
      const newConfig = { ...install.config, ...values };
      const fd = new FormData();
      fd.set("installed_app_id", install.id);
      fd.set("config", JSON.stringify(newConfig));
      const result = await updateInstalledAppConfig(fd);
      if (result.error) { setError(result.error); return; }
      onUpdate(newConfig);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  if (nonCredFields.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400 border border-gray-200 rounded-lg">
        <Settings className="h-8 w-8 mx-auto mb-2 text-gray-300" />
        <p>This app has no configurable fields.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-4">
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-gray-400" />
        <span>These are non-sensitive configuration values for this app — things like API endpoints, collection targets, or notification emails. Sensitive secrets are managed in the Credentials tab.</span>
      </div>

      <div className="space-y-4">
        {nonCredFields.map((field) => (
          <div key={field.key}>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              {field.label}{field.required && <span className="text-red-500 ml-1">*</span>}
              {field.type === "cron" && <span className="ml-2 text-gray-400 font-normal">(cron expression)</span>}
            </label>

            {field.type === "boolean" ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={values[field.key] === "true"}
                  onChange={(e) => handleChange(field.key, String(e.target.checked), field.type)}
                  className="h-4 w-4"
                />
                Enable
              </label>
            ) : field.type === "select" ? (
              <Select value={values[field.key] ?? ""} onValueChange={(v) => v && handleChange(field.key, v, field.type)}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {(field.options ?? []).map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <>
                <Input
                  value={values[field.key] ?? ""}
                  onChange={(e) => handleChange(field.key, e.target.value, field.type)}
                  placeholder={field.placeholder ?? (field.type === "cron" ? "e.g. 0 6 * * *" : "")}
                  className={field.type === "cron" ? "font-mono" : ""}
                />
                {field.type === "cron" && values[field.key] && (
                  <p className="text-xs text-blue-600 mt-1">{cronPreviews[field.key] ?? describeCron(values[field.key])}</p>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isPending}>{isPending ? "Saving…" : "Save Config"}</Button>
        {saved && <span className="text-sm text-emerald-600">✓ Saved</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Access
// ---------------------------------------------------------------------------

function AccessTab({ install, roles, onUpdate }: { install: InstallInfo; roles: Role[]; onUpdate: (policy: Record<string, unknown>) => void }) {
  const policy = install.access_policy as { view_definition?: string[]; view_logs?: string[] };
  const [viewDef, setViewDef] = useState<string[]>(policy.view_definition ?? []);
  const [viewLogs, setViewLogs] = useState<string[]>(policy.view_logs ?? []);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  function handleSave() {
    setError(null); setSaved(false);
    startTransition(async () => {
      const newPolicy = { view_definition: viewDef, view_logs: viewLogs };
      const fd = new FormData();
      fd.set("installed_app_id", install.id);
      fd.set("access_policy", JSON.stringify(newPolicy));
      const result = await updateInstalledAppAccess(fd);
      if (result.error) { setError(result.error); return; }
      onUpdate(newPolicy);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-4">
        <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-gray-400" />
        <div>
          <p className="font-medium text-gray-700">Role-based access control</p>
          <p className="text-xs mt-1">Control which roles can view the workflow definition and job logs. Leave a section empty to allow all roles. <strong>Admins always have full access.</strong></p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { label: "View Workflow Definition", desc: "Can see the workflow node list (no credential values)", list: viewDef, setList: setViewDef, icon: Eye },
          { label: "View Job Logs", desc: "Can see execution history and row-level errors", list: viewLogs, setList: setViewLogs, icon: ScrollText },
        ].map(({ label, desc, list, setList, icon: Icon }) => (
          <div key={label} className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon className="h-4 w-4 text-gray-400" />
              <p className="text-sm font-medium text-gray-700">{label}</p>
            </div>
            <p className="text-xs text-gray-400 mb-3">{desc}</p>
            {roles.length === 0 ? (
              <p className="text-xs text-gray-300 italic">No roles configured</p>
            ) : (
              <div className="space-y-1.5">
                {roles.map((role) => (
                  <label key={role.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={list.includes(role.id)}
                      onChange={() => toggle(list, setList, role.id)}
                      className="h-3.5 w-3.5"
                    />
                    {role.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isPending}>{isPending ? "Saving…" : "Save Access Policy"}</Button>
        {saved && <span className="text-sm text-emerald-600">✓ Saved</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Workflow
// ---------------------------------------------------------------------------

function WorkflowTab({ installedAppId, n8nWorkflowId }: { installedAppId: string; n8nWorkflowId: string | null }) {
  const [nodes, setNodes] = useState<WorkflowNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchNodes = useCallback(async () => {
    if (!n8nWorkflowId) return;
    setLoading(true); setError(null);
    const res = await fetch(`/api/automata/${installedAppId}/workflow-nodes`);
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed to load workflow"); setLoading(false); return; }
    setNodes(data.nodes);
    setLoading(false);
  }, [installedAppId, n8nWorkflowId]);

  useEffect(() => { fetchNodes(); }, [fetchNodes]);

  if (!n8nWorkflowId) {
    return (
      <div className="p-8 text-center text-gray-400 border border-gray-200 rounded-lg">
        <Workflow className="h-8 w-8 mx-auto mb-2 text-gray-300" />
        <p className="font-medium text-gray-500">No workflow linked</p>
        <p className="text-sm mt-1">This app does not have an n8n workflow associated.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-4">
        <Eye className="h-4 w-4 shrink-0 mt-0.5 text-gray-400" />
        <div>
          <p className="font-medium text-gray-700">Read-only workflow view</p>
          <p className="text-xs mt-1">Shows the steps (nodes) in your n8n workflow. Credential values are stripped — only structural parameters are shown. To edit the workflow, open n8n directly.</p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-gray-400 py-8 justify-center">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading workflow…
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-500 bg-red-50 border border-red-100 rounded-lg p-4">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p className="text-sm">{error}</p>
          <button onClick={fetchNodes} className="ml-auto text-xs underline">Retry</button>
        </div>
      )}

      {nodes && (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          {nodes.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">No nodes found in this workflow.</p>
          ) : (
            nodes.map((node, i) => (
              <div key={node.index} className={`flex items-start gap-3 p-4 ${i > 0 ? "border-t border-gray-100" : ""} ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                <span className="text-xs text-gray-300 font-mono w-5 shrink-0 mt-0.5">{node.index}.</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{node.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{node.type}</p>
                  {Object.keys(node.parameters).length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      {Object.entries(node.parameters).slice(0, 4).map(([k, v]) => (
                        <span key={k} className="text-xs text-gray-400">
                          <span className="text-gray-300">{k}: </span>
                          <span className="font-mono text-blue-500">{String(v).slice(0, 40)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Logs
// ---------------------------------------------------------------------------

function LogsTab({ installedAppId }: { installedAppId: string }) {
  const [runs, setRuns] = useState<LogRun[] | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async (p: number) => {
    setLoading(true); setError(null);
    const res = await fetch(`/api/automata/${installedAppId}/logs?page=${p}`);
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed to load logs"); setLoading(false); return; }
    setRuns(data.runs);
    setHasMore(data.hasMore);
    setPage(p);
    setLoading(false);
  }, [installedAppId]);

  useEffect(() => { fetchLogs(1); }, [fetchLogs]);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-4">
        <ScrollText className="h-4 w-4 shrink-0 mt-0.5 text-gray-400" />
        <div>
          <p className="font-medium text-gray-700">Execution history</p>
          <p className="text-xs mt-1">Each row is one run of this workflow. Status and summary are recorded by PulseBox when n8n sends a callback. Duration is calculated from n8n execution timestamps when available.</p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-gray-400 py-8 justify-center">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading logs…
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-red-500 bg-red-50 border border-red-100 rounded-lg p-4">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p className="text-sm">{error}</p>
          <button onClick={() => fetchLogs(page)} className="ml-auto text-xs underline">Retry</button>
        </div>
      )}

      {runs && (
        <>
          {runs.length === 0 ? (
            <div className="p-8 text-center text-gray-400 border border-gray-200 rounded-lg">
              <ScrollText className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              <p>No runs recorded yet.</p>
              <p className="text-sm mt-1">Logs appear here after the first workflow execution completes and n8n sends a callback.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Date / Time</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Duration</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Status</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run, i) => (
                    <tr key={run.id} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(run.triggered_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{formatDuration(run.duration_ms)}</td>
                      <td className="px-4 py-3">
                        {run.status === "success" ? (
                          <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium"><CheckCircle2 className="h-3.5 w-3.5" /> Success</span>
                        ) : run.status === "running" ? (
                          <span className="flex items-center gap-1 text-blue-500 text-xs font-medium"><Clock className="h-3.5 w-3.5 animate-spin" /> Running</span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-500 text-xs font-medium"><XCircle className="h-3.5 w-3.5" /> {run.status}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {run.summary ? (
                          <span className="truncate max-w-xs block">
                            {Object.entries(run.summary).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ")}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(hasMore || page > 1) && (
            <div className="flex justify-center gap-2">
              {page > 1 && <Button variant="outline" size="sm" onClick={() => fetchLogs(page - 1)}>Previous</Button>}
              {hasMore && <Button variant="outline" size="sm" onClick={() => fetchLogs(page + 1)}>Next</Button>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main client
// ---------------------------------------------------------------------------

const TABS = [
  { key: "overview", label: "Overview", icon: CheckCircle2 },
  { key: "schedule", label: "Schedule", icon: Clock },
  { key: "credentials", label: "Credentials", icon: KeyRound },
  { key: "config", label: "Config", icon: Settings },
  { key: "access", label: "Access", icon: ShieldCheck },
  { key: "workflow", label: "Workflow", icon: Eye },
  { key: "logs", label: "Logs", icon: ScrollText },
];

export function AppDetailClient({
  install: initialInstall,
  app,
  credentials,
  roles,
  stats,
  canViewWorkflow,
  canViewLogs,
  initialTab,
}: {
  install: InstallInfo;
  app: AppInfo;
  credentials: Credential[];
  roles: Role[];
  stats: JobStats;
  canViewWorkflow: boolean;
  canViewLogs: boolean;
  initialTab: string;
}) {
  const [install, setInstall] = useState(initialInstall);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [isPending, startTransition] = useTransition();
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "done" | "error">("idle");

  const Icon = resolveIcon(app.icon);

  const visibleTabs = TABS.filter((t) => {
    if (t.key === "workflow") return canViewWorkflow;
    if (t.key === "logs") return canViewLogs;
    return true;
  });

  function handleRunNow() {
    setRunStatus("running");
    startTransition(async () => {
      const res = await fetch(`/api/automata/${install.id}/trigger`, { method: "POST" });
      const data = await res.json();
      setRunStatus(res.ok ? "done" : "error");
      if (!res.ok) console.error(data.error);
      setTimeout(() => setRunStatus("idle"), 4000);
    });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 border border-blue-100">
            <Icon className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
                {app.name}
              </h1>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${install.enabled ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                {install.enabled ? "Active" : "Paused"}
              </span>
            </div>
            <p className="text-sm text-gray-400">v{app.version} · {app.type === "n8n_workflow" ? "n8n Workflow" : "Collection Bundle"}</p>
          </div>
        </div>

        {/* Run Now */}
        <button
          onClick={handleRunNow}
          disabled={isPending || !install.enabled || !install.n8n_workflow_id || runStatus === "running"}
          title={!install.n8n_workflow_id ? "No workflow linked" : !install.enabled ? "App is paused" : "Trigger an immediate run"}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 ${runStatus === "done" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : runStatus === "error" ? "bg-red-50 text-red-600 border border-red-200" : "bg-blue-600 text-white hover:bg-blue-700"}`}
        >
          {runStatus === "running" ? (
            <><RefreshCw className="h-4 w-4 animate-spin" /> Running…</>
          ) : runStatus === "done" ? (
            <><CheckCircle2 className="h-4 w-4" /> Triggered</>
          ) : runStatus === "error" ? (
            <><XCircle className="h-4 w-4" /> Failed</>
          ) : (
            <><PlayCircle className="h-4 w-4" /> Run Now</>
          )}
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-0.5 overflow-x-auto">
          {visibleTabs.map((tab) => {
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${activeTab === tab.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
              >
                <TabIcon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "overview" && (
          <OverviewTab install={install} app={app} stats={stats} />
        )}
        {activeTab === "schedule" && (
          <ScheduleTab
            install={install}
            app={app}
            onUpdate={(config) => setInstall((prev) => ({ ...prev, config }))}
          />
        )}
        {activeTab === "credentials" && (
          <CredentialsTab install={install} app={app} credentials={credentials} />
        )}
        {activeTab === "config" && (
          <ConfigTab
            install={install}
            app={app}
            onUpdate={(config) => setInstall((prev) => ({ ...prev, config }))}
          />
        )}
        {activeTab === "access" && (
          <AccessTab
            install={install}
            roles={roles}
            onUpdate={(policy) => setInstall((prev) => ({ ...prev, access_policy: policy }))}
          />
        )}
        {activeTab === "workflow" && (
          <WorkflowTab installedAppId={install.id} n8nWorkflowId={install.n8n_workflow_id} />
        )}
        {activeTab === "logs" && (
          <LogsTab installedAppId={install.id} />
        )}
      </div>
    </div>
  );
}
