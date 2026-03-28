# PulseBox ERP-OS — Phase 2 Design Spec

> **Status:** Ready for implementation
> **Date:** 2026-03-28
> **Scope:** Workflow Engine — Generic Multi-Level Approval System

---

## Context

Phase 1 shipped the App Bundle Model + Rule Engine v1. Phase 1.5 added the Task Inbox + Notification Bell. Phase 2 adds a generic, configurable workflow engine that routes collection items through multi-level approval chains. It is collection-agnostic — admins configure workflows for any collection (leave requests, claims, exit interviews, etc.) without writing code.

## Full Roadmap

```
Phase 1   — App Bundle Model + Rule Engine v1                ✅ done
Phase 1.5 — Task Inbox / Notifications                       ✅ done
Phase 2   — Workflow Engine (this spec)
Phase 3   — First ERP Apps (Workforce, Leave, Clocking)
Phase 4   — Finance Apps (Expense, Books/Journal, GL)
Phase 5   — Script Layer + Marketplace
```

---

## What Phase 2 Delivers

1. **Workflow definitions** — admin configures named workflows linked to any collection, with sub-types, pre-checks, approval nodes, and completion actions
2. **Multi-level approval nodes** — ordered steps, each with conditions (skip if not matched), multiple assignable approvers, and configurable quorum
3. **Lazy approver resolution** — approvers for each node are resolved only when that node becomes active, ensuring "direct manager" always reflects the current org structure
4. **Workflow execution engine** — synchronous API-driven engine: submit → advance → complete
5. **Approval UI** — approvers act via a page linked from their bell notification task
6. **Workflow builder UI** — admin creates and edits workflows via a structured step editor in Studio
7. **Submit button** — appears on collection item pages where an active workflow is configured

---

## Architecture Decisions

### Execution Model: Synchronous API-driven

Every user action (submit, approve, reject) calls an API endpoint. The engine advances the workflow synchronously within the same request — no background jobs, no polling, no Supabase Edge Functions. Approval flows are human-paced; synchronous is the right fit and keeps everything within the existing Next.js codebase.

### Builder UI: Structured Step Editor (not drag-drop canvas)

Approval workflows are fundamentally sequential with conditional skipping — not free-form graphs. A structured form editor with inline node panels handles all described use cases without canvas drag-drop complexity. Conditions reuse the Phase 1 Rule Engine condition schema directly.

### Approver Resolution: Lazy

Approvers for a node are resolved only when that node becomes active (not at submit time). This ensures dynamic resolvers like "direct manager" always reflect the current org structure. Future nodes show their label only on the approval page — no username is shown or stored until the node is reached.

---

## Data Model

### `workflow_definitions` table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| tenant_id | UUID FK | Scoped to tenant |
| name | TEXT | e.g. "Leave Approval" |
| description | TEXT NULL | |
| linked_collection_slug | TEXT | Which collection items this applies to |
| sub_types | JSONB NULL | `["Annual Leave", "Sick Leave"]` — optional sub-type labels |
| pre_checks | JSONB NULL | Array of pre-check configs (see schema below) |
| completion_actions | JSONB NULL | Array of actions run after final approval (see schema below) |
| is_active | BOOL DEFAULT true | Inactive definitions do not show Submit button |
| created_by | UUID FK | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### `workflow_nodes` table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| definition_id | UUID FK | Parent workflow definition |
| sort_order | INT | Execution order (ascending) |
| name | TEXT | e.g. "Manager Approval" |
| conditions | JSONB NULL | When this node is active — same schema as Phase 1 Rule Engine. NULL = always active. |
| approver_configs | JSONB | Array of approver resolver configs (see schema below) |
| quorum | TEXT DEFAULT 'any' | `"any"` \| `"all"` \| integer string e.g. `"2"` |
| on_approve | TEXT DEFAULT 'next' | `"next"` \| `"complete"` |
| on_reject | TEXT DEFAULT 'terminate' | `"terminate"` only in Phase 2 |

### `workflow_instances` table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| tenant_id | UUID FK | |
| definition_id | UUID FK | Which workflow definition |
| collection_slug | TEXT | |
| item_id | UUID | The collection item being approved |
| submitter_id | UUID FK | User who submitted |
| sub_type | TEXT NULL | e.g. "Annual Leave" |
| status | TEXT | `pending` \| `approved` \| `rejected` \| `cancelled` |
| current_node_id | UUID FK NULL | Active node — NULL when complete |
| context | JSONB | Snapshot of item data at submission time — frozen, not updated |
| submitted_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ NULL | |

