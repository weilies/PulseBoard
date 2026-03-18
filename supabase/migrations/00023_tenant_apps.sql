-- =============================================================================
-- 00023_tenant_apps.sql — API App Credentials per Tenant
-- =============================================================================
-- Each tenant can create "apps" (API clients) with a rotatable app_id + hashed
-- app_secret. Used for server-to-server integrations — avoids exposing tenant_id.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tenant_apps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  app_name    text NOT NULL,
  app_id      text NOT NULL UNIQUE,            -- public identifier, e.g. "pb_app_a1b2c3d4"
  app_secret_hash text NOT NULL,               -- bcrypt / sha256 hash of secret
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at  timestamptz                      -- optional expiry
);

-- Index for fast lookup by app_id (used on every API token exchange)
CREATE UNIQUE INDEX IF NOT EXISTS tenant_apps_app_id_idx ON tenant_apps(app_id);
CREATE INDEX IF NOT EXISTS tenant_apps_tenant_id_idx ON tenant_apps(tenant_id);

-- ---------------------------------------------------------------------------
-- 2. RLS Policies
-- ---------------------------------------------------------------------------

ALTER TABLE tenant_apps ENABLE ROW LEVEL SECURITY;

-- tenant_admin+ can view apps in their tenant
CREATE POLICY tenant_apps_select ON tenant_apps FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM tenant_users tu
    WHERE tu.user_id = auth.uid()
      AND tu.tenant_id = tenant_apps.tenant_id
      AND tu.is_active = true
      AND tu.role IN ('super_admin', 'tenant_admin')
  )
);

-- tenant_admin+ can create apps in their tenant
CREATE POLICY tenant_apps_insert ON tenant_apps FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM tenant_users tu
    WHERE tu.user_id = auth.uid()
      AND tu.tenant_id = tenant_apps.tenant_id
      AND tu.is_active = true
      AND tu.role IN ('super_admin', 'tenant_admin')
  )
);

-- tenant_admin+ can update apps in their tenant
CREATE POLICY tenant_apps_update ON tenant_apps FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM tenant_users tu
    WHERE tu.user_id = auth.uid()
      AND tu.tenant_id = tenant_apps.tenant_id
      AND tu.is_active = true
      AND tu.role IN ('super_admin', 'tenant_admin')
  )
);

-- tenant_admin+ can delete apps in their tenant
CREATE POLICY tenant_apps_delete ON tenant_apps FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM tenant_users tu
    WHERE tu.user_id = auth.uid()
      AND tu.tenant_id = tenant_apps.tenant_id
      AND tu.is_active = true
      AND tu.role IN ('super_admin', 'tenant_admin')
  )
);

-- ---------------------------------------------------------------------------
-- 3. Seed "apps" page permission into existing RBAC policies
-- ---------------------------------------------------------------------------
-- Add 'apps' page access to Tenant Management policy (tenant_admin+)
-- and Full Access policy (super_admin) for every tenant.

DO $$
DECLARE
  r RECORD;
BEGIN
  -- Tenant Management policies (tenant_admin)
  FOR r IN
    SELECT id FROM policies WHERE name = 'Tenant Management'
  LOOP
    INSERT INTO policy_permissions (policy_id, resource_type, resource_id, permissions)
    VALUES (r.id, 'page', 'apps', '{"access": true}')
    ON CONFLICT (policy_id, resource_type, resource_id) DO NOTHING;
  END LOOP;

  -- Full Access policies (super_admin)
  FOR r IN
    SELECT id FROM policies WHERE name = 'Full Access'
  LOOP
    INSERT INTO policy_permissions (policy_id, resource_type, resource_id, permissions)
    VALUES (r.id, 'page', 'apps', '{"access": true}')
    ON CONFLICT (policy_id, resource_type, resource_id) DO NOTHING;
  END LOOP;

  -- Seed nav_items for all tenants
  FOR r IN
    SELECT id FROM tenants
  LOOP
    INSERT INTO nav_items (tenant_id, resource_type, resource_id, sort_order)
    VALUES (r.id, 'page', 'apps', 6)
    ON CONFLICT (tenant_id, resource_type, resource_id) DO NOTHING;
  END LOOP;
END;
$$;
