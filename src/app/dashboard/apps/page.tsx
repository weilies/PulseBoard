import { getUser } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { KeyRound } from "lucide-react";
import { CreateAppDialog } from "@/components/create-app-dialog";
import { AppActions } from "@/components/app-actions";

export default async function AppsPage() {
  const user = await getUser();
  if (!user) return null;

  const tenantId = await resolveTenant(user.id);
  if (!tenantId) return null;

  const db = createAdminClient();
  const { data: apps } = await db
    .from("tenant_apps")
    .select("id, app_name, app_id, is_active, created_at, last_used_at, expires_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  const rows = apps ?? [];

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <KeyRound className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
              API Apps
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Manage app credentials for server-to-server integrations.
            </p>
          </div>
        </div>
        <CreateAppDialog />
      </div>

      {/* Table */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-100">
            <TableRow className="border-gray-200 hover:bg-transparent">
              <TableHead className="text-gray-500">App Name</TableHead>
              <TableHead className="text-gray-500">App ID</TableHead>
              <TableHead className="text-gray-500 hidden sm:table-cell">Status</TableHead>
              <TableHead className="text-gray-500 hidden md:table-cell">Last Used</TableHead>
              <TableHead className="text-gray-500 hidden md:table-cell">Expires</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-gray-500 py-10 bg-white">
                  No apps yet. Create one to generate API credentials.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((app, i) => (
                <TableRow key={app.id} className={`border-gray-200 hover:bg-gray-50 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                  <TableCell className="text-gray-900 font-medium">{app.app_name}</TableCell>
                  <TableCell>
                    <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-blue-600 font-mono">
                      {app.app_id}
                    </code>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {app.is_active ? (
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">Active</Badge>
                    ) : (
                      <Badge className="bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-100">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-gray-500 text-xs hidden md:table-cell">
                    {app.last_used_at
                      ? new Date(app.last_used_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                      : "Never"
                    }
                  </TableCell>
                  <TableCell className="text-gray-500 text-xs hidden md:table-cell">
                    {app.expires_at
                      ? new Date(app.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : "Never"
                    }
                  </TableCell>
                  <TableCell>
                    <AppActions app={app} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-gray-500">
        App credentials are used for server-to-server integrations. Use <code className="rounded bg-gray-100 px-1 py-0.5 text-blue-600 font-mono">POST /api/auth/token</code> with your app_id and app_secret to get a Bearer token.
      </p>
    </div>
  );
}