### `workflow_approvals` table

One row per assigned approver per node instance. Serves as both the operational pending tracker and the immutable audit trail.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| instance_id | UUID FK | |
| node_id | UUID FK | |
| approver_id | UUID FK | Resolved user who was assigned |
| task_id | UUID FK NULL | Linked task from Phase 1.5 (bell notification) |
| status | TEXT | `pending` \| `approved` \| `rejected` \| `skipped` |
| comment | TEXT NULL | |
| created_at | TIMESTAMPTZ | When this approval was assigned |
| acted_at | TIMESTAMPTZ NULL | When the approver acted |

### RLS

- `workflow_definitions`: tenant-scoped read for all tenant users; write = super_admin or tenant_admin only
- `workflow_nodes`: same as definitions
- `workflow_instances`: submitter reads own; approver reads instances where they have a `workflow_approvals` row; tenant_admin reads all
- `workflow_approvals`: approver reads/updates own rows; tenant_admin reads all; insert = service role only

---

## JSONB Schemas

### Approver Config (one entry in `approver_configs` array)

```json
// Follow relation fields from submitter
{ "type": "relation_path", "path": "submitter_id.department_id.manager_id" }

// Any user with this role in the tenant
{ "type": "role", "role": "ceo" }

// Specific user (static)
{ "type": "static_user", "user_id": "uuid" }

// Look up approver from a related collection record
{ "type": "collection_lookup", "collection": "departments", "join_field": "department_id", "approver_field": "head_id" }
```

Multiple entries in `approver_configs` are resolved independently and merged + deduplicated into one approver pool before tasks are created.

### Pre-check Config

```json
{
  "type": "balance_check",
  "label": "Sufficient leave balance",
  "collection": "leave_entitlements",
  "join": {
    "submitter_field": "employee_id",
    "target_field": "employee_id",
    "also_match": { "leave_type_field": "sub_type" }
  },
  "check": { "balance_field": "remaining_days", "op": "gte", "request_field": "days_requested" },
  "on_fail": { "message": "Insufficient leave balance. You have {remaining_days} days remaining." }
}
```

Supported `op` values: `gte`, `gt`, `lte`, `lt`, `eq`

### Completion Action Config

```json
// Update a field on the collection item
{ "type": "field_update", "field": "status", "value": "approved" }

// Deduct from a related collection's numeric field
{
  "type": "balance_deduct",
  "collection": "leave_entitlements",
  "join": { "submitter_field": "employee_id", "target_field": "employee_id" },
  "field": "remaining_days",
  "deduct_by_field": "days_requested"
}

// Create a notification task for the submitter
{ "type": "notify_submitter", "title": "Request Approved", "body": "Your request has been approved." }

// Create a notification for a specific role
{ "type": "notify_role", "role": "hr_admin", "title": "Leave Approved", "body": "A leave request has been fully approved." }
```

---

## Execution Engine

### File: `src/lib/workflow-engine.ts`

Two exported functions:

#### `submitWorkflow(params)`

```
1. Load definition + nodes (ordered by sort_order)
2. Run pre_checks — if any fail, throw { message, field } — caller returns 400
3. Snapshot item data into context JSONB
4. Create workflow_instances row (status: "pending")
5. Update item status field to "pending_approval" (if definition has a status field configured)
6. Call advanceToNextNode(instance, context, previousNodeId: null)
```

#### `advanceToNextNode(instance, context, previousNodeId)`

```
1. Find next active node:
   - Load all nodes for definition, ordered by sort_order
   - Start after previousNodeId (or from beginning if null)
   - For each candidate node: evaluate conditions against context (using workflow-condition-evaluator.ts)
   - First node where conditions match = active node
   - If no node matches → run completion (all nodes skipped or exhausted)

2. If active node found:
   - Set instance.current_node_id = node.id
   - Call resolveApprovers(node, instance) → array of user IDs
   - For each approver: create workflow_approvals row (status: "pending")
   - For each approver: create task (Phase 1.5 tasks table) with action_url = /dashboard/workflow-instances/:id
   - Return

3. If no active node (workflow complete):
   - Run completion_actions in order (field_update, balance_deduct, notify)
   - Set instance.status = "approved", instance.completed_at = now()
   - Set instance.current_node_id = null
   - Create notify task for submitter
```

