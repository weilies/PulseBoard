// src/app/dashboard/tasks/page.tsx
import { getUser } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Bell } from "lucide-react";
import { PAGE_SIZE, buildGridParams, type GridConfig } from "@/lib/data-grid";
import { TablePagination } from "@/components/table-pagination";
import { TaskTabFilter } from "@/components/task-tab-filter";
import { Suspense } from "react";

const gridConfig: GridConfig = {
  sortable: [
    { field: "created_at", defaultDir: "desc" },
  ],
  filterable: [],
};

const TYPE_COLORS: Record<string, string> = {
  notification: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  approval:     "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  reminder:     "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  alert:        "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

const PRIORITY_COLORS: Record<string, string> = {
  high:   "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  normal: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  low:    "bg-gray-50 text-gray-400 dark:bg-gray-900 dark:text-gray-500",
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) return null;

  const tenantId = await resolveTenant(user.id);
  if (!tenantId) return null;

  const sp = await searchParams;
  const { page, sortCol, ascending } = buildGridParams(
    sp as Record<string, string | string[] | undefined>,
    gridConfig
  );

  const statusFilter = typeof sp.status === "string" ? sp.status : "";

  const db = createAdminClient();
  let q = db
    .from("tasks")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId)
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .order("created_at", { ascending })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (statusFilter) q = q.eq("status", statusFilter);

  const { data: tasks, count } = await q;
  const rows = tasks ?? [];
  const totalItems = count ?? 0;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          <div>
            <h1
              className="text-xl font-bold text-gray-900 dark:text-gray-100"
              style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
            >
              Task Inbox
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Notifications, approvals, and reminders for your account.
            </p>
          </div>
        </div>
      </div>

      {/* Tab filters */}
      <Suspense>
        <TaskTabFilter activeStatus={statusFilter} />
      </Suspense>

      {/* Table */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-100 dark:bg-gray-800">
            <TableRow className="border-gray-200 dark:border-gray-700 hover:bg-transparent">
              <TableHead className="text-gray-500 dark:text-gray-400">Title</TableHead>
              <TableHead className="text-gray-500 dark:text-gray-400">Type</TableHead>
              <TableHead className="text-gray-500 dark:text-gray-400">Priority</TableHead>
              <TableHead className="text-gray-500 dark:text-gray-400">Source</TableHead>
              <TableHead className="text-gray-500 dark:text-gray-400">Status</TableHead>
              <TableHead className="text-gray-500 dark:text-gray-400">Created</TableHead>
              <TableHead className="text-gray-500 dark:text-gray-400 w-24">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-gray-500 dark:text-gray-400 py-10">
                  No tasks found
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, i) => (
                <TableRow
                  key={row.id}
                  className={`border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                    i % 2 === 0
                      ? "bg-white dark:bg-gray-900"
                      : "bg-gray-50 dark:bg-gray-800/30"
                  } ${row.status === "unread" ? "font-medium" : ""}`}
                >
                  <TableCell className="text-gray-900 dark:text-gray-100 max-w-xs">
                    <div>
                      <p className="truncate">{row.title}</p>
                      {row.body && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                          {row.body}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                        TYPE_COLORS[row.type] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {row.type}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                        PRIORITY_COLORS[row.priority] ?? ""
                      }`}
                    >
                      {row.priority}
                    </span>
                  </TableCell>
                  <TableCell className="text-gray-500 dark:text-gray-400 text-sm">
                    {row.source ?? "—"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                        row.status === "unread"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                          : row.status === "done"
                          ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                      }`}
                    >
                      {row.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-gray-500 dark:text-gray-400 text-sm whitespace-nowrap">
                    {formatDate(row.created_at)}
                  </TableCell>
                  <TableCell>
                    {row.action_url && (
                      <a
                        href={row.action_url}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                      >
                        {row.action_label ?? "View"} →
                      </a>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <TablePagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          basePath="/dashboard/tasks"
          sortCol={sortCol}
          ascending={ascending}
          currentParams={statusFilter ? { status: statusFilter } : undefined}
        />
      )}
    </div>
  );
}
