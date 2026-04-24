-- 005_security_and_idempotency.sql

-- 1. Lock down workspace_members mutations.
--    INSERT/UPDATE/DELETE are done exclusively via service role (bypasses RLS),
--    so denying them via client key prevents a member from adding themselves to
--    foreign workspaces.
CREATE POLICY "workspace_members_no_insert" ON workspace_members
  FOR INSERT WITH CHECK (false);

CREATE POLICY "workspace_members_no_update" ON workspace_members
  FOR UPDATE USING (false);

-- Members can leave their own workspace (self-delete only).
CREATE POLICY "workspace_members_self_delete" ON workspace_members
  FOR DELETE USING (user_id = auth.uid());

-- 2. Unique constraint on (repo_id, pr_number) so that even if two webhook
--    deliveries race past the idempotency SELECT, only one INSERT wins.
--    Partial index excludes manually created entries (pr_number IS NULL).
CREATE UNIQUE INDEX idx_entries_repo_pr_unique
  ON changelog_entries (repo_id, pr_number)
  WHERE pr_number IS NOT NULL;

-- 3. Replace the partial index on published_at with a composite that includes
--    status, giving the query planner a single index for the common filter
--    (workspace_id, status = 'published', ORDER BY published_at DESC).
DROP INDEX IF EXISTS idx_entries_published_at;
CREATE INDEX idx_entries_workspace_published
  ON changelog_entries (workspace_id, published_at DESC)
  WHERE status = 'published';
