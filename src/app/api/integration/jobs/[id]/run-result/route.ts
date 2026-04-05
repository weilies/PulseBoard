/**
 * POST /api/integration/jobs/[id]/run-result
 *
 * Called BY n8n (not by tenants) to report the final result of a workflow execution.
 * Validated with N8N_CALLBACK_SECRET header.
 *
 * n8n should send:
 * {
 *   status: "success" | "partial" | "failed" | "aborted",
 *   n8n_execution_id: "...",
 *   summary: { total_rows: 100, success_count: 98, error_count: 2 },
 *   errors: [{ row_number: 5, source_data: {...}, error_code: "...", error_message: "..." }]
 * }
 */
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const CALLBACK_SECRET = process.env.N8N_CALLBACK_SECRET ?? "";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: runId } = await params;

  // Validate shared secret
  const secret = request.headers.get("X-N8N-Callback-Secret");
  if (!CALLBACK_SECRET || secret !== CALLBACK_SECRET) {
    return Response.json({ error: "Invalid callback secret" }, { status: 401 });
  }

  let body: {
    status: string;
    n8n_execution_id?: string;
    summary?: Record<string, unknown>;
    errors?: Array<{
      row_number?: number;
      source_data?: unknown;
      error_code?: string;
      error_message?: string;
    }>;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = createAdminClient();

  // Update the run record
  const { error: updateError } = await db
    .from("integration_job_runs")
    .update({
      status: body.status ?? "unknown",
      n8n_execution_id: body.n8n_execution_id ?? null,
      completed_at: new Date().toISOString(),
      summary: body.summary ?? null,
    })
    .eq("id", runId);

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  // Insert row-level errors if any
  if (body.errors && body.errors.length > 0) {
    await db.from("integration_job_errors").insert(
      body.errors.map((e) => ({
        run_id: runId,
        row_number: e.row_number ?? null,
        source_data: e.source_data ?? null,
        error_code: e.error_code ?? null,
        error_message: e.error_message ?? null,
      }))
    );
  }

  return Response.json({ ok: true });
}
