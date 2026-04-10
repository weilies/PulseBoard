import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { MessageSquarePlus, Copy, CheckCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FeedbackSessionActions } from "./feedback-session-actions";
import { NewFeedbackSessionButton } from "./new-feedback-session-button";

export default async function FeedbackPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const tenantId = await resolveTenant(user.id);
  if (!tenantId) redirect("/login");

  // Check feedback_mode is enabled
  const { data: tenant } = await supabase
    .from("tenants")
    .select("feedback_mode")
    .eq("id", tenantId)
    .single();

  if (!tenant?.feedback_mode) {
    return (
      <div className="p-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-4">
          <MessageSquarePlus className="h-6 w-6 text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
            UI Feedback
          </h1>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
          <p className="text-gray-500 text-sm">Feedback mode is not enabled for this tenant.</p>
          <p className="text-gray-400 text-xs mt-1">A super admin can enable it in Tenant settings.</p>
        </div>
      </div>
    );
  }

  const { data: sessions } = await supabase
    .from("ui_feedback_sessions")
    .select("id, title, status, created_at, expires_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  // Fetch item counts per session
  const sessionIds = (sessions ?? []).map((s) => s.id);
  const countMap: Record<string, number> = {};
  if (sessionIds.length > 0) {
    const { data: counts } = await supabase
      .from("ui_feedback_items")
      .select("session_id")
      .in("session_id", sessionIds);
    for (const row of counts ?? []) {
      countMap[row.session_id] = (countMap[row.session_id] ?? 0) + 1;
    }
  }

  const rows = (sessions ?? []).map((s) => ({ ...s, itemCount: countMap[s.id] ?? 0 }));

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageSquarePlus className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
              UI Feedback
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Annotate UI elements and export batches for Claude Code to fix.
            </p>
          </div>
        </div>
        <NewFeedbackSessionButton tenantId={tenantId} userId={user.id} />
      </div>

      {/* Table */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-100 dark:bg-gray-800">
            <TableRow className="border-gray-200 dark:border-gray-700 hover:bg-transparent">
              <TableHead className="text-gray-500 dark:text-gray-400">Session</TableHead>
              <TableHead className="text-gray-500 dark:text-gray-400">Items</TableHead>
              <TableHead className="text-gray-500 dark:text-gray-400">Status</TableHead>
              <TableHead className="text-gray-500 dark:text-gray-400">Expires</TableHead>
              <TableHead className="text-gray-500 dark:text-gray-400 w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-gray-500 dark:text-gray-400 py-10 bg-white dark:bg-gray-900">
                  No feedback sessions yet. Right-click any element while browsing to start annotating.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((s, i) => (
                <TableRow
                  key={s.id}
                  className={`border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${i % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800/50"}`}
                >
                  <TableCell>
                    <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{s.title}</span>
                    <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-blue-600 font-mono">
                      {s.id.slice(0, 8)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{s.itemCount}</span>
                  </TableCell>
                  <TableCell>
                    {s.status === "open" ? (
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">Open</Badge>
                    ) : (
                      <Badge variant="outline" className="text-gray-500 text-xs">Completed</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <Clock className="h-3 w-3" />
                      {new Date(s.expires_at).toLocaleDateString()}
                    </span>
                  </TableCell>
                  <TableCell>
                    <FeedbackSessionActions sessionId={s.id} sessionTitle={s.title} status={s.status} tenantId={tenantId} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-gray-500">
        Sessions expire after 7 days. Copy the export link and paste it to Claude Code to batch-fix all annotations in one prompt.
      </p>
    </div>
  );
}
