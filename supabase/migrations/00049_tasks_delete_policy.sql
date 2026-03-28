-- supabase/migrations/00049_tasks_delete_policy.sql
-- Explicitly block client-side deletes on tasks.
-- Service-role (used by API routes) bypasses RLS and can delete if needed.
CREATE POLICY "tasks_delete" ON public.tasks
  FOR DELETE USING (false);
