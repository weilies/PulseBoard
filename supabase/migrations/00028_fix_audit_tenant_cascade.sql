-- Fix: collection_items_audit.tenant_id FK was missing ON DELETE CASCADE.
-- When a tenant is deleted, audit rows were blocking the delete.
-- All other tenant-scoped tables already have ON DELETE CASCADE.

alter table public.collection_items_audit
  drop constraint if exists collection_items_audit_tenant_id_fkey;

alter table public.collection_items_audit
  add constraint collection_items_audit_tenant_id_fkey
  foreign key (tenant_id)
  references public.tenants(id)
  on delete cascade;
