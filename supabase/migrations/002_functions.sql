-- 002_functions.sql
--
-- All SECURITY DEFINER functions and updated_at triggers.
-- Every function pins its search_path to prevent search-path injection
-- (Supabase security advisory: function_search_path_mutable).

-- ─────────────────────────────────────────────────────────────────────────────
-- is_workspace_member
--
-- Returns true when auth.uid() is a member of the given workspace.
-- Marked STABLE so the planner can cache the result within a single
-- statement — important for per-row RLS policy evaluation.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_workspace_member(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE  workspace_id = ws_id
    AND    user_id = auth.uid()
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- increment_entry_views
--
-- Bulk-increment view_count for a set of entries.
-- Called fire-and-forget from SSR pages; no error propagation needed.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_entry_views(entry_ids UUID[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE changelog_entries
  SET    view_count = view_count + 1
  WHERE  id = ANY(entry_ids);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- increment_publish_count
--
-- Atomically increments publish_count_this_month for a workspace so that
-- concurrent publish requests cannot lose each other's increments via a
-- read-modify-write race. Raises an exception when the workspace is not
-- found rather than silently succeeding with zero rows updated.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_publish_count(p_workspace_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows INT;
BEGIN
  UPDATE workspaces
  SET    publish_count_this_month = publish_count_this_month + 1
  WHERE  id = p_workspace_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'increment_publish_count: workspace % not found', p_workspace_id;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- create_workspace_with_defaults
--
-- Creates a workspace together with its required child rows (member, settings,
-- default ignore rules) in a single transaction so a mid-flight failure cannot
-- leave an orphaned workspace.
-- Returns the new workspace row as jsonb.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_workspace_with_defaults(
  p_name    TEXT,
  p_slug    TEXT,
  p_user_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

-- ─────────────────────────────────────────────────────────────────────────────
-- set_updated_at  +  triggers
--
-- Automatically keeps the updated_at column current on every UPDATE so
-- application code never has to remember to set it manually.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_changelog_entries_updated_at
  BEFORE UPDATE ON changelog_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_widget_settings_updated_at
  BEFORE UPDATE ON widget_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_changelog_settings_updated_at
  BEFORE UPDATE ON changelog_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
