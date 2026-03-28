-- supabase/migrations/00048_tasks.sql

CREATE TABLE public.tasks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id      UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  type         TEXT        NOT NULL CHECK (type IN ('notification','approval','reminder','alert')),
  title        TEXT        NOT NULL,
  body         TEXT,
  action_url   TEXT,
  action_label TEXT,
  status       TEXT        NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read','done')),
  priority     TEXT        NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  source       TEXT        CHECK (source IN ('system','rule','workflow','manual')),
  source_id    UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at      TIMESTAMPTZ
);

-- Performance indexes
CREATE INDEX idx_tasks_tenant_user_status ON public.tasks (tenant_id, user_id, status);
CREATE INDEX idx_tasks_tenant_created     ON public.tasks (tenant_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- SELECT: own tasks + broadcast (user_id IS NULL), scoped to user's tenants
CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND is_active = true
    )
    AND (user_id = auth.uid() OR user_id IS NULL)
  );

-- INSERT: blocked for regular auth users (service role bypasses RLS)
CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT WITH CHECK (false);

-- UPDATE: user can update their own tasks only
CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE USING (
    user_id = auth.uid()
    AND tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );
