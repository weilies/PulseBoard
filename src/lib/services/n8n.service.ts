/**
 * n8n API service — server-side only.
 * Credentials (N8N_BASE_URL, N8N_API_KEY) live in Railway env vars, never NEXT_PUBLIC_.
 */

const N8N_BASE = (process.env.N8N_BASE_URL ?? "").replace(/\/$/, "");
const N8N_KEY = process.env.N8N_API_KEY ?? "";

function n8nHeaders(): Record<string, string> {
  return { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" };
}

function isConfigured(): boolean {
  return Boolean(N8N_BASE && N8N_KEY);
}

/**
 * Clone an existing n8n workflow by ID. Creates a new workflow from the
 * template JSON, names it `name`, activates it, and returns the new workflow ID.
 */
export async function cloneWorkflow(
  templateWorkflowId: string,
  name: string
): Promise<{ id: string } | { error: string }> {
  if (!isConfigured()) return { error: "n8n is not configured (N8N_BASE_URL / N8N_API_KEY missing)" };

  const getRes = await fetch(`${N8N_BASE}/api/v1/workflows/${templateWorkflowId}`, {
    headers: n8nHeaders(),
  });
  if (!getRes.ok) return { error: `Failed to fetch template workflow: ${getRes.status} ${getRes.statusText}` };

  const template = await getRes.json();

  // Strip id so n8n creates a new workflow
  const { id: _id, ...workflowBody } = template;
  const createRes = await fetch(`${N8N_BASE}/api/v1/workflows`, {
    method: "POST",
    headers: n8nHeaders(),
    body: JSON.stringify({ ...workflowBody, name, active: false }),
  });
  if (!createRes.ok) return { error: `Failed to create workflow: ${createRes.status} ${createRes.statusText}` };

  const created = await createRes.json();
  const workflowId = String(created.id);

  // Activate the cloned workflow
  await fetch(`${N8N_BASE}/api/v1/workflows/${workflowId}/activate`, {
    method: "POST",
    headers: n8nHeaders(),
  });

  return { id: workflowId };
}

/**
 * Deactivate a workflow in n8n (does not delete it).
 */
export async function deactivateWorkflow(workflowId: string): Promise<{ error?: string }> {
  if (!isConfigured()) return { error: "n8n is not configured" };

  const res = await fetch(`${N8N_BASE}/api/v1/workflows/${workflowId}/deactivate`, {
    method: "POST",
    headers: n8nHeaders(),
  });
  if (!res.ok) return { error: `Failed to deactivate workflow: ${res.status} ${res.statusText}` };
  return {};
}

/**
 * Create a credential in n8n vault. Returns the n8n credential ID.
 * The actual credential data never leaves n8n — PulseBox only stores the ID.
 */
export async function createCredential(
  name: string,
  type: string,
  data: Record<string, unknown>
): Promise<{ id: string } | { error: string }> {
  if (!isConfigured()) return { error: "n8n is not configured" };

  const res = await fetch(`${N8N_BASE}/api/v1/credentials`, {
    method: "POST",
    headers: n8nHeaders(),
    body: JSON.stringify({ name, type, data }),
  });
  if (!res.ok) return { error: `Failed to create credential: ${res.status} ${res.statusText}` };

  const created = await res.json();
  return { id: String(created.id) };
}

/**
 * Update an existing credential in n8n vault.
 */
export async function updateCredential(
  credentialId: string,
  data: Record<string, unknown>
): Promise<{ error?: string }> {
  if (!isConfigured()) return { error: "n8n is not configured" };

  const res = await fetch(`${N8N_BASE}/api/v1/credentials/${credentialId}`, {
    method: "PATCH",
    headers: n8nHeaders(),
    body: JSON.stringify({ data }),
  });
  if (!res.ok) return { error: `Failed to update credential: ${res.status} ${res.statusText}` };
  return {};
}

/**
 * Activate (resume) a workflow in n8n.
 */
export async function activateWorkflow(workflowId: string): Promise<{ error?: string }> {
  if (!isConfigured()) return { error: "n8n is not configured" };

  const res = await fetch(`${N8N_BASE}/api/v1/workflows/${workflowId}/activate`, {
    method: "POST",
    headers: n8nHeaders(),
  });
  if (!res.ok) return { error: `Failed to activate workflow: ${res.status} ${res.statusText}` };
  return {};
}

/**
 * Manually trigger a workflow execution in n8n.
 * Uses the REST API execute endpoint. Requires the workflow to have a Manual Trigger node.
 */
export async function triggerWorkflow(
  workflowId: string
): Promise<{ executionId: string } | { error: string }> {
  if (!isConfigured()) return { error: "n8n is not configured" };

  const res = await fetch(`${N8N_BASE}/api/v1/workflows/${workflowId}/execute`, {
    method: "POST",
    headers: n8nHeaders(),
    body: JSON.stringify({}),
  });
  if (!res.ok) return { error: `Failed to trigger workflow: ${res.status} ${res.statusText}` };
  const body = await res.json();
  return { executionId: String(body.executionId ?? body.id ?? "unknown") };
}

/**
 * Fetch workflow detail from n8n. Returns simplified node list (no credential values).
 */
export async function getWorkflow(
  workflowId: string
): Promise<{ nodes: WorkflowNode[] } | { error: string }> {
  if (!isConfigured()) return { error: "n8n is not configured" };

  const res = await fetch(`${N8N_BASE}/api/v1/workflows/${workflowId}`, {
    headers: n8nHeaders(),
  });
  if (!res.ok) return { error: `Failed to fetch workflow: ${res.status} ${res.statusText}` };
  const body = await res.json();

  const nodes: WorkflowNode[] = (body.nodes ?? []).map((n: N8nNode, i: number) => ({
    index: i + 1,
    name: n.name ?? "Unnamed",
    type: formatNodeType(n.type ?? ""),
    // Strip credential values — only include non-sensitive parameters
    parameters: sanitizeParameters(n.parameters ?? {}),
  }));

  return { nodes };
}

export interface WorkflowNode {
  index: number;
  name: string;
  type: string;
  parameters: Record<string, unknown>;
}

interface N8nNode {
  name?: string;
  type?: string;
  parameters?: Record<string, unknown>;
}

function formatNodeType(type: string): string {
  return type.replace(/^n8n-nodes-(base|community)\./i, "").replace(/([A-Z])/g, " $1").trim();
}

const CREDENTIAL_KEYS = ["credential", "auth", "apiKey", "password", "secret", "token", "private"];

function sanitizeParameters(params: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    const isCredentialKey = CREDENTIAL_KEYS.some((k) => key.toLowerCase().includes(k));
    if (isCredentialKey) continue; // strip credential values
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeParameters(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Fetch executions from n8n for a given workflow.
 */
export async function getExecutions(
  workflowId: string,
  limit = 20
): Promise<{ executions: N8nExecution[] } | { error: string }> {
  if (!isConfigured()) return { error: "n8n is not configured" };

  const res = await fetch(
    `${N8N_BASE}/api/v1/executions?workflowId=${workflowId}&limit=${limit}`,
    { headers: n8nHeaders() }
  );
  if (!res.ok) return { error: `Failed to fetch executions: ${res.status} ${res.statusText}` };
  const body = await res.json();
  return { executions: body.data ?? body ?? [] };
}

export interface N8nExecution {
  id: string | number;
  workflowId?: string;
  finished?: boolean;
  mode?: string;
  startedAt?: string;
  stoppedAt?: string;
  status?: string;
}
