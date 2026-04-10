"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, X, Globe, Lock, Settings2 } from "lucide-react";
import { publishApp, deleteApp } from "@/app/actions/platform-apps";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Tenant { id: string; name: string; slug: string; }

interface PlatformApp {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  type: string;
  visibility: string;
  version: string;
  published_at: string | null;
  updated_at: string | null;
  installCount: number;
}

interface ConfigSchemaField {
  key: string;
  label: string;
  type: "text" | "cron" | "credential" | "select" | "boolean";
  options?: string;
  n8n_credential_type?: string;
  required: boolean;
  placeholder?: string;
}

// ---------------------------------------------------------------------------
// Config Schema Field Card
// ---------------------------------------------------------------------------

function ConfigFieldCard({
  field,
  index,
  onUpdate,
  onRemove,
}: {
  field: ConfigSchemaField;
  index: number;
  onUpdate: (i: number, f: ConfigSchemaField) => void;
  onRemove: (i: number) => void;
}) {
  const extraLabel =
    field.type === "credential" ? "n8n Credential Type" :
    field.type === "select"     ? "Options (comma-separated)" :
                                  "Placeholder text";

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-3 space-y-2.5">
      {/* Row 1: Key · Label · Type */}
      <div className="grid grid-cols-3 gap-2.5">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">Key</label>
          <Input
            value={field.key}
            onChange={(e) => onUpdate(index, { ...field, key: e.target.value })}
            placeholder="e.g. api_key"
            className="h-7 text-xs font-mono"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">Label</label>
          <Input
            value={field.label}
            onChange={(e) => onUpdate(index, { ...field, label: e.target.value })}
            placeholder="API Key"
            className="h-7 text-xs"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">Type</label>
          <Select
            value={field.type}
            onValueChange={(v) => onUpdate(index, { ...field, type: v as ConfigSchemaField["type"] })}
          >
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="cron">Cron</SelectItem>
              <SelectItem value="credential">Credential</SelectItem>
              <SelectItem value="select">Select</SelectItem>
              <SelectItem value="boolean">Boolean</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 2: Extra field · Required · Remove */}
      <div className="flex items-end gap-2.5">
        <div className="flex-1">
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
            {extraLabel}
          </label>
          {field.type === "credential" ? (
            <Input
              value={field.n8n_credential_type ?? ""}
              onChange={(e) => onUpdate(index, { ...field, n8n_credential_type: e.target.value })}
              placeholder="e.g. sftpCredentials"
              className="h-7 text-xs font-mono"
            />
          ) : field.type === "select" ? (
            <Input
              value={field.options ?? ""}
              onChange={(e) => onUpdate(index, { ...field, options: e.target.value })}
              placeholder="opt1, opt2, opt3"
              className="h-7 text-xs"
            />
          ) : (
            <Input
              value={field.placeholder ?? ""}
              onChange={(e) => onUpdate(index, { ...field, placeholder: e.target.value })}
              placeholder="Enter value…"
              className="h-7 text-xs"
            />
          )}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 pb-1 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onUpdate(index, { ...field, required: e.target.checked })}
            className="h-3.5 w-3.5 accent-blue-600"
          />
          Required
        </label>
        <button
          type="button"
          onClick={() => onRemove(index)}
          title="Remove field"
          className="text-gray-400 hover:text-red-500 pb-1 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / Edit Dialog
// ---------------------------------------------------------------------------

