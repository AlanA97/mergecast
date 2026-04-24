-- Fix SECURITY DEFINER functions missing pinned search_path
-- (Supabase security advisory: function_search_path_mutable)

CREATE OR REPLACE FUNCTION is_workspace_member(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION increment_entry_views(entry_ids UUID[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE changelog_entries
  SET view_count = view_count + 1
  WHERE id = ANY(entry_ids);
$$;

-- Add dedicated index for workspace_id lookups on pr_ignore_rules
-- (the UNIQUE index on (workspace_id, rule_type, pattern) is not an efficient substitute
--  for prefix-only workspace_id queries in the webhook handler)
CREATE INDEX idx_pr_ignore_rules_workspace ON pr_ignore_rules(workspace_id);

-- Prevent empty-string patterns (a rule with pattern='' would match every PR title)
ALTER TABLE pr_ignore_rules ADD CONSTRAINT pr_ignore_rules_pattern_nonempty
  CHECK (pattern <> '');
