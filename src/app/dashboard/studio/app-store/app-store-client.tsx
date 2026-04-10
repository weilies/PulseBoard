"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Store, Check, ChevronRight, ChevronLeft, Workflow, Package } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { installPlatformApp, uninstallPlatformApp } from "@/app/actions/platform-apps";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Role { id: string; name: string; }

interface ConfigSchemaField {
  key: string;
  label: string;
  type: "text" | "cron" | "credential" | "select" | "boolean";
  options?: string[];
  n8n_credential_type?: string;
  required?: boolean;
  placeholder?: string;
}

interface AppEntry {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  type: string;
  visibility: string;
  version: string;
  config_schema: { fields?: ConfigSchemaField[] } | null;
  installId: string | null;
  isInstalled: boolean;
}

// ---------------------------------------------------------------------------
// Cron expression parser (simple patterns only)
// ---------------------------------------------------------------------------

function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return "Custom schedule";
  const [min, hour, , , dow] = parts;

  if (min === "*" && hour === "*") return "Every minute";
  if (min === "0" && hour === "*") return "Every hour";
  if (min !== "*" && hour === "*/2") return `Every 2 hours at :${min.padStart(2, "0")}`;
  if (hour?.startsWith("*/")) return `Every ${hour.slice(2)} hours`;

  const h = parseInt(hour);
  const m = parseInt(min);
  if (!isNaN(h) && !isNaN(m)) {
    const ampm = h >= 12 ? "PM" : "AM";
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const timeStr = `${displayH}:${String(m).padStart(2, "0")} ${ampm}`;
    if (dow === "*") return `Daily at ${timeStr}`;
    const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const d = parseInt(dow);
    if (!isNaN(d) && DAYS[d]) return `Every ${DAYS[d]} at ${timeStr}`;
  }
  return "Custom schedule";
}

// ---------------------------------------------------------------------------
// Icon resolver
// ---------------------------------------------------------------------------

function resolveIcon(name: string | null): React.ComponentType<{ className?: string }> {
  if (name) {
    const pascal = name.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
    const Comp = (LucideIcons as Record<string, unknown>)[pascal];
    if (Comp) return Comp as React.ComponentType<{ className?: string }>;
  }
  return Store;
}

// ---------------------------------------------------------------------------
// Install Wizard
// ---------------------------------------------------------------------------