#### `processAction(instanceId, action, approverId, comment)`

```
1. Load instance + current_node_id — verify instance.status = "pending"
2. Load workflow_approvals row for (instance_id, current_node_id, approver_id, status: "pending")
   → if not found: throw 403 "Not assigned to this step"
3. Update approval row: status = action, acted_at = now(), comment
4. Mark linked task as "done" (Phase 1.5 PATCH /api/tasks/:id)

5. If action = "rejected":
   - Set all other pending approvals for this node → "skipped", mark their tasks "done"
   - Set instance.status = "rejected", completed_at = now()
   - Create notify task for submitter (rejected)
   - Return

6. If action = "approved":
   - Check quorum:
     - Count approved rows for this node
     - "any": approved_count >= 1 → quorum met
     - "all": approved_count >= total_assigned_count → quorum met
     - integer N: approved_count >= N → quorum met
   - If quorum NOT met: return (waiting for more approvals)
   - If quorum met:
     - Skip all remaining pending approvals for this node
     - Call advanceToNextNode(instance, context, current_node_id)
```

### File: `src/lib/workflow-condition-evaluator.ts`

Reuses the **exact same condition JSONB schema** from Phase 1 (`collection_rules.conditions`). Evaluates `{ logic, rules: [{ field, op, value }] }` against a context object. The existing condition evaluator from Phase 1 is extracted into a shared module used by both the Rule Engine and the Workflow Engine.

### File: `src/lib/workflow-approver-resolver.ts`

Resolves `approver_configs` array into a list of user IDs:

- `relation_path`: follows dot-notation relation fields from the submitter's profile. Each segment is a UUID FK field on the previous record. Final segment must be a `auth.users` UUID.
- `role`: queries `tenant_users` for all users with the specified role in the current tenant.
- `static_user`: returns the configured user_id directly.
- `collection_lookup`: queries the specified collection for the record matching `join_field`, returns the value of `approver_field`.

Results from all configs are merged into a Set (deduplication), then converted to array.

---

## API Routes

### Workflow Definitions

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/workflow-definitions` | tenant user | List active definitions for tenant |
| POST | `/api/workflow-definitions` | tenant_admin+ | Create definition + nodes |
| GET | `/api/workflow-definitions/[id]` | tenant user | Get definition + nodes |
| PUT | `/api/workflow-definitions/[id]` | tenant_admin+ | Update definition + nodes |
| DELETE | `/api/workflow-definitions/[id]` | tenant_admin+ | Delete (draft/inactive only) |

### Workflow Instances

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/workflow-instances` | tenant user | List own submissions + assigned approvals |
| POST | `/api/workflow-instances` | tenant user | Submit item for approval |
| GET | `/api/workflow-instances/[id]` | submitter or approver | Instance detail + progress + context snapshot |
| POST | `/api/workflow-instances/[id]/approve` | assigned approver | Approve current node |
| POST | `/api/workflow-instances/[id]/reject` | assigned approver | Reject current node |
| POST | `/api/workflow-instances/[id]/cancel` | submitter | Cancel while status=pending |

---

## UI Pages

### `/dashboard/studio/workflows`

Server component. Lists all workflow definitions for the tenant. Columns: name, linked collection, node count, status (active/draft), actions (edit, disable/enable, delete). "New Workflow" button. Accessible to tenant_admin and super_admin only. Added to Studio nav folder.

### `/dashboard/studio/workflows/new` and `/[id]/edit`

Client component (interactive form). Sections:

1. **General** — name, description, linked collection (dropdown of tenant collections), sub-types (tag input)
2. **Pre-checks** — add/remove balance check configs. Each config specifies the entitlement collection, join fields, and balance field.
3. **Approval Nodes** — ordered list. Drag to reorder (sort_order). Each node expands inline to show:
   - Name field
   - Conditions panel (reuses Phase 1 condition builder component)
   - Approver resolver list (add multiple resolvers, each with type selector + fields)
   - Quorum selector: Any / All / Specific number
4. **Completion Actions** — add/remove field_update, balance_deduct, notify_submitter actions

### `/dashboard/workflow-instances/[id]`