function AppFormDialog({
  app,
  tenants,
  onClose,
}: {
  app: PlatformApp | null;
  tenants: Tenant[];
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(app?.name ?? "");
  const [slug, setSlug] = useState(app?.slug ?? "");
  const [description, setDescription] = useState(app?.description ?? "");
  const [icon, setIcon] = useState(app?.icon ?? "");
  const [type, setType] = useState(app?.type ?? "n8n_workflow");
  const [visibility, setVisibility] = useState(app?.visibility ?? "public");
  const [allowedTenants, setAllowedTenants] = useState<string[]>([]);
  const [version, setVersion] = useState(app?.version ?? "1.0.0");
  const [n8nId, setN8nId] = useState("");
  const [schemaFields, setSchemaFields] = useState<ConfigSchemaField[]>([]);
  const [publish, setPublish] = useState(!!app?.published_at);

  // Raw JSON toggle for config schema
  const [schemaMode, setSchemaMode] = useState<"visual" | "json">("visual");
  const [rawJson, setRawJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  function switchToJson() {
    setRawJson(JSON.stringify({ fields: schemaFields }, null, 2));
    setJsonError(null);
    setSchemaMode("json");
  }

  function switchToVisual() {
    try {
      const parsed = JSON.parse(rawJson);
      if (!Array.isArray(parsed?.fields)) throw new Error('Expected root object { fields: [...] }');
      setSchemaFields(parsed.fields);
      setSchemaMode("visual");
      setJsonError(null);
    } catch (e) {
      setJsonError("Invalid JSON — " + (e as Error).message);
    }
  }

  function handleNameChange(v: string) {
    setName(v);
    if (!app) setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  }

  function addField() {
    setSchemaFields((prev) => [...prev, { key: "", label: "", type: "text", required: false }]);
  }
  function updateField(i: number, f: ConfigSchemaField) {
    setSchemaFields((prev) => prev.map((x, j) => (j === i ? f : x)));
  }
  function removeField(i: number) {
    setSchemaFields((prev) => prev.filter((_, j) => j !== i));
  }

  function toggleTenant(id: string) {
    setAllowedTenants((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function handleSubmit() {
    // If in raw JSON mode, apply it first
    if (schemaMode === "json") {
      try {
        const parsed = JSON.parse(rawJson);
        if (!Array.isArray(parsed?.fields)) throw new Error('Expected { fields: [...] }');
        setSchemaFields(parsed.fields);
      } catch (e) {
        setJsonError("Invalid JSON — " + (e as Error).message);
        return;
      }
    }

    setError(null);
    startTransition(async () => {
      const fields = schemaMode === "json" ? JSON.parse(rawJson).fields : schemaFields;
      const fd = new FormData();
      if (app) fd.set("app_id", app.id);
      fd.set("name", name);
      fd.set("slug", slug);
      fd.set("description", description);
      fd.set("icon", icon);
      fd.set("type", type);
      fd.set("visibility", visibility);
      fd.set("version", version);
      fd.set("n8n_template_workflow_id", n8nId);
      fd.set("publish", String(publish));
      fd.set("allowed_tenant_ids", JSON.stringify(allowedTenants));
      fd.set(
        "config_schema",
        JSON.stringify({
          fields: fields.map((f: ConfigSchemaField) => ({
            ...f,
            options: f.type === "select" && f.options
              ? f.options.split(",").map((s: string) => s.trim()).filter(Boolean)
              : undefined,
          })),
        })
      );
      const result = await publishApp(fd);
      if (result.error) { setError(result.error); return; }
      onClose();
    });
  }

  const labelCls = "text-xs font-medium text-gray-600 dark:text-gray-300 mb-1 block";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-gray-100">
            {app ? "Edit App" : "New App"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name + Slug */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Name *</label>
              <Input value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="KFC EMP Import" />
            </div>
            <div>
              <label className={labelCls}>Slug *</label>
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="kfc.legacy-emp-import" className="font-mono text-sm" />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>Description</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description" />
          </div>

          {/* Icon + Version */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Icon (lucide name)</label>
              <Input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="file-up" />
            </div>
            <div>
              <label className={labelCls}>Version</label>
              <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0.0" />
            </div>
          </div>

          {/* Type + Visibility */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Type</label>
              <Select value={type} onValueChange={(v) => v && setType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="n8n_workflow">n8n Workflow</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={labelCls}>Visibility</label>
              <Select value={visibility} onValueChange={(v) => v && setVisibility(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="tenant_specific">Tenant Specific</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tenant picker for tenant_specific */}
          {visibility === "tenant_specific" && (
            <div>
              <label className={labelCls}>Allowed Tenants</label>
              <div className="max-h-36 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded p-2 space-y-1 bg-white dark:bg-gray-800">
                {tenants.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowedTenants.includes(t.id)}
                      onChange={() => toggleTenant(t.id)}
                      className="h-3.5 w-3.5 accent-blue-600"
                    />
                    <span className="text-gray-800 dark:text-gray-200">{t.name}</span>
                    <span className="text-gray-400 font-mono text-xs">{t.slug}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* n8n Template Workflow ID */}
          {type === "n8n_workflow" && (
            <div>
              <label className={labelCls}>n8n Template Workflow ID</label>
              <Input
                value={n8nId}
                onChange={(e) => setN8nId(e.target.value)}
                placeholder="Workflow ID from n8n"
                className="font-mono text-sm"
              />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                The workflow ID from your n8n instance — cloned per tenant on install.
              </p>
            </div>
          )}

          {/* Config Schema Builder */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls + " mb-0"}>Config Schema Fields</label>
              <div className="flex items-center gap-2">
                {/* Visual / Raw JSON toggle */}
                <div className="flex rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => schemaMode === "json" && switchToVisual()}
                    className={cn(
                      "px-2.5 py-1 transition-colors",
                      schemaMode === "visual"
                        ? "bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-medium"
                        : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                    )}
                  >
                    Visual
                  </button>
                  <button
                    type="button"
                    onClick={() => schemaMode === "visual" && switchToJson()}
                    className={cn(
                      "px-2.5 py-1 border-l border-gray-200 dark:border-gray-700 transition-colors",
                      schemaMode === "json"
                        ? "bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-medium"
                        : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                    )}
                  >
                    Raw JSON
                  </button>
                </div>
                {schemaMode === "visual" && (
                  <Button size="sm" variant="outline" onClick={addField} className="h-7 text-xs gap-1">
                    <Plus className="h-3 w-3" /> Add Field
                  </Button>
                )}
              </div>
            </div>

            {schemaMode === "visual" ? (
              schemaFields.length > 0 ? (
                <div className="space-y-2">
                  {schemaFields.map((f, i) => (
                    <ConfigFieldCard key={i} field={f} index={i} onUpdate={updateField} onRemove={removeField} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 dark:text-gray-500 italic py-2">
                  No config fields — tenants install with no configuration step.
                </p>
              )
            ) : (
              <div>
                <textarea
                  value={rawJson}
                  onChange={(e) => { setRawJson(e.target.value); setJsonError(null); }}
                  className="w-full h-48 font-mono text-xs rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                  spellCheck={false}
                />
                {jsonError && <p className="text-xs text-red-500 mt-1">{jsonError}</p>}
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Edit raw JSON. Switch back to Visual to see fields as cards.
                </p>
              </div>
            )}
          </div>

          {/* Publish toggle */}
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
            <input
              type="checkbox"
              checked={publish}
              onChange={(e) => setPublish(e.target.checked)}
              id="publish-toggle"
              className="h-4 w-4 accent-blue-600"
            />
            <label htmlFor="publish-toggle" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
              Publish (visible to tenants in App Store)
            </label>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending || !name || !slug}>
            {isPending ? "Saving…" : app ? "Save Changes" : "Create App"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delete Confirm Dialog
// ---------------------------------------------------------------------------

function DeleteDialog({ app, onClose }: { app: PlatformApp; onClose: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteApp(app.id);
      if (result.error) { setError(result.error); return; }
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-red-600 dark:text-red-400">Hard Delete App</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
          <p>
            You are about to permanently delete{" "}
            <span className="font-semibold text-gray-900 dark:text-gray-200">{app.name}</span>.
          </p>
          <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2.5 space-y-1 text-xs text-red-700 dark:text-red-400">
            <p className="font-semibold">This will cascade and permanently delete:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>All tenant installs of this app (across every tenant)</li>
              <li>All stored credentials linked to those installs</li>
              <li>Associated n8n workflows will be deactivated</li>
            </ul>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Type the app slug <span className="font-mono text-gray-900 dark:text-gray-200">{app.slug}</span> to confirm
            </label>
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={app.slug}
              className="font-mono text-sm"
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending || confirm !== app.slug}
          >
            {isPending ? "Deleting…" : "Permanently Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Client — owns the page header + "New App" button
// ---------------------------------------------------------------------------

export function AdminAppCatalogClient({
  apps,
  tenants,
  isSuperTenant,
}: {
  apps: PlatformApp[];
  tenants: Tenant[];
  isSuperTenant: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editApp, setEditApp] = useState<PlatformApp | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlatformApp | null>(null);

  function openCreate() { setEditApp(null); setShowForm(true); }
  function openEdit(app: PlatformApp) { setEditApp(app); setShowForm(true); }
  function closeForm() { setShowForm(false); setEditApp(null); }

  return (
    <>
      <div className="p-6 space-y-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            <div>
              <h1
                className="text-xl font-bold text-gray-900 dark:text-gray-100"
                style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
              >
                Platform Apps
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage apps published to tenants via App Store</p>
            </div>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> New App
          </Button>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <Table>
            <TableHeader className="bg-gray-100 dark:bg-gray-800">
              <TableRow className="border-gray-200 dark:border-gray-700 hover:bg-transparent">
                <TableHead className="text-gray-500 dark:text-gray-400">App</TableHead>
                <TableHead className="text-gray-500 dark:text-gray-400">Type</TableHead>
                <TableHead className="text-gray-500 dark:text-gray-400">Visibility</TableHead>
                <TableHead className="text-gray-500 dark:text-gray-400">Version</TableHead>
                <TableHead className="text-gray-500 dark:text-gray-400">Installs</TableHead>
                <TableHead className="text-gray-500 dark:text-gray-400">Status</TableHead>
                <TableHead className="text-gray-500 dark:text-gray-400 w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apps.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-gray-500 dark:text-gray-400 py-10">
                    No apps yet. Click &ldquo;New App&rdquo; to create one.
                  </TableCell>
                </TableRow>
              ) : (
                apps.map((app, i) => (
                  <TableRow
                    key={app.id}
                    className={`border-blue-500/10 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/40 ${i % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800/30"}`}
                  >
                    <TableCell>
                      <div>
                        <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{app.name}</span>
                        <span className="ml-2 rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-xs text-blue-600 dark:text-blue-400 font-mono">{app.slug}</span>
                      </div>
                      {app.description && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate max-w-xs">{app.description}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs dark:border-gray-600 dark:text-gray-300">
                        {app.type === "n8n_workflow" ? "n8n" : "Bundle"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                        {app.visibility === "public" ? (
                          <><Globe className="h-3 w-3" /> Public</>
                        ) : (
                          <><Lock className="h-3 w-3" /> Specific</>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">v{app.version}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-700 dark:text-gray-300">{app.installCount}</span>
                    </TableCell>
                    <TableCell>
                      {app.published_at ? (
                        <Badge className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 text-xs">Published</Badge>
                      ) : (
                        <Badge variant="outline" className="text-gray-500 dark:text-gray-400 dark:border-gray-600 text-xs">Draft</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(app)}
                          className="rounded p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {isSuperTenant && (
                          <button
                            onClick={() => setDeleteTarget(app)}
                            className="rounded p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                            title="Hard delete (Next Novas only)"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {showForm && (
        <AppFormDialog app={editApp} tenants={tenants} onClose={closeForm} />
      )}
      {deleteTarget && (
        <DeleteDialog app={deleteTarget} onClose={() => setDeleteTarget(null)} />
      )}
    </>
  );
}
