"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2, XCircle, Clock, AlertCircle, Download, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { resolveErrorRow } from "@/app/actions/platform-apps";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RunInfo {
  id: string;
  status: string;
  triggered_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  summary: Record<string, unknown>;
  n8n_execution_id: string | null;
}

interface ErrorRow {
  id: string;
  row_number: number | null;
  source_data: Record<string, unknown> | null;
  error_code: string | null;
  error_message: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  resolver_email: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number | null): string {
  if (ms == null || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "success")
    return <span className="flex items-center gap-1 text-emerald-600 text-sm font-medium"><CheckCircle2 className="h-4 w-4" /> Success</span>;
  if (status === "running")
    return <span className="flex items-center gap-1 text-blue-500 text-sm font-medium"><Clock className="h-4 w-4 animate-spin" /> Running</span>;
  if (status === "partial")
    return <span className="flex items-center gap-1 text-amber-500 text-sm font-medium"><AlertCircle className="h-4 w-4" /> Partial</span>;
  return <span className="flex items-center gap-1 text-red-500 text-sm font-medium"><XCircle className="h-4 w-4" /> {status}</span>;
}

function downloadCsv(errors: ErrorRow[], runId: string) {
  const header = ["row_number", "error_code", "error_message", "source_data", "status", "resolved_by", "resolved_at", "resolution_note"];
  const rows = errors.map((e) => [
    e.row_number ?? "",
    e.error_code ?? "",
    e.error_message ?? "",
    e.source_data ? JSON.stringify(e.source_data) : "",
    e.resolved_at ? "resolved" : "unresolved",
    e.resolver_email ?? "",
    e.resolved_at ? new Date(e.resolved_at).toLocaleString() : "",
    e.resolution_note ?? "",
  ]);

  const csvContent = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `run-${runId.slice(0, 8)}-errors.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Resolve Dialog
// ---------------------------------------------------------------------------

function ResolveDialog({
  errorId,
  rowNumber,
  onClose,
  onResolved,
}: {
  errorId: string;
  rowNumber: number | null;
  onClose: () => void;
  onResolved: (errorId: string) => void;
}) {
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("error_id", errorId);
      fd.set("resolution_note", note);
      const result = await resolveErrorRow(fd);
      if (result.error) { setError(result.error); return; }
      onResolved(errorId);
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark Row {rowNumber ?? "?"} as Resolved</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex items-start gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded p-3">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Resolution is permanent and cannot be undone. Add a note explaining how this row was handled.</span>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Resolution note (optional)</label>
            <Textarea
              placeholder="e.g. Re-processed manually, duplicate removed, data corrected in source system…"
              value={note}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value)}
              rows={3}
              className="resize-none text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? <><RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> Saving…</> : "Mark Resolved"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main client
// ---------------------------------------------------------------------------

export function RunDetailClient({
  installedAppId,
  run,
  appName,
  errors: initialErrors,
}: {
  installedAppId: string;
  run: RunInfo;
  appName: string;
  appIcon: string | null;
  errors: ErrorRow[];
}) {
  const [errors, setErrors] = useState<ErrorRow[]>(initialErrors);
  const [resolveTarget, setResolveTarget] = useState<ErrorRow | null>(null);

  function handleResolved(errorId: string) {
    setErrors((prev) =>
      prev.map((e) =>
        e.id === errorId
          ? { ...e, resolved_at: new Date().toISOString(), resolver_email: "You" }
          : e
      )
    );
  }

  const unresolvedCount = errors.filter((e) => !e.resolved_at).length;
  const resolvedCount = errors.filter((e) => !!e.resolved_at).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
          Run Details — {appName}
        </h1>
        <p className="text-sm text-gray-400 mt-0.5 font-mono">{run.id}</p>
      </div>

      {/* Run summary */}
      <div className="p-5 rounded-lg border border-gray-200 bg-white space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs text-gray-400 mb-1">Triggered</p>
            <p className="text-sm text-gray-700">
              {new Date(run.triggered_at).toLocaleString("en-US", {
                weekday: "short", month: "short", day: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Duration</p>
            <p className="text-sm text-gray-700 font-mono">{formatDuration(run.duration_ms)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Status</p>
            <StatusBadge status={run.status} />
          </div>
          {run.n8n_execution_id && (
            <div>
              <p className="text-xs text-gray-400 mb-1">n8n Execution</p>
              <p className="text-sm text-gray-500 font-mono">{run.n8n_execution_id}</p>
            </div>
          )}
        </div>

        {Object.keys(run.summary).length > 0 && (
          <div className="flex flex-wrap gap-5 pt-3 border-t border-gray-100">
            {Object.entries(run.summary).map(([k, v]) => (
              <div key={k} className="text-center">
                <p className="text-xl font-bold text-gray-900">{String(v)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{k.replace(/_/g, " ")}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Error rows */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-sm font-semibold text-gray-800">Error Rows</p>
            {errors.length > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">
                {unresolvedCount} unresolved · {resolvedCount} resolved
              </p>
            )}
          </div>
          {errors.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadCsv(errors, run.id)}
              className="flex items-center gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              Download CSV
            </Button>
          )}
        </div>

        {errors.length === 0 ? (
          <div className="p-10 text-center text-gray-400 border border-gray-200 rounded-lg">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-300" />
            <p className="font-medium text-gray-500">No row errors recorded</p>
            <p className="text-sm mt-1">
              n8n reported no per-row failures for this run. If errors exist, they will appear here after n8n sends its callback.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-12">Row #</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Error</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Source data</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Status</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {errors.map((err, i) => (
                  <tr key={err.id} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{err.row_number ?? "—"}</td>
                    <td className="px-4 py-3">
                      {err.error_code && (
                        <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-mono text-red-600 border border-red-100">
                          {err.error_code}
                        </span>
                      )}
                      {err.error_message && (
                        <p className="text-xs text-gray-500 mt-0.5 max-w-xs truncate" title={err.error_message}>
                          {err.error_message}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {err.source_data ? (
                        <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap max-w-xs overflow-hidden max-h-16">
                          {JSON.stringify(err.source_data, null, 2).slice(0, 200)}
                        </pre>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {err.resolved_at ? (
                        <div>
                          <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Resolved
                          </span>
                          <p className="text-xs text-gray-400 mt-0.5">
                            by {err.resolver_email ?? "unknown"} · {new Date(err.resolved_at).toLocaleDateString()}
                          </p>
                          {err.resolution_note && (
                            <p className="text-xs text-gray-400 mt-0.5 italic max-w-xs truncate" title={err.resolution_note}>
                              &ldquo;{err.resolution_note}&rdquo;
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-500 text-xs font-medium">
                          <AlertCircle className="h-3.5 w-3.5" /> Unresolved
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!err.resolved_at && (
                        <button
                          onClick={() => setResolveTarget(err)}
                          className="rounded border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors whitespace-nowrap"
                        >
                          Mark Resolved
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Resolution guide */}
      {errors.length > 0 && (
        <div className="flex items-start gap-2 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-gray-400" />
          <div>
            <p className="font-medium text-gray-700">About error resolution</p>
            <p className="text-xs mt-1">
              Marking a row resolved records <strong>who</strong>, <strong>when</strong>, and an optional note. This is an audit trail only — it does not re-run or re-submit the row. To re-process failed rows, trigger the workflow manually or wait for the next scheduled run.
            </p>
          </div>
        </div>
      )}

      {resolveTarget && (
        <ResolveDialog
          errorId={resolveTarget.id}
          rowNumber={resolveTarget.row_number}
          onClose={() => setResolveTarget(null)}
          onResolved={handleResolved}
        />
      )}
    </div>
  );
}
