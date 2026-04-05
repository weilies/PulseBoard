-- Migration 00063: Policy permissions cleanup + conditions
-- 1. Add conditions JSONB to policy_permissions (for unified item-level RBAC)
-- 2. Rename manage_schema → model in existing policy_permissions.permissions JSON data
-- 3. Drop collection_rules table (Rules tab dropped)

-- 1. conditions column on policy_permissions
ALTER TABLE policy_permissions
  ADD COLUMN IF NOT EXISTS conditions JSONB DEFAULT '[]'::jsonb;

-- 2. Rename manage_schema key in existing rows
UPDATE policy_permissions
SET permissions = (permissions - 'manage_schema') || jsonb_build_object('model', (permissions->'manage_schema'))
WHERE permissions ? 'manage_schema';

-- 3. Drop collection_rules and related API objects
DROP TABLE IF EXISTS collection_rules CASCADE;