Server component (read) + client actions (approve/reject buttons). Layout:

- **Progress stepper** (left or top):
  - Past nodes: green check + approver name + timestamp
  - Current node: blue pulsing dot + resolved approver name(s) + "Pending" badge
  - Future nodes: grey circle + node name only + italic "Approver resolved when reached"
  - Conditional future nodes: dashed grey circle + "Conditional — may be skipped"
- **Context snapshot panel**: displays item fields from `instance.context` JSONB (read-only, labelled as "snapshot at submission")
- **Action panel** (rendered only for assigned approver of current node):
  - Optional comment textarea
  - Approve (green) and Reject (red) buttons
  - "Only [approver name] can act on this step" note for non-approvers

### `<WorkflowSubmitButton />` component

Client component added to collection item pages. Renders only if `GET /api/workflow-definitions?collection_slug=X` returns an active definition. On click: opens a confirmation dialog with sub-type selector (if definition has sub_types), then calls `POST /api/workflow-instances`. Shows a toast on pre-check failure with the server's error message.

---

## Migration

File: `supabase/migrations/00050_workflow_engine.sql`

- Creates `workflow_definitions`, `workflow_nodes`, `workflow_instances`, `workflow_approvals` tables
- Indexes: `(tenant_id, linked_collection_slug)` on definitions; `(instance_id, node_id, approver_id, status)` on approvals; `(instance_id, status)` on instances
- RLS policies as described in Data Model section

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `supabase/migrations/00050_workflow_engine.sql` | New — 4 tables + RLS |
| `src/lib/workflow-engine.ts` | New — submitWorkflow, advanceToNextNode, processAction |
| `src/lib/workflow-condition-evaluator.ts` | New — extracted from Rule Engine, shared evaluator |
| `src/lib/workflow-approver-resolver.ts` | New — 4 resolver types |
| `src/app/api/workflow-definitions/route.ts` | New — GET + POST |
| `src/app/api/workflow-definitions/[id]/route.ts` | New — GET + PUT + DELETE |
| `src/app/api/workflow-instances/route.ts` | New — GET + POST |
| `src/app/api/workflow-instances/[id]/route.ts` | New — GET |
| `src/app/api/workflow-instances/[id]/approve/route.ts` | New — POST |
| `src/app/api/workflow-instances/[id]/reject/route.ts` | New — POST |
| `src/app/api/workflow-instances/[id]/cancel/route.ts` | New — POST |
| `src/app/dashboard/studio/workflows/page.tsx` | New — definition list |
| `src/app/dashboard/studio/workflows/new/page.tsx` | New — create workflow |
| `src/app/dashboard/studio/workflows/[id]/edit/page.tsx` | New — edit workflow |
| `src/app/dashboard/workflow-instances/[id]/page.tsx` | New — approval page |
| `src/components/workflow-node-editor.tsx` | New — inline node editor (conditions + approver + quorum) |
| `src/components/workflow-submit-button.tsx` | New — submit button for collection item pages |
| `src/lib/rule-engine.ts` | Modify — extract condition evaluator into shared module |

---

## What Phase 2 Does NOT Include

- Parallel branching (multiple simultaneous active nodes) — deferred to Phase 5 Script Layer
- Workflow versioning / migrating in-flight instances — deferred
- SLA / deadline enforcement (auto-escalate after N hours) — deferred
- Recall / withdraw after submission — deferred
- Delegation (approver assigns to someone else) — deferred
- Email / push notifications — deferred (Phase 1.5 bell covers Phase 2)
- Workflow analytics / reporting — deferred

---

## Success Criteria

1. Admin can create a workflow definition with 3 nodes, conditions, and a balance pre-check via the Studio UI without writing code
2. Submitting a collection item runs pre-checks and returns a clear error if balance is insufficient
3. Assigned approver receives a bell notification; clicking it opens the approval page with the correct context snapshot
4. Future node approvers are NOT shown on the approval page — only the current node's resolved approver(s) appear
5. If quorum is "any" and 3 approvers are assigned, the first to approve advances the workflow; the other 2 tasks are auto-skipped
6. Conditional node (e.g. CEO approval when amount > 5000) is skipped cleanly when condition is not met
7. Completion actions (field_update + balance_deduct) execute atomically after final approval
8. `npm run build` passes clean
