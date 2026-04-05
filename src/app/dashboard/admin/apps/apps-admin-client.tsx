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
import { Plus, Pencil, Trash2, X, Globe, Lock } from "lucide-react";
import { publishApp, deleteApp } from "@/app/actions/platform-apps";

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
// Config Schema Field Row
// ---------------------------------------------------------------------------

function ConfigFieldRow({
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
  return (
    <div className="grid grid-cols-12 gap-2 items-center bg-gray-50 rounded px-3 py-2">
      <div className="col-span-2">
        <Input
          value={field.key}
          onChange={(e) => onUpdate(index, { ...field, key: e.target.value })}
          placeholder="key"
          className="text-xs h-7"
        />
      </div>
      <div className="col-span-3">
        <Input
          value={field.label}
          onChange={(e) => onUpdate(index, { ...field, label: e.target.value })}
          placeholder="Label"
          className="text-xs h-7"
        />
      </div>
      <div className="col-span-2">
        <Select
          value={field.type}
          onValueChange={(v) => onUpdate(index, { ...field, type: v as ConfigSchemaField["type"] })}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">text</SelectItem>
            <SelectItem value="cron">cron</SelectItem>
            <SelectItem value="credential">credential</SelectItem>
            <SelectItem value="select">select</SelectItem>
            <SelectItem value="boolean">boolean</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-3">
        {field.type === "credential" ? (
          <Input
            value={field.n8n_credential_type ?? ""}
            onChange={(e) => onUpdate(index, { ...field, n8n_credential_type: e.target.value })}
            placeholder="n8n type e.g. sftpCredentials"
            className="text-xs h-7"
          />
        ) : field.type === "select" ? (
          <Input
            value={field.options ?? ""}
            onChange={(e) => onUpdate(index, { ...field, options: e.target.value })}
            placeholder="opt1,opt2,opt3"
            className="text-xs h-7"
          />
        ) : (
          <Input
            value={field.placeholder ?? ""}
            onChange={(e) => onUpdate(index, { ...field, placeholder: e.target.value })}
            placeholder="Placeholder…"
            className="text-xs h-7"
          />
        )}
      </div>
      <div className="col-span-1 flex items-center justify-center">
        <input
          type="checkbox"
          checked={field.required}
          onChange={(e) => onUpdate(index, { ...field, required: e.target.checked })}
          className="h-3.5 w-3.5"
          title="Required"
        />
      </div>
      <div className="col-span-1 flex justify-end">
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="text-gray-400 hover:text-red-500 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
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
  const [n8nId, setN8nId] = useState(app ? "" : "");
  const [schemaFields, setSchemaFields] = useState<ConfigSchemaField[]>([]);
  const [publish, setPublish] = useState(!!app?.published_at);

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
    setError(null);
    startTransition(async () => {
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
          fields: schemaFields.map((f) => ({
            ...f,
            options: f.type === "select" && f.options
              ? f.options.split(",").map((s) => s.trim()).filter(Boolean)
              : undefined,
          })),
        })
      );
      const result = await publishApp(fd);
      if (result.error) { setError(result.error); return; }
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{app ? "Edit App" : "New App"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name + Slug */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Name *</label>
              <Input value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="KFC EMP Import" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Slug *</label>
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="kfc.legacy-emp-import" className="font-mono text-sm" />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Description</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description" />
          </div>

          {/* Icon + Version */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Icon (lucide name)</label>
              <Input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="file-up" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Version</label>
              <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0.0" />
            </div>
          </div>

          {/* Type + Visibility */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Type</label>
              <Select value={type} onValueChange={(v) => v && setType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="n8n_workflow">n8n Workflow</SelectItem>
                  <SelectItem value="collection_bundle">Collection Bundle</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Visibility</label>
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
              <label className="text-xs font-medium text-gray-600 mb-1 block">Allowed Tenants</label>
              <div className="max-h-36 overflow-y-auto border border-gray-200 rounded p-2 space-y-1">
                {tenants.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowedTenants.includes(t.id)}
                      onChange={() => toggleTenant(t.id)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="text-gray-800">{t.name}</span>
                    <span className="text-gray-400 font-mono text-xs">{t.slug}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* n8n Template Workflow ID */}
          {type === "n8n_workflow" && (
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">n8n Template Workflow ID</label>
              <Input
                value={n8nId}
                onChange={(e) => setN8nId(e.target.value)}
                placeholder="Workflow ID from n8n (after vibe-coding)"
                className="font-mono text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">
                Enter the workflow ID from your n8n instance. This will be cloned per tenant on install.
              </p>
            </div>
          )}

          {/* Config Schema Builder */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">Config Schema Fields</label>
              <Button size="sm" variant="outline" onClick={addField} className="h-7 text-xs gap-1">
                <Plus className="h-3 w-3" /> Add Field
              </Button>
            </div>
            {schemaFields.length > 0 ? (
              <div className="space-y-1.5">
                <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold uppercase text-gray-400 px-3">
                  <div className="col-span-2">Key</div>
                  <div className="col-span-3">Label</div>
                  <div className="col-span-2">Type</div>
                  <div className="col-span-3">Options/Type/Placeholder</div>
                  <div className="col-span-1 text-center">Req</div>
                  <div className="col-span-1" />
                </div>
                {schemaFields.map((f, i) => (
                  <ConfigFieldRow key={i} field={f} index={i} onUpdate={updateField} onRemove={removeField} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">No config fields — tenants install with no configuration step.</p>
            )}
          </div>

          {/* Publish toggle */}
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <input
              type="checkbox"
              checked={publish}
              onChange={(e) => setPublish(e.target.checked)}
              id="publish-toggle"
              className="h-4 w-4"
            />
            <label htmlFor="publish-toggle" className="text-sm font-medium text-gray-700">
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

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteApp(app.id);
      if (result.error) { setError(result.error); return; }
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete App</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">
          Delete <span className="font-semibold">{app.name}</span>? This cannot be undone. Existing tenant installs will be orphaned.
        </p>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
            {isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Client
// ---------------------------------------------------------------------------

export function AdminAppCatalogClient({
  apps,
  tenants,
}: {
  apps: PlatformApp[];
  tenants: Tenant[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [editApp, setEditApp] = useState<PlatformApp | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlatformApp | null>(null);

  function openCreate() { setEditApp(null); setShowForm(true); }
  function openEdit(app: PlatformApp) { setEditApp(app); setShowForm(true); }
  function closeForm() { setShowForm(false); setEditApp(null); }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> New App
        </Button>
      </div>

      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-100">
            <TableRow className="border-gray-200 hover:bg-transparent">
              <TableHead className="text-gray-500">App</TableHead>
              <TableHead className="text-gray-500">Type</TableHead>
              <TableHead className="text-gray-500">Visibility</TableHead>
              <TableHead className="text-gray-500">Version</TableHead>
              <TableHead className="text-gray-500">Installs</TableHead>
              <TableHead className="text-gray-500">Status</TableHead>
              <TableHead className="text-gray-500 w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {apps.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-gray-500 py-10">
                  No apps yet. Click &ldquo;New App&rdquo; to create one.
                </TableCell>
              </TableRow>
            ) : (
              apps.map((app, i) => (
                <TableRow
                  key={app.id}
                  className={`border-blue-500/10 hover:bg-gray-50 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
                >
                  <TableCell>
                    <div>
                      <span className="font-medium text-gray-900 text-sm">{app.name}</span>
                      <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-blue-600 font-mono">{app.slug}</span>
                    </div>
                    {app.description && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{app.description}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {app.type === "n8n_workflow" ? "n8n" : "Bundle"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1 text-xs text-gray-600">
                      {app.visibility === "public" ? (
                        <><Globe className="h-3 w-3" /> Public</>
                      ) : (
                        <><Lock className="h-3 w-3" /> Specific</>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-gray-500 font-mono">v{app.version}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-700">{app.installCount}</span>
                  </TableCell>
                  <TableCell>
                    {app.published_at ? (
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">Published</Badge>
                    ) : (
                      <Badge variant="outline" className="text-gray-500 text-xs">Draft</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(app)}
                        className="rounded p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(app)}
                        className="rounded p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
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
