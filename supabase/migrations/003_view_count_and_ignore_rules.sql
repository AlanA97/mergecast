-- Add view tracking to changelog entries
ALTER TABLE changelog_entries ADD COLUMN view_count INT NOT NULL DEFAULT 0;

-- Bulk-increment helper (called fire-and-forget from SSR pages)
CREATE OR REPLACE FUNCTION increment_entry_views(entry_ids UUID[])
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE changelog_entries
  SET view_count = view_count + 1
  WHERE id = ANY(entry_ids);
$$;

-- PR noise filter rules (per workspace)
CREATE TABLE pr_ignore_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  rule_type     TEXT NOT NULL CHECK (rule_type IN ('title_prefix', 'title_contains', 'label')),
  pattern       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, rule_type, pattern)
);

ALTER TABLE pr_ignore_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members can manage ignore rules"
  ON pr_ignore_rules
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ))
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));
