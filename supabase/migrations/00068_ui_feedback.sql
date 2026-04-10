-- Migration: 00068_ui_feedback.sql
-- UI Feedback Loop — annotation tables + feedback_mode tenant flag

-- 1. Add feedback_mode flag to tenants
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS feedback_mode boolean NOT NULL DEFAULT false;

-- 2. Feedback sessions
CREATE TABLE IF NOT EXISTS ui_feedback_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title        text NOT NULL DEFAULT 'Untitled Session',
  status       text NOT NULL DEFAULT 'open',   -- open | completed
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

-- 3. Feedback items (individual annotations)
CREATE TABLE IF NOT EXISTS ui_feedback_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES ui_feedback_sessions(id) ON DELETE CASCADE,
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  page          text NOT NULL,
  element_text  text,
  css_classes   text,
  parent_chain  text,
  outer_html    text,
  comment       text NOT NULL,
  annotated_at  timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS ui_feedback_sessions_tenant_idx ON ui_feedback_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS ui_feedback_items_session_idx ON ui_feedback_items(session_id);
CREATE INDEX IF NOT EXISTS ui_feedback_items_tenant_idx ON ui_feedback_items(tenant_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE ui_feedback_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ui_feedback_items ENABLE ROW LEVEL SECURITY;

-- Sessions: scoped to current tenant
CREATE POLICY "ui_feedback_sessions_tenant_read"
  ON ui_feedback_sessions FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "ui_feedback_sessions_tenant_write"
  ON ui_feedback_sessions FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

-- Items: scoped to current tenant
CREATE POLICY "ui_feedback_items_tenant_read"
  ON ui_feedback_items FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "ui_feedback_items_tenant_write"
  ON ui_feedback_items FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

-- Service role: full access (used by public API endpoint)
CREATE POLICY "ui_feedback_sessions_service_role"
  ON ui_feedback_sessions FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "ui_feedback_items_service_role"
  ON ui_feedback_items FOR SELECT
  TO service_role
  USING (true);

-- updated_at trigger for sessions
CREATE OR REPLACE FUNCTION update_ui_feedback_sessions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER ui_feedback_sessions_updated_at
  BEFORE UPDATE ON ui_feedback_sessions
  FOR EACH ROW EXECUTE FUNCTION update_ui_feedback_sessions_updated_at();
