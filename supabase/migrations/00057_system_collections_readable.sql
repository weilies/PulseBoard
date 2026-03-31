-- =============================================================================
-- 00057_system_collections_readable.sql
-- System collections (type = 'system') are global schema shared across all
-- tenants. Their metadata (id, name, type, slug, etc.) should always be
-- readable by any authenticated user — actual data access is governed
-- separately by collection_items RLS.
-- =============================================================================

drop policy if exists "collections_select" on public.collections;
create policy "collections_select" on public.collections
  for select using (
    type = 'system'                                                         -- system collection metadata always visible
    or public.is_super_admin()                                              -- super admin sees everything
    or id in (select public.get_accessible_collection_ids('read'))          -- permission-gated tenant collections
  );
