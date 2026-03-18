-- Add status column to tenant_users (replaces is_active boolean)
-- Values: 'active', 'inactive', 'suspended'

-- Step 1: Add the new status column
ALTER TABLE tenant_users
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'inactive', 'suspended'));

-- Step 2: Backfill status from existing is_active
UPDATE tenant_users SET status = CASE WHEN is_active THEN 'active' ELSE 'inactive' END;

-- Step 3: Drop all dependent policies, index, then the column

-- Drop index that references is_active
DROP INDEX IF EXISTS idx_tenant_users_user_active;

-- Drop RLS policies on app_logs that reference tenant_users.is_active
DROP POLICY IF EXISTS "Tenant admins can read tenant logs" ON app_logs;

-- Drop RLS policies on tenant_apps that reference tenant_users.is_active
DROP POLICY IF EXISTS tenant_apps_select ON tenant_apps;
DROP POLICY IF EXISTS tenant_apps_insert ON tenant_apps;
DROP POLICY IF EXISTS tenant_apps_update ON tenant_apps;
DROP POLICY IF EXISTS tenant_apps_delete ON tenant_apps;

-- Step 4: Drop is_active and recreate as generated column
ALTER TABLE tenant_users DROP COLUMN is_active;
ALTER TABLE tenant_users
  ADD COLUMN is_active boolean GENERATED ALWAYS AS (status = 'active') STORED;

-- Step 5: Recreate index on the new generated column
CREATE INDEX idx_tenant_users_user_active
  ON tenant_users(user_id, is_active);

-- Step 6: Recreate all dropped policies using status = 'active' instead of is_active = true

CREATE POLICY "Tenant admins can read tenant logs"
  ON public.app_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.tenant_id = app_logs.tenant_id
        AND tu.user_id = auth.uid()
        AND tu.role IN ('super_admin', 'tenant_admin')
        AND tu.status = 'active'
    )
  );

CREATE POLICY tenant_apps_select ON tenant_apps FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM tenant_users tu
    WHERE tu.user_id = auth.uid()
      AND tu.tenant_id = tenant_apps.tenant_id
      AND tu.status = 'active'
      AND tu.role IN ('super_admin', 'tenant_admin')
  )
);

CREATE POLICY tenant_apps_insert ON tenant_apps FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM tenant_users tu
    WHERE tu.user_id = auth.uid()
      AND tu.tenant_id = tenant_apps.tenant_id
      AND tu.status = 'active'
      AND tu.role IN ('super_admin', 'tenant_admin')
  )
);

CREATE POLICY tenant_apps_update ON tenant_apps FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM tenant_users tu
    WHERE tu.user_id = auth.uid()
      AND tu.tenant_id = tenant_apps.tenant_id
      AND tu.status = 'active'
      AND tu.role IN ('super_admin', 'tenant_admin')
  )
);

CREATE POLICY tenant_apps_delete ON tenant_apps FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM tenant_users tu
    WHERE tu.user_id = auth.uid()
      AND tu.tenant_id = tenant_apps.tenant_id
      AND tu.status = 'active'
      AND tu.role IN ('super_admin', 'tenant_admin')
  )
);
