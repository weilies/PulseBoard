#!/bin/bash
# Create GitHub issues from PulseBox roadmap
# Run this when you're ready: bash scripts/create-issues.sh

set -e  # Exit on error

echo "Creating PulseBox GitHub issues..."

# Issue 1: Master-Detail Relations
gh issue create \
  --title "Studio Phase: Master-Detail Collection Relations (3-level nested UI)" \
  --body "Implement parent-child collection modeling with 3-level nested UI.

## Status
In Progress — Phase 3 (grandchild grid) still WIP

## Phases
- [x] Phase 1: Schema foundation (metadata column, relationship_style, API params)
- [x] Phase 2: Item detail page + child tabs (Level 1 → Level 2)
- [ ] Phase 3: Grandchild grid (Level 3) + schema builder updates
- [ ] Phase 4: API extensions + performance optimization

## Reference
See: docs/RELATIONS_PLAN.md" \
  --label "studio"

# Issue 2: Country-Specific Fields
gh issue create \
  --title "Feature: Country-Specific Fields (System Collections)" \
  --body "Extend system collection schema to support country-specific field visibility and validation.

## What
- Add \`enabled_for_countries: string[]\` metadata to field definitions
- Filter fields in API responses based on \`record.country\` match
- Enforce \`required\` validation only for applicable countries
- Support multi-country fields (e.g., tax ID for US, CA, MX)

## Why
Platform scales across regions; some fields (SSN, EPF) are country-specific. Avoid polluting UI with irrelevant fields." \
  --label "enhancement" \
  --label "collection"

# Issue 3: Rules & Workflow Engine
gh issue create \
  --title "Feature: Rules & Workflow Engine (Synchronous Mode)" \
  --body "Implement synchronous rule execution on CREATE/UPDATE operations for validation and approval triggers.

## What
- Rules evaluate on record save
- Support conditional approval workflows (e.g., 'salary > \$500k requires manager approval')
- Block save if rule validation fails
- Create approval tasks and audit trail

## Why
Business logic without code. Powers approval chains, validation rules, state transitions.

## Dependencies
- Country-specific fields (foundation for rule conditions)
- Child collections (for extended attributes in rules)" \
  --label "enhancement" \
  --label "collection"

# Issue 4: RBAC Item-Level Permissions
gh issue create \
  --title "Feature: RBAC Collection Item-Level Permissions (CRITICAL)" \
  --body "Implement fine-grained RBAC for items within a collection (e.g., HR Manager can only access Employees where department='IT' AND grade<5).

## What
- Reuse existing \`roles\` table; add \`collection_role_policies\` table
- Policies define: role + collection + allowed actions + attribute-based conditions (JSONB)
- ALLOW (whitelist) logic: if policy exists, apply restrictions; if not, default to allow-all (backward compat)
- Support dynamic conditions (e.g., \`user.department = record.department\`)
- Optional field masking (hide SSN from certain roles)
- Mandatory audit trail: log policy changes + access attempts (allowed/denied)
- UI: Tenant admins configure policies in Studio (Collection → Permissions Tab)

## Data Model
\`\`\`sql
collection_role_policies (
  id, tenant_id, collection_id, role_id, policy_name,
  actions text[], conditions JSONB, visible_fields text[]
)

rbac_audit_log (
  id, tenant_id, timestamp, event_type, user_id,
  collection_id, role_id, policy_id, accessed_item_id, action,
  was_allowed boolean, details JSONB
)
\`\`\`

## Scope
- User auth: Full RBAC + audit trail (applies)
- App auth (API keys): No RBAC yet (deferred to marketplace phase)" \
  --label "enhancement" \
  --label "auth/security"

echo "✅ All 4 issues created!"
