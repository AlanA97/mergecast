-- 009_db_hardening.sql
--
-- Comprehensive hardening pass based on a database engineering review of
-- migrations 001-008. Covers:
--
--   1. CHECK constraints for enum-like TEXT columns
--   2. email_sends.entry_id: ON DELETE CASCADE → SET NULL (preserve audit trail)
--   3. increment_publish_count: raise on zero-row UPDATE, add pg_temp to search_path
--   4. is_workspace_member: add STABLE volatility marker
--   5. Partial index for active subscribers
--   6. Missing FK index on email_sends(entry_id)
--   7. set_updated_at() trigger function + triggers on tables with updated_at
--   8. Non-negative publish_count_this_month constraint
--   9. Backfill pg_temp into migrations 006 & 007 function search paths

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CHECK constraints for enum-like TEXT columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_plan_check
    CHECK (plan IN ('free', 'starter', 'growth', 'scale'));

ALTER TABLE workspace_members
  ADD CONSTRAINT workspace_members_role_check
    CHECK (role IN ('owner', 'admin', 'member'));

ALTER TABLE changelog_entries
  ADD CONSTRAINT changelog_entries_status_check
    CHECK (status IN ('draft', 'published', 'archived', 'ignored'));

ALTER TABLE email_sends
  ADD CONSTRAINT email_sends_status_check
    CHECK (status IN ('pending', 'sent', 'failed'));

-- accent_color must be a 6-digit hex colour (e.g. #1a2b3c)
ALTER TABLE widget_settings
  ADD CONSTRAINT widget_settings_accent_color_check
    CHECK (accent_color ~ '^#[0-9a-fA-F]{6}$');

ALTER TABLE changelog_settings
  ADD CONSTRAINT changelog_settings_accent_color_check
    CHECK (accent_color ~ '^#[0-9a-fA-F]{6}$');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. email_sends.entry_id: CASCADE → SET NULL to preserve the audit trail
--    when a changelog entry is deleted.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE email_sends
  DROP   CONSTRAINT email_sends_entry_id_fkey,
  ADD    CONSTRAINT email_sends_entry_id_fkey
           FOREIGN KEY (entry_id)
           REFERENCES changelog_entries(id)
           ON DELETE SET NULL;

-- entry_id is now nullable (SET NULL requires it)
ALTER TABLE email_sends
  ALTER COLUMN entry_id DROP NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. increment_publish_count: detect zero-row UPDATE and raise an exception.
--    Also adds pg_temp to the search_path (prevents search-path injection).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_publish_count(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows int;
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
-- 4. is_workspace_member: mark STABLE so the planner can cache the result
--    within a single statement (important for per-row RLS checks).
--    Also adds pg_temp to the fixed search_path.
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
-- 5. Partial index for active (confirmed, not unsubscribed) subscribers.
--    Used by the email-send query that filters for deliverable addresses.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_subscribers_active
  ON subscribers(workspace_id)
  WHERE confirmed = true AND unsubscribed_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Missing FK index on email_sends(entry_id)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_email_sends_entry_id
  ON email_sends(entry_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Automatic updated_at maintenance via trigger
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Ensure publish_count_this_month is never negative
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_publish_count_nonneg
    CHECK (publish_count_this_month >= 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Backfill pg_temp into the create_workspace_with_defaults search_path
--    (migration 007 omitted it; we recreate the function here with the fix).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_workspace_with_defaults(
  p_name    text,
  p_slug    text,
  p_user_id uuid
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

  INSERT INTO widget_settings (workspace_id)
  VALUES (v_workspace.id);

  INSERT INTO changelog_settings (workspace_id)
  VALUES (v_workspace.id);

  INSERT INTO pr_ignore_rules (workspace_id, rule_type, pattern)
  VALUES
    (v_workspace.id, 'title_prefix',   'chore:'),
    (v_workspace.id, 'title_prefix',   'docs:'),
    (v_workspace.id, 'title_prefix',   'ci:'),
    (v_workspace.id, 'title_prefix',   'test:'),
    (v_workspace.id, 'title_contains', 'bump deps'),
    (v_workspace.id, 'title_contains', 'dependabot');

  RETURN row_to_json(v_workspace)::jsonb;
END;
$$;
