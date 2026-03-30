"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Plus, Trash2, ChevronUp, ChevronDown, Zap, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConditionRow {
  field: string;
  op: string;
  value: string;
}

interface Rule {
  id: string;
  rule_type: "validation" | "derivation";
  name: string;
  description: string | null;
  priority: number;
  is_active: boolean;
  conditions: { logic: "AND" | "OR"; rules: ConditionRow[] } | null;
  actions: Record<string, unknown>;
  require_parent: boolean;
  tenant_id: string | null;
  created_at: string;
}

interface FieldDef { slug: string; name: string; field_type: string; }

interface RulesClientProps {
  collectionSlug: string;
  collectionId: string;
  rules: Rule[];
  fields: FieldDef[];
  tenantId: string;
  isSuperAdmin: boolean;
}

const OPS = [
  { value: "eq", label: "equals" },
  { value: "neq", label: "not equals" },
  { value: "gt", label: "greater than" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "less than" },
  { value: "lte", label: "≤" },
  { value: "contains", label: "contains" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];

// ---------------------------------------------------------------------------
// Add Rule Dialog
// ---------------------------------------------------------------------------

function AddRuleDialog({
  collectionSlug,
  fields,
  ruleType,
  onClose,
  onSaved,
}: {
  collectionSlug: string;
  fields: FieldDef[];
  ruleType: "validation" | "derivation";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [conditions, setConditions] = useState<ConditionRow[]>([]);
  const [condLogic, setCondLogic] = useState<"AND" | "OR">("AND");
  // Validation action fields
  const [validField, setValidField] = useState(fields[0]?.slug ?? "");
  const [validOp, setValidOp] = useState("lte");
  const [validValue, setValidValue] = useState("");
  const [validMsg, setValidMsg] = useState("");
  // Derivation action fields
  const [targetField, setTargetField] = useState(fields[0]?.slug ?? "");
  const [formula, setFormula] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function addCondition() {
    setConditions((prev) => [...prev, { field: fields[0]?.slug ?? "", op: "eq", value: "" }]);
  }

  function updateCondition(i: number, key: keyof ConditionRow, val: string | null) {
    setConditions((prev) => prev.map((c, idx) => idx === i ? { ...c, [key]: val ?? "" } : c));
  }

  function removeCondition(i: number) {
    setConditions((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    if (!name.trim()) { setError("Name is required"); return; }

    const actions = ruleType === "validation"
      ? { type: "validation", field: validField, op: validOp, value: isNaN(Number(validValue)) ? validValue : Number(validValue), message: validMsg }
      : { type: "derivation", target_field: targetField, formula };

    const body = {
      rule_type: ruleType,
      name: name.trim(),
      description: description.trim() || null,
      conditions: conditions.length > 0 ? { logic: condLogic, rules: conditions.map((c) => ({ ...c, value: isNaN(Number(c.value)) ? c.value : Number(c.value) })) } : null,
      actions,
    };

    startTransition(async () => {
      try {
        const res = await fetch(`/api/collections/${collectionSlug}/rules`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const json = await res.json();
          setError(json.error ?? "Failed to save rule");
          return;
        }
        onSaved();
        onClose();
      } catch {
        setError("Network error");
      }
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-gray-900 dark:bg-gray-900 border-gray-700 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-gray-100 dark:text-gray-100">
            {ruleType === "validation" ? "Add Validation Rule" : "Add Derivation Rule"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-gray-300 dark:text-gray-300">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Salary cap for IT" className="border-gray-600 dark:border-gray-600 bg-gray-800 dark:bg-gray-800 text-gray-100 dark:text-gray-100 placeholder:text-gray-500" />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-gray-300 dark:text-gray-300">Description <span className="text-gray-500 dark:text-gray-500">(optional)</span></Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional explanation" className="border-gray-600 dark:border-gray-600 bg-gray-800 dark:bg-gray-800 text-gray-100 dark:text-gray-100 placeholder:text-gray-500" />
          </div>

          {/* Conditions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-gray-300 dark:text-gray-300">Conditions <span className="text-gray-500 dark:text-gray-500">(empty = always fires)</span></Label>
              {conditions.length > 1 && (
                <Select value={condLogic} onValueChange={(v) => setCondLogic(v as "AND" | "OR")}>
                  <SelectTrigger className="h-7 w-20 text-xs border-gray-600 dark:border-gray-600 bg-gray-800 dark:bg-gray-800 text-gray-100"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-gray-800 dark:bg-gray-800 border-gray-600">
                    <SelectItem value="AND">AND</SelectItem>
                    <SelectItem value="OR">OR</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            {conditions.map((cond, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={cond.field ?? ""} onValueChange={(v) => updateCondition(i, "field", v)}>
                  <SelectTrigger className="h-8 flex-1 text-xs border-gray-600 dark:border-gray-600 bg-gray-800 dark:bg-gray-800 text-gray-100"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-gray-800 dark:bg-gray-800 border-gray-600">
                    {fields.map((f) => <SelectItem key={f.slug} value={f.slug}>{f.name}</SelectItem>)}
                    <SelectItem value="parent.id">parent.id</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={cond.op} onValueChange={(v) => updateCondition(i, "op", v)}>
                  <SelectTrigger className="h-8 w-28 text-xs border-gray-600 dark:border-gray-600 bg-gray-800 dark:bg-gray-800 text-gray-100"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-gray-800 dark:bg-gray-800 border-gray-600">
                    {OPS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input value={cond.value} onChange={(e) => updateCondition(i, "value", e.target.value)} placeholder="value" className="h-8 flex-1 text-xs border-gray-600 dark:border-gray-600 bg-gray-800 dark:bg-gray-800 text-gray-100 placeholder:text-gray-500" />
                <button onClick={() => removeCondition(i)} className="text-gray-500 dark:text-gray-500 hover:text-red-500 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button onClick={addCondition} className="text-xs text-blue-400 dark:text-blue-400 hover:text-blue-300 transition-colors">
              + Add condition
            </button>
          </div>

          {/* Action */}
          {ruleType === "validation" ? (
            <div className="space-y-2 rounded-lg border border-gray-700 dark:border-gray-700 bg-gray-800 dark:bg-gray-800 p-3">
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-400 uppercase tracking-wider">Validation Action</p>
              <div className="flex items-center gap-2">
                <Select value={validField} onValueChange={(v) => setValidField(v ?? "")}>
                  <SelectTrigger className="h-8 flex-1 text-xs border-gray-600 dark:border-gray-600 bg-gray-700 dark:bg-gray-700 text-gray-100"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-gray-800 dark:bg-gray-800 border-gray-600">
                    {fields.map((f) => <SelectItem key={f.slug} value={f.slug}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={validOp} onValueChange={(v) => setValidOp(v ?? "")}>
                  <SelectTrigger className="h-8 w-28 text-xs border-gray-600 dark:border-gray-600 bg-gray-700 dark:bg-gray-700 text-gray-100"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-gray-800 dark:bg-gray-800 border-gray-600">
                    {OPS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input value={validValue} onChange={(e) => setValidValue(e.target.value)} placeholder="value" className="h-8 flex-1 text-xs border-gray-600 dark:border-gray-600 bg-gray-700 dark:bg-gray-700 text-gray-100 placeholder:text-gray-500" />
              </div>
              <Input value={validMsg} onChange={(e) => setValidMsg(e.target.value)} placeholder="Error message shown to user" className="text-xs border-gray-600 dark:border-gray-600 bg-gray-700 dark:bg-gray-700 text-gray-100 placeholder:text-gray-500" />
            </div>
          ) : (
            <div className="space-y-2 rounded-lg border border-gray-700 dark:border-gray-700 bg-gray-800 dark:bg-gray-800 p-3">
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-400 uppercase tracking-wider">Derivation Action</p>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-400 dark:text-gray-400">Target field (will be set to formula result)</Label>
                <Select value={targetField} onValueChange={(v) => setTargetField(v ?? "")}>
                  <SelectTrigger className="h-8 text-xs border-gray-600 dark:border-gray-600 bg-gray-700 dark:bg-gray-700 text-gray-100"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-gray-800 dark:bg-gray-800 border-gray-600">
                    {fields.map((f) => <SelectItem key={f.slug} value={f.slug}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-400 dark:text-gray-400">Formula</Label>
                <Input value={formula} onChange={(e) => setFormula(e.target.value)} placeholder="e.g. salary * 0.10  or  IF(department = &quot;IT&quot;, salary * 0.12, salary * 0.08)" className="text-xs font-mono border-gray-600 dark:border-gray-600 bg-gray-700 dark:bg-gray-700 text-gray-100 placeholder:text-gray-500" />
                <p className="text-xs text-gray-500 dark:text-gray-500">Supports: +−×÷, field names, IF(cond, then, else), ROUND(x, n), MIN(a,b), MAX(a,b)</p>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-400 dark:text-red-400">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-gray-600 dark:border-gray-600 text-gray-300 dark:text-gray-300 hover:bg-gray-800">Cancel</Button>
          <Button onClick={handleSave} disabled={isPending} className="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-600 dark:hover:bg-blue-700">
            {isPending ? "Saving…" : "Save Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Rule row
// ---------------------------------------------------------------------------

function RuleRow({
  rule,
  isPlatform,
  collectionSlug,
  onDeleted,
  onToggled,
  onMoved,
}: {
  rule: Rule;
  isPlatform: boolean;
  collectionSlug: string;
  onDeleted: (id: string) => void;
  onToggled: (id: string, active: boolean) => void;
  onMoved: (id: string, direction: "up" | "down") => void;
}) {
  const [isPending, startTransition] = useTransition();

  const actions = rule.actions as Record<string, unknown>;
  const isValidation = rule.rule_type === "validation";

  function handleDelete() {
    startTransition(async () => {
      await fetch(`/api/collections/${collectionSlug}/rules/${rule.id}`, { method: "DELETE" });
      onDeleted(rule.id);
    });
  }

  function handleToggle() {
    startTransition(async () => {
      await fetch(`/api/collections/${collectionSlug}/rules/${rule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !rule.is_active }),
      });
      onToggled(rule.id, !rule.is_active);
    });
  }

  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 transition-opacity ${rule.is_active ? "border-gray-700 dark:border-gray-700 bg-gray-900 dark:bg-gray-900" : "border-gray-800 dark:border-gray-800 bg-gray-800 dark:bg-gray-800 opacity-60"}`}>
      {/* Priority controls */}
      {!isPlatform && (
        <div className="flex flex-col gap-0.5 pt-0.5">
          <button onClick={() => onMoved(rule.id, "up")} className="text-gray-600 dark:text-gray-600 hover:text-gray-400 transition-colors">
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onMoved(rule.id, "down")} className="text-gray-600 dark:text-gray-600 hover:text-gray-400 transition-colors">
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Icon */}
      <div className={`mt-0.5 shrink-0 ${isValidation ? "text-orange-500" : "text-blue-500"}`}>
        {isValidation ? <AlertCircle className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-100 dark:text-gray-100">{rule.name}</span>
          {isPlatform && (
            <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-500">
              <Lock className="h-3 w-3" /> Platform
            </span>
          )}
          {!rule.is_active && <span className="text-xs text-gray-500 dark:text-gray-500 italic">disabled</span>}
        </div>
        {rule.description && <p className="text-xs text-gray-400 dark:text-gray-400 mt-0.5">{rule.description}</p>}
        {/* Action summary */}
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-500 font-mono">
          {isValidation
            ? `if (${String(actions.field ?? "?")} ${String(actions.op ?? "?")} ${String(actions.value ?? "?")}) → error: "${String(actions.message ?? "")}"`
            : `${String(actions.target_field ?? "?")} = ${String(actions.formula ?? "")}`
          }
        </div>
      </div>

      {/* Actions */}
      {!isPlatform && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleToggle}
            disabled={isPending}
            title={rule.is_active ? "Disable" : "Enable"}
            className="text-gray-600 dark:text-gray-600 hover:text-blue-400 transition-colors disabled:opacity-50"
          >
            <CheckCircle2 className={`h-4 w-4 ${rule.is_active ? "text-emerald-500" : ""}`} />
          </button>
          <button
            onClick={handleDelete}
            disabled={isPending}
            title="Delete rule"
            className="text-gray-600 dark:text-gray-600 hover:text-red-500 transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

export function RulesClient({ collectionSlug, collectionId: _collectionId, rules: initialRules, fields, tenantId, isSuperAdmin }: RulesClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"validation" | "derivation">("validation");
  const [rules, setRules] = useState(initialRules);
  const [addDialogType, setAddDialogType] = useState<"validation" | "derivation" | null>(null);

  const platformRules = rules.filter((r) => r.rule_type === activeTab && r.tenant_id === null);
  const tenantRules = rules.filter((r) => r.rule_type === activeTab && r.tenant_id !== null);

  function handleDeleted(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  function handleToggled(id: string, active: boolean) {
    setRules((prev) => prev.map((r) => r.id === id ? { ...r, is_active: active } : r));
  }

  function handleMoved(id: string, direction: "up" | "down") {
    const sameTenantRules = rules.filter((r) => r.rule_type === activeTab && r.tenant_id !== null)
      .sort((a, b) => a.priority - b.priority);
    const idx = sameTenantRules.findIndex((r) => r.id === id);
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === sameTenantRules.length - 1) return;

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    const newRules = [...sameTenantRules];
    [newRules[idx], newRules[swapIdx]] = [newRules[swapIdx], newRules[idx]];

    // Re-assign priorities and update in DB (fire-and-forget)
    newRules.forEach((r, i) => {
      fetch(`/api/collections/${collectionSlug}/rules/${r.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: (i + 1) * 10 }),
      });
    });

    setRules((prev) => {
      const platformRs = prev.filter((r) => r.rule_type !== activeTab || r.tenant_id === null);
      const otherTypeRs = prev.filter((r) => r.rule_type === activeTab && r.tenant_id === null);
      return [...platformRs, ...otherTypeRs, ...newRules.map((r, i) => ({ ...r, priority: (i + 1) * 10 }))];
    });
  }

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-0 border-b border-gray-700 dark:border-gray-700">
        {(["validation", "derivation"] as const).map((t) => {
          const count = rules.filter((r) => r.rule_type === t).length;
          return (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-2 text-sm flex items-center gap-1.5 transition-colors ${
                activeTab === t
                  ? "text-blue-400 dark:text-blue-400 border-b-2 border-blue-400 dark:border-blue-400 font-medium"
                  : "text-gray-500 dark:text-gray-500 hover:text-blue-400"
              }`}
            >
              {t === "validation" ? <AlertCircle className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
              {t.charAt(0).toUpperCase() + t.slice(1)}s
              {count > 0 && (
                <span className="rounded-full bg-gray-800 dark:bg-gray-800 px-1.5 py-0.5 text-xs text-gray-400 dark:text-gray-400">{count}</span>
              )}
            </button>
          );
        })}
        <div className="ml-auto flex items-center pb-1">
          <Button
            size="sm"
            onClick={() => setAddDialogType(activeTab)}
            className="h-7 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs dark:bg-blue-600 dark:hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Add {activeTab === "validation" ? "Validation" : "Derivation"}
          </Button>
        </div>
      </div>

      {/* Platform rules */}
      {platformRules.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
            <Lock className="h-3 w-3" /> Platform Rules
          </p>
          {platformRules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              isPlatform={true}
              collectionSlug={collectionSlug}
              onDeleted={handleDeleted}
              onToggled={handleToggled}
              onMoved={handleMoved}
            />
          ))}
        </div>
      )}

      {/* Tenant rules */}
      <div className="space-y-2">
        {(platformRules.length > 0 || tenantRules.length > 0) && (
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wider">
            {isSuperAdmin ? "All Tenant Rules" : "Your Rules"}
          </p>
        )}
        {tenantRules.length === 0 && platformRules.length === 0 && (
          <div className="text-center text-gray-500 dark:text-gray-500 py-12 rounded-lg border border-gray-700 dark:border-gray-700 bg-gray-800 dark:bg-gray-800">
            {activeTab === "validation"
              ? <AlertCircle className="h-6 w-6 text-gray-600 dark:text-gray-600 mx-auto mb-2" />
              : <Zap className="h-6 w-6 text-gray-600 dark:text-gray-600 mx-auto mb-2" />
            }
            <p className="text-sm">No {activeTab} rules yet.</p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
              {activeTab === "validation"
                ? "Add rules to enforce field constraints on every save."
                : "Add rules to compute field values automatically on every save."}
            </p>
          </div>
        )}
        {tenantRules.map((rule) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            isPlatform={false}
            collectionSlug={collectionSlug}
            onDeleted={handleDeleted}
            onToggled={handleToggled}
            onMoved={handleMoved}
          />
        ))}
      </div>

      {/* Execution order note */}
      {rules.length > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-500">
          Execution order: derivations run first (sets computed values), then validations (check those values).
          Within each group: platform rules → tenant rules, sorted by priority.
        </p>
      )}

      {/* Add dialog */}
      {addDialogType && (
        <AddRuleDialog
          collectionSlug={collectionSlug}
          fields={fields}
          ruleType={addDialogType}
          onClose={() => setAddDialogType(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}
