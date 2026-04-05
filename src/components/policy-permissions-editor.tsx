"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Save, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { updatePolicyPermissions } from "@/app/actions/roles";
import { getCollectionFieldSlugs } from "@/app/actions/collection-rbac";
import { PAGE_LABELS, PAGE_SECTIONS, COLLECTION_PERMS } from "@/lib/services/permissions.service";
const PAGE_PERMS = ["access"] as const;

type RbacCondition = {
  field: string;
  op: string;
  val: string;
};

type PermRow = {
  resource_type: "page" | "collection";
  resource_id: string;
  label: string;
  collectionType?: string;
  permissions: Record<string, boolean>;
  conditions: RbacCondition[];
};

interface PolicyPermissionsEditorProps {
  policyId: string;
  isSystem: boolean;
  isSuperTenant: boolean;
  canEditSystem?: boolean;
  readOnly?: boolean;
  initialPermissions: Array<{
    resource_type: string;
    resource_id: string;
    permissions: Record<string, boolean>;
    conditions?: Array<{ field: string; op: string; val: unknown }>;
  }>;
  pages: string[];
  collections: Array<{ id: string; name: string; type: string }>;
}

const OPS = [
  { value: "eq", label: "=" },
  { value: "neq", label: "≠" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "in", label: "in (csv)" },
  { value: "not_in", label: "not in (csv)" },
] as const;

