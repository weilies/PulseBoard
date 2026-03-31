# PulseBox Roadmap

> Items here are validated product ideas but **not currently scheduled**.
> Review periodically — promote to [TASKS.md](TASKS.md) when ready to implement.

---

## Pending (No Date)

### Country-Specific Fields (System Collections)
**Priority:** High
**Complexity:** Medium
**Summary:**
Extend system collection schema to support country-specific field visibility and validation.
- Add `enabled_for_countries: string[]` metadata to field definitions
- Filter fields in API responses based on `record.country` match
- Enforce `required` validation only for applicable countries
- Multi-country support: fields can apply to multiple countries (e.g., tax ID for US, CA, MX)

**Deferred because:** Waiting for quota reset (Friday).

---

### Tenant-Specific Fields via Child Collections
**Priority:** High
**Complexity:** Medium
**Summary:**
Allow tenants to extend core collections with custom fields without polluting system schema.
- Create tenant-owned child collections with 1:1 link to parent (e.g., EmployeeExtended → Employees)
- Each tenant maintains their own in-schema (e.g., Acme's `is_smoker` field isolated to Acme tenant)
- Add cascade delete when parent record is deleted
- Tenant admins can add fields via studio without schema migration

**Deferred because:** Waiting for quota reset (Friday).

---

### Rules & Workflow Engine (Synchronous Mode)
**Priority:** High
**Complexity:** High
**Summary:**
Implement synchronous rule execution on CREATE/UPDATE operations for validation and approval triggers.
- Rules evaluate on record save
- Support conditional approval workflows (e.g., "salary > $500k requires manager approval")
- Block save if rule validation fails
- Create approval tasks and audit trail

**Dependencies:** Country-specific fields + child collections (foundation for rule conditions).
**Deferred because:** Waiting for quota reset (Friday); merged with approval workflow phase.

---

### RBAC: Collection Item-Level Permissions
**Priority:** Critical
**Complexity:** High
**Summary:**
Implement fine-grained RBAC for items within a collection (e.g., HR Manager can only access Employees where department="IT" AND grade<5).
- Reuse existing `roles` table; add `collection_role_policies` table
- Policies define: role + collection + allowed actions + attribute-based conditions (JSONB)
- ALLOW (whitelist) logic: if policy exists, apply restrictions; if not, default to allow-all (backward compat)
- Support dynamic conditions (e.g., user.department = record.department)
- Optional field masking (hide SSN from certain roles)
- Mandatory audit trail: log policy changes + all access attempts (allowed/denied)
- UI: Tenant admins configure policies in Studio (Collection → Permissions Tab)

**Data model:**
```sql
collection_role_policies (
  id, tenant_id, collection_id, role_id, policy_name,
  actions text[], conditions JSONB, visible_fields text[]
)

rbac_audit_log (
  id, tenant_id, timestamp, event_type, user_id,
  collection_id, role_id, policy_id, accessed_item_id, action,
  was_allowed boolean, details JSONB
)
```

**Deferred because:** Waiting for quota reset (Friday); high token cost; critical after rules engine.

---

### Full UI Internationalisation (i18n)
**Priority:** Low
**Complexity:** Very High
**Summary:**
All static UI text (navigation labels, page titles, button text, form labels, error messages, widgets) must support EN, JP (日本語), CN (简体中文).
**Scope:**
- Install and configure `next-intl` (or equivalent) with message files per locale
- Translate all static strings across sidebar, header, dashboard, studio, security pages
- Support collection name translations (partially done in `metadata.name_translations`)
- Support field label translations (partially done in `options.labels`)
- Grid column headers, empty states, action menus, dialog titles
- Slug values remain English (API-safe)
- Note: Dynamic content (collection item data) already has per-locale translation support via `collection_item_translations` table

**Deferred because:** Very large surface area. Low ROI until platform goes multi-region or multi-language clients are onboarded.

---

### Studio Phase 10: Kanban + Saved Views
**Priority:** Low
**Complexity:** High
**Summary:** Allow users to save filter/sort/column configurations as named views and optionally display a Kanban board layout for collections with a select/status field.
**Deferred because:** Core CRUD is stable. Views are a UX enhancement for power users.

---

## Decisions Pending

_(Items that need product discussion before scheduling)_

None currently.
