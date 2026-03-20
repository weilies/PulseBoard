-- Fix: audit trigger fires during cascade delete, trying to INSERT into
-- collection_items_audit with a tenant_id that no longer exists.
-- Audit tables must not have FK constraints — they preserve historical records
-- even after referenced data is deleted. Drop the FK entirely.

alter table public.collection_items_audit
  drop constraint if exists collection_items_audit_tenant_id_fkey;
