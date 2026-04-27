-- 008_missing_fk_indexes.sql
--
-- Add indexes on high-frequency FK lookup columns that were missing.
-- workspace_members is queried on every authenticated API request;
-- repos and subscribers are hit on every webhook and email send.

-- workspace_members: looked up by workspace_id on every auth check,
-- and by user_id when loading the workspace list.
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id
  ON workspace_members (workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id
  ON workspace_members (user_id);

-- repos: looked up by workspace_id when checking repo limits and by
-- github_repo_id on every incoming GitHub webhook.
CREATE INDEX IF NOT EXISTS idx_repos_workspace_id
  ON repos (workspace_id);

CREATE INDEX IF NOT EXISTS idx_repos_github_repo_id
  ON repos (github_repo_id);

-- subscribers: full-table scanned on every publish email send and
-- subscriber-count quota check.
CREATE INDEX IF NOT EXISTS idx_subscribers_workspace_id
  ON subscribers (workspace_id);

-- email_sends: looked up when recording send status per workspace.
CREATE INDEX IF NOT EXISTS idx_email_sends_workspace_id
  ON email_sends (workspace_id);
