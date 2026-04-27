-- 007_create_workspace_transaction.sql
--
-- Wraps workspace creation (workspace + member + settings + ignore rules)
-- in a single transaction so a mid-flight failure cannot leave an orphaned
-- workspace without its required child rows.

CREATE OR REPLACE FUNCTION create_workspace_with_defaults(
  p_name    text,
  p_slug    text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace workspaces;
BEGIN
  INSERT INTO workspaces (name, slug)
  VALUES (p_name, p_slug)
  RETURNING * INTO v_workspace;

  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace.id, p_user_id, 'owner');

  INSERT INTO widget_settings    (workspace_id) VALUES (v_workspace.id);
  INSERT INTO changelog_settings (workspace_id) VALUES (v_workspace.id);

  INSERT INTO pr_ignore_rules (workspace_id, rule_type, pattern) VALUES
    (v_workspace.id, 'title_prefix',   'chore:'),
    (v_workspace.id, 'title_prefix',   'docs:'),
    (v_workspace.id, 'title_prefix',   'ci:'),
    (v_workspace.id, 'title_prefix',   'test:'),
    (v_workspace.id, 'title_contains', 'bump deps'),
    (v_workspace.id, 'title_contains', 'dependabot');

  RETURN row_to_json(v_workspace)::jsonb;
END;
$$;
