-- 003_rls.sql
--
-- Row Level Security: enable RLS on every table, then define all policies.
-- Service-role connections bypass RLS entirely, so these rules only apply
-- to requests made through the anon / authenticated Supabase client keys.

-- ─────────────────────────────────────────────────────────────────────────────
-- Enable RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE workspaces        ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE repos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE changelog_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscribers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sends       ENABLE ROW LEVEL SECURITY;
ALTER TABLE widget_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE changelog_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pr_ignore_rules   ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- WORKSPACES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "workspace_member_read" ON workspaces
  FOR SELECT USING (is_workspace_member(id));

CREATE POLICY "workspace_member_update" ON workspaces
  FOR UPDATE USING (is_workspace_member(id));

-- ─────────────────────────────────────────────────────────────────────────────
-- WORKSPACE MEMBERS
--
-- Mutations (INSERT/UPDATE) are done exclusively via the service role so a
-- member cannot add themselves to foreign workspaces through the client key.
-- Members can read their own memberships and remove themselves (leave).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "own_memberships" ON workspace_members
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "workspace_members_no_insert" ON workspace_members
  FOR INSERT WITH CHECK (false);

CREATE POLICY "workspace_members_no_update" ON workspace_members
  FOR UPDATE USING (false);

CREATE POLICY "workspace_members_self_delete" ON workspace_members
  FOR DELETE USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- REPOS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "repos_member_all" ON repos
  FOR ALL USING (is_workspace_member(workspace_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- CHANGELOG ENTRIES
--
-- Workspace members can do everything; the public can read published entries
-- (used by the public changelog page and embeddable widget).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "entries_member_all" ON changelog_entries
  FOR ALL USING (is_workspace_member(workspace_id));

CREATE POLICY "entries_public_read" ON changelog_entries
  FOR SELECT USING (status = 'published');

-- ─────────────────────────────────────────────────────────────────────────────
-- SUBSCRIBERS
--
-- Members can read and delete subscribers; anyone can subscribe (public INSERT).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "subscribers_member_read" ON subscribers
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY "subscribers_public_insert" ON subscribers
  FOR INSERT WITH CHECK (true);

CREATE POLICY "subscribers_member_delete" ON subscribers
  FOR DELETE USING (is_workspace_member(workspace_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- EMAIL SENDS / WIDGET SETTINGS / CHANGELOG SETTINGS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "email_sends_member" ON email_sends
  FOR ALL USING (is_workspace_member(workspace_id));

CREATE POLICY "widget_settings_member" ON widget_settings
  FOR ALL USING (is_workspace_member(workspace_id));

CREATE POLICY "changelog_settings_member" ON changelog_settings
  FOR ALL USING (is_workspace_member(workspace_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- PR IGNORE RULES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "ignore_rules_member_all" ON pr_ignore_rules
  FOR ALL
  USING     (is_workspace_member(workspace_id))
  WITH CHECK (is_workspace_member(workspace_id));