function InstallWizard({
  app,
  roles,
  onClose,
}: {
  app: AppEntry;
  roles: Role[];
  onClose: () => void;
}) {
  const [step, setStep] = useState(1);
  const TOTAL_STEPS = 4;

  // Step 2: Config values
  const schemaFields = app.config_schema?.fields ?? [];
  const regularFields = schemaFields.filter((f) => f.type !== "credential");
  const credentialFields = schemaFields.filter((f) => f.type === "credential");

  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [credValues, setCredValues] = useState<Record<string, Record<string, string>>>({});
  const [cronPreviews, setCronPreviews] = useState<Record<string, string>>({});

  // Step 3: Access policy
  const [viewDefinitionRoles, setViewDefinitionRoles] = useState<string[]>(["tenant_admin"]);
  const [viewLogsRoles, setViewLogsRoles] = useState<string[]>(["tenant_admin"]);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const Icon = resolveIcon(app.icon);

  function updateConfig(key: string, value: string) {
    setConfigValues((prev) => ({ ...prev, [key]: value }));
    // Live cron preview
    const field = schemaFields.find((f) => f.key === key);
    if (field?.type === "cron") {
      setCronPreviews((prev) => ({ ...prev, [key]: describeCron(value) }));
    }
  }

  function updateCred(credKey: string, field: string, value: string) {
    setCredValues((prev) => ({
      ...prev,
      [credKey]: { ...(prev[credKey] ?? {}), [field]: value },
    }));
  }

  function toggleRole(list: string[], setList: (v: string[]) => void, roleId: string) {
    setList(list.includes(roleId) ? list.filter((r) => r !== roleId) : [...list, roleId]);
  }

  function handleInstall() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("app_id", app.id);
      fd.set("config", JSON.stringify(configValues));
      fd.set(
        "access_policy",
        JSON.stringify({ view_definition: viewDefinitionRoles, view_logs: viewLogsRoles })
      );
      // Credential fields — values go to n8n, key + type stored only
      const credentials = credentialFields.map((f) => ({
        key: f.key,
        n8n_credential_type: f.n8n_credential_type ?? "",
        value: credValues[f.key] ?? {},
      }));
      fd.set("credentials", JSON.stringify(credentials));

      const result = await installPlatformApp(fd);
      if (result.error) { setError(result.error); return; }
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-blue-600" />
            Install {app.name}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 text-xs text-gray-400 mb-2">
          {["Overview", "Config", "Access Policy", "Confirm"].map((label, i) => (
            <span key={label} className={`flex items-center gap-1 ${step === i + 1 ? "text-blue-600 font-medium" : ""}`}>
              {i > 0 && <ChevronRight className="h-3 w-3" />}
              {label}
            </span>
          ))}
        </div>

        {/* Step 1: Overview */}
        {step === 1 && (
          <div className="space-y-3 py-2">
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 border border-blue-100">
                <Icon className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{app.name}</span>
                  <span className="text-xs font-mono text-gray-400">v{app.version}</span>
                  <Badge variant="outline" className="text-xs">
                    {app.type === "n8n_workflow" ? "n8n Workflow" : "Bundle"}
                  </Badge>
                </div>
                <span className="text-xs text-gray-400 mt-0.5 block">Built by Next Novas</span>
                <p className="text-sm text-gray-600 mt-2">
                  {app.description ?? "No description provided."}
                </p>
              </div>
            </div>
            {app.type === "n8n_workflow" && (
              <div className="flex items-center gap-2 text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded p-3">
                <Workflow className="h-4 w-4 text-blue-500 shrink-0" />
                This app runs as an automated workflow. On install, a workflow will be cloned to your n8n instance and activated.
              </div>
            )}
          </div>
        )}

        {/* Step 2: Config */}
        {step === 2 && (
          <div className="space-y-4 py-2">
            {schemaFields.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No configuration required for this app.</p>
            ) : (
              <>
                {/* Regular fields */}
                {regularFields.map((field) => (
                  <div key={field.key}>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">
                      {field.label}{field.required && <span className="text-red-500 ml-1">*</span>}
                    </label>

                    {field.type === "boolean" ? (
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={configValues[field.key] === "true"}
                          onChange={(e) => updateConfig(field.key, String(e.target.checked))}
                          className="h-4 w-4"
                        />
                        Enable
                      </label>
                    ) : field.type === "select" ? (
                      <Select
                        value={configValues[field.key] ?? ""}
                        onValueChange={(v) => v && updateConfig(field.key, v)}
                      >
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
                          value={configValues[field.key] ?? ""}
                          onChange={(e) => updateConfig(field.key, e.target.value)}
                          placeholder={field.placeholder ?? (field.type === "cron" ? "e.g. 0 6 * * *" : "")}
                        />
                        {field.type === "cron" && configValues[field.key] && (
                          <p className="text-xs text-blue-600 mt-1">{cronPreviews[field.key] ?? describeCron(configValues[field.key])}</p>
                        )}
                      </>
                    )}
                  </div>
                ))}

                {/* Credential fields */}
                {credentialFields.length > 0 && (
                  <div className="border-t border-gray-100 pt-3 space-y-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Credentials</p>
                    {credentialFields.map((field) => (
                      <div key={field.key} className="border border-gray-200 rounded p-3 space-y-2">
                        <p className="text-sm font-medium text-gray-700">{field.label}</p>
                        <p className="text-xs text-gray-400">
                          Type: <span className="font-mono">{field.n8n_credential_type}</span> — values are written directly to n8n vault and never stored in PulseBox.
                        </p>
                        <Input
                          type="password"
                          placeholder="Value"
                          value={credValues[field.key]?.value ?? ""}
                          onChange={(e) => updateCred(field.key, "value", e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Step 3: Access Policy */}
        {step === 3 && (
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-2 block">Who can view workflow definition?</label>
              <div className="space-y-1.5 border border-gray-200 rounded p-2 max-h-32 overflow-y-auto">
                {roles.map((role) => (
                  <label key={role.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={viewDefinitionRoles.includes(role.id)}
                      onChange={() => toggleRole(viewDefinitionRoles, setViewDefinitionRoles, role.id)}
                      className="h-3.5 w-3.5"
                    />
                    {role.name}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-2 block">Who can view job logs?</label>
              <div className="space-y-1.5 border border-gray-200 rounded p-2 max-h-32 overflow-y-auto">
                {roles.map((role) => (
                  <label key={role.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={viewLogsRoles.includes(role.id)}
                      onChange={() => toggleRole(viewLogsRoles, setViewLogsRoles, role.id)}
                      className="h-3.5 w-3.5"
                    />
                    {role.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Confirm */}
        {step === 4 && (
          <div className="space-y-3 py-2">
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-2">
              <p className="text-sm font-semibold text-gray-800">Ready to install</p>
              <ul className="text-sm text-gray-600 space-y-1">
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-500" /> App: <span className="font-medium">{app.name}</span></li>
                {app.type === "n8n_workflow" && (
                  <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-500" /> n8n workflow will be cloned and activated</li>
                )}
                {Object.keys(configValues).length > 0 && (
                  <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-500" /> Config saved ({Object.keys(configValues).length} field{Object.keys(configValues).length !== 1 ? "s" : ""})</li>
                )}
                {credentialFields.length > 0 && (
                  <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-500" /> Credentials written to n8n vault</li>
                )}
              </ul>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
        )}

        <DialogFooter className="flex-row justify-between">
          <div>
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={isPending} className="gap-1">
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
            {step < TOTAL_STEPS ? (
              <Button onClick={() => setStep((s) => s + 1)}>
                Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleInstall} disabled={isPending}>
                {isPending ? "Installing…" : "Confirm Install"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// App Card
// ---------------------------------------------------------------------------

function AppCard({
  app,
  roles,
  onUninstall,
}: {
  app: AppEntry;
  roles: Role[];
  onUninstall: (installId: string) => void;
}) {
  const [showWizard, setShowWizard] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const Icon = resolveIcon(app.icon);

  function handleUninstall() {
    if (!app.installId) return;
    startTransition(async () => {
      const result = await uninstallPlatformApp(app.installId!);
      if (result.error) { setError(result.error); return; }
      onUninstall(app.installId!);
    });
  }

  return (
    <>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 flex flex-col gap-3 hover:shadow-sm transition-shadow">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900">
            <Icon className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{app.name}</span>
              <span className="text-xs text-gray-400 font-mono">v{app.version}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Badge variant="outline" className="text-xs">
                {app.type === "n8n_workflow" ? (
                  <><Workflow className="h-3 w-3 mr-1" />n8n</>
                ) : (
                  <><Package className="h-3 w-3 mr-1" />Bundle</>
                )}
              </Badge>
              <span className="text-xs text-gray-400">Next Novas</span>
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-500 leading-relaxed flex-1">
          {app.description ?? "No description provided."}
        </p>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-700">
          {app.isInstalled ? (
            <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Installed
            </span>
          ) : (
            <span className="text-xs text-gray-400">Available</span>
          )}

          {app.isInstalled ? (
            <button
              onClick={handleUninstall}
              disabled={isPending}
              className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 transition-colors disabled:opacity-50"
            >
              {isPending ? "Uninstalling…" : "Uninstall"}
            </button>
          ) : (
            <button
              onClick={() => setShowWizard(true)}
              className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 transition-colors"
            >
              Install
            </button>
          )}
        </div>
      </div>

      {showWizard && (
        <InstallWizard app={app} roles={roles} onClose={() => setShowWizard(false)} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Client
// ---------------------------------------------------------------------------

type FilterTab = "all" | "installed" | "available";

export function AppStoreClient({
  apps,
  roles,
  tenantId: _tenantId,
  tenantSlug: _tenantSlug,
}: {
  apps: AppEntry[];
  roles: Role[];
  tenantId: string;
  tenantSlug: string;
}) {
  const [filter, setFilter] = useState<FilterTab>("all");
  const [localApps, setLocalApps] = useState(apps);

  const filtered = localApps.filter((a) => {
    if (filter === "installed") return a.isInstalled;
    if (filter === "available") return !a.isInstalled;
    return true;
  });

  function handleUninstall(installId: string) {
    setLocalApps((prev) =>
      prev.map((a) => (a.installId === installId ? { ...a, isInstalled: false, installId: null } : a))
    );
  }

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: `All (${localApps.length})` },
    { key: "installed", label: `Installed (${localApps.filter((a) => a.isInstalled).length})` },
    { key: "available", label: `Available (${localApps.filter((a) => !a.isInstalled).length})` },
  ];

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              filter === tab.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center text-gray-500 dark:text-gray-400 py-16 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <Store className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p className="text-sm">
            {filter === "installed"
              ? "No apps installed yet."
              : filter === "available"
              ? "All available apps are installed."
              : "No apps available for your organization."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((app) => (
            <AppCard key={app.id} app={app} roles={roles} onUninstall={handleUninstall} />
          ))}
        </div>
      )}
    </div>
  );
}