export function PolicyPermissionsEditor({
  policyId,
  isSystem,
  isSuperTenant: _isSuperTenant,
  canEditSystem = false,
  readOnly = false,
  initialPermissions,
  pages,
  collections,
}: PolicyPermissionsEditorProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const isReadOnly = (isSystem && !canEditSystem) || readOnly;

  const buildInitialRows = (): PermRow[] => {
    const rows: PermRow[] = [];
    const permMap = new Map(
      initialPermissions.map((p) => [`${p.resource_type}:${p.resource_id}`, p])
    );

    for (const page of pages) {
      rows.push({
        resource_type: "page",
        resource_id: page,
        label: PAGE_LABELS[page] ?? page,
        permissions: permMap.get(`page:${page}`)?.permissions ?? { access: false },
        conditions: [],
      });
    }

    for (const col of collections) {
      const existing = permMap.get(`collection:${col.id}`);
      const defaultPerms: Record<string, boolean> = {};
      for (const p of COLLECTION_PERMS) defaultPerms[p] = false;
      rows.push({
        resource_type: "collection",
        resource_id: col.id,
        collectionType: col.type,
        label: `${col.name} (${col.type})`,
        permissions: existing?.permissions ?? defaultPerms,
        conditions: (existing?.conditions ?? []).map((c) => ({
          field: String(c.field),
          op: String(c.op),
          val: String(c.val ?? ""),
        })),
      });
    }

    return rows;
  };

  const [rows, setRows] = useState<PermRow[]>(buildInitialRows);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [fieldCache, setFieldCache] = useState<Map<string, { slug: string; name: string }[]>>(new Map());
  const [fieldLoading, setFieldLoading] = useState<Set<string>>(new Set());

  function toggleExpand(collectionId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(collectionId)) {
        next.delete(collectionId);
      } else {
        next.add(collectionId);
        if (!fieldCache.has(collectionId)) {
          loadFields(collectionId);
        }
      }
      return next;
    });
  }

  async function loadFields(collectionId: string) {
    setFieldLoading((prev) => new Set(prev).add(collectionId));
    const result = await getCollectionFieldSlugs(collectionId);
    if (result.data) {
      setFieldCache((prev) => new Map(prev).set(collectionId, result.data!));
    }
    setFieldLoading((prev) => {
      const next = new Set(prev);
      next.delete(collectionId);
      return next;
    });
  }

  function toggle(idx: number, perm: string) {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        permissions: { ...next[idx].permissions, [perm]: !next[idx].permissions[perm] },
      };
      return next;
    });
  }

  function addCondition(rowIdx: number) {
    setRows((prev) => {
      const next = [...prev];
      next[rowIdx] = {
        ...next[rowIdx],
        conditions: [...next[rowIdx].conditions, { field: "", op: "eq", val: "" }],
      };
      return next;
    });
  }

  function updateCondition(rowIdx: number, condIdx: number, patch: Partial<RbacCondition>) {
    setRows((prev) => {
      const next = [...prev];
      const conds = [...next[rowIdx].conditions];
      conds[condIdx] = { ...conds[condIdx], ...patch };
      next[rowIdx] = { ...next[rowIdx], conditions: conds };
      return next;
    });
  }

  function removeCondition(rowIdx: number, condIdx: number) {
    setRows((prev) => {
      const next = [...prev];
      const conds = next[rowIdx].conditions.filter((_, i) => i !== condIdx);
      next[rowIdx] = { ...next[rowIdx], conditions: conds };
      return next;
    });
  }

  async function handleSave() {
    setLoading(true);
    const permissions = rows
      .filter((r) => Object.values(r.permissions).some(Boolean) || r.conditions.length > 0)
      .map((r) => {
        const base = {
          resource_type: r.resource_type,
          resource_id: r.resource_id,
          permissions: r.permissions,
        };
        if (r.resource_type === "collection") {
          return {
            ...base,
            conditions: r.conditions
              .filter((c) => c.field.trim())
              .map((c) => ({
                field: c.field.trim(),
                op: c.op,
                val: c.op === "in" || c.op === "not_in"
                  ? c.val.split(",").map((v) => v.trim()).filter(Boolean)
                  : c.val.trim(),
              })),
          };
        }
        return base;
      });

    const fd = new FormData();
    fd.set("policy_id", policyId);
    fd.set("permissions", JSON.stringify(permissions));
    const result = await updatePolicyPermissions(fd);
    setLoading(false);
    if (result.error) { toast.error(result.error); return; }
    toast.success("Permissions saved");
    router.refresh();
  }

  const pageRows = rows.filter((r) => r.resource_type === "page");
  const collectionRows = rows.filter((r) => r.resource_type === "collection");

  const checkboxClass = "w-4 h-4 rounded accent-blue-400 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="space-y-6">
      {/* Pages */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Pages</h3>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 dark:bg-gray-800">
              <tr>
                <th className="text-left px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">Page</th>
                <th className="text-center px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">Access</th>
              </tr>
            </thead>
            <tbody>
              {PAGE_SECTIONS.map((section) => {
                const sectionPages = section.pages.filter((slug) => pages.includes(slug));
                if (sectionPages.length === 0) return null;
                const sectionPageRows = pageRows.filter((r) => sectionPages.includes(r.resource_id));
                return (
                  <React.Fragment key={section.section}>
                    <tr className="bg-gray-50 dark:bg-gray-800/60 border-t border-gray-100 dark:border-gray-800">
                      <td colSpan={2} className="px-4 py-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                        {section.section}
                      </td>
                    </tr>
                    {sectionPageRows.map((row, i) => (
                      <tr key={row.resource_id} className={`border-t border-gray-100 dark:border-gray-800 ${i % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800/50"}`}>
                        <td className="px-4 py-2 text-gray-900 dark:text-gray-100 pl-8">{row.label}</td>
                        <td className="px-4 py-2 text-center">
                          <input
                            type="checkbox"
                            className={checkboxClass}
                            checked={!!row.permissions.access}
                            onChange={() => toggle(pageRows.indexOf(row), "access")}
                            disabled={isReadOnly}
                          />
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Collections */}
      {collectionRows.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Collections</h3>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-gray-100 dark:bg-gray-800">
                <tr>
                  <th className="text-left px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">Collection</th>
                  {COLLECTION_PERMS.map((p) => (
                    <th key={p} className="text-center px-3 py-2 text-gray-500 dark:text-gray-400 font-medium capitalize">
                      {p === "model" ? "Model" : p === "permission" ? "Permission" : p.charAt(0).toUpperCase() + p.slice(1)}
                    </th>
                  ))}
                  <th className="w-8 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {collectionRows.map((row, i) => {
                  const idx = pageRows.length + i;
                  const isSystemCol = row.collectionType === "system";
                  const isExpanded = expandedIds.has(row.resource_id);
                  const fields = fieldCache.get(row.resource_id) ?? [];
                  const isLoadingFields = fieldLoading.has(row.resource_id);

                  return (
                    <React.Fragment key={row.resource_id}>
                      <tr className={`border-t border-gray-100 dark:border-gray-800 ${i % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800/50"}`}>
                        <td className="px-4 py-2 text-gray-900 dark:text-gray-100 max-w-[200px] truncate">{row.label}</td>
                        {COLLECTION_PERMS.map((p) => {
                          const isLocked = isSystemCol && p === "model";
                          return (
                            <td key={p} className="px-3 py-2 text-center">
                              <input
                                type="checkbox"
                                className={checkboxClass}
                                checked={isLocked ? false : !!row.permissions[p]}
                                onChange={() => toggle(idx, p)}
                                disabled={isReadOnly || isLocked}
                                title={isLocked ? "System collection model is managed by Next Novas only" : undefined}
                              />
                            </td>
                          );
                        })}
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => toggleExpand(row.resource_id)}
                            className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                            title="Row conditions"
                          >
                            {isExpanded
                              ? <ChevronDown className="h-4 w-4" />
                              : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </td>
                      </tr>

                      {/* Conditions sub-panel */}
                      {isExpanded && (
                        <tr className={`border-t border-dashed border-blue-200 dark:border-blue-900/40 ${i % 2 === 0 ? "bg-blue-50/30 dark:bg-blue-950/20" : "bg-blue-50/20 dark:bg-blue-950/10"}`}>
                          <td colSpan={COLLECTION_PERMS.length + 2} className="px-6 py-4">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                  Row Conditions
                                  <span className="ml-2 text-gray-400 dark:text-gray-500 normal-case font-normal">
                                    — items are filtered to rows matching ALL conditions
                                  </span>
                                </p>
                                {!isReadOnly && (
                                  <button
                                    type="button"
                                    onClick={() => addCondition(idx)}
                                    className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                    Add condition
                                  </button>
                                )}
                              </div>

                              {row.conditions.length === 0 ? (
                                <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                                  No conditions — all items visible (subject to CRUD flags above).
                                </p>
                              ) : (
                                <div className="space-y-2">
                                  {row.conditions.map((cond, ci) => (
                                    <div key={ci} className="flex items-center gap-2">
                                      {/* Field */}
                                      {isLoadingFields ? (
                                        <input
                                          type="text"
                                          value={cond.field}
                                          onChange={(e) => updateCondition(idx, ci, { field: e.target.value })}
                                          placeholder="field slug"
                                          disabled={isReadOnly}
                                          className="w-40 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
                                        />
                                      ) : fields.length > 0 ? (
                                        <select
                                          value={cond.field}
                                          onChange={(e) => updateCondition(idx, ci, { field: e.target.value })}
                                          disabled={isReadOnly}
                                          className="w-40 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                        >
                                          <option value="">— field —</option>
                                          <option value="created_by">created_by</option>
                                          {fields.map((f) => (
                                            <option key={f.slug} value={f.slug}>{f.name} ({f.slug})</option>
                                          ))}
                                        </select>
                                      ) : (
                                        <input
                                          type="text"
                                          value={cond.field}
                                          onChange={(e) => updateCondition(idx, ci, { field: e.target.value })}
                                          placeholder="field slug"
                                          disabled={isReadOnly}
                                          className="w-40 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
                                        />
                                      )}

                                      {/* Operator */}
                                      <select
                                        value={cond.op}
                                        onChange={(e) => updateCondition(idx, ci, { op: e.target.value })}
                                        disabled={isReadOnly}
                                        className="w-28 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                      >
                                        {OPS.map((o) => (
                                          <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                      </select>

                                      {/* Value */}
                                      <input
                                        type="text"
                                        value={cond.val}
                                        onChange={(e) => updateCondition(idx, ci, { val: e.target.value })}
                                        placeholder={cond.op === "in" || cond.op === "not_in" ? "val1, val2" : "value or user.id"}
                                        disabled={isReadOnly}
                                        className="flex-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
                                      />

                                      {!isReadOnly && (
                                        <button
                                          type="button"
                                          onClick={() => removeCondition(idx, ci)}
                                          className="text-red-400 hover:text-red-500 transition-colors"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                              <p className="text-xs text-gray-400 dark:text-gray-500">
                                Use <code className="font-mono">user.id</code> as a value to match the current user&apos;s ID.
                              </p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isReadOnly && (
        <Button
          onClick={handleSave}
          disabled={loading}
          className="bg-blue-50 dark:bg-blue-950 border border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/30 hover:text-[#a8c4ff]"
        >
          <Save className="mr-2 h-4 w-4" />
          {loading ? "Saving..." : "Save Permissions"}
        </Button>
      )}

      {isSystem && canEditSystem && !readOnly && (
        <p className="text-xs text-amber-500">Editing system policy — changes affect all users with this policy assigned.</p>
      )}

      {isSystem && !canEditSystem && !readOnly && (
        <p className="text-xs text-gray-500 dark:text-gray-400 italic">System policies cannot be edited.</p>
      )}
    </div>
  );
}
