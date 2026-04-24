-- Enable RLS on all tables
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE repos ENABLE ROW LEVEL SECURITY;
ALTER TABLE changelog_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE widget_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE changelog_settings ENABLE ROW LEVEL SECURITY;

-- Helper: is current user a member of this workspace?
CREATE OR REPLACE FUNCTION is_workspace_member(ws_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- WORKSPACES
CREATE POLICY "workspace_member_read" ON workspaces
  FOR SELECT USING (is_workspace_member(id));
CREATE POLICY "workspace_member_update" ON workspaces
  FOR UPDATE USING (is_workspace_member(id));

-- WORKSPACE_MEMBERS
CREATE POLICY "own_memberships" ON workspace_members
  FOR SELECT USING (user_id = auth.uid());

-- REPOS
CREATE POLICY "repos_member_all" ON repos
  FOR ALL USING (is_workspace_member(workspace_id));

-- CHANGELOG_ENTRIES: members can do all; public can read published
CREATE POLICY "entries_member_all" ON changelog_entries
  FOR ALL USING (is_workspace_member(workspace_id));
CREATE POLICY "entries_public_read" ON changelog_entries
  FOR SELECT USING (status = 'published');

-- SUBSCRIBERS
CREATE POLICY "subscribers_member_read" ON subscribers
  FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "subscribers_public_insert" ON subscribers
  FOR INSERT WITH CHECK (true);
CREATE POLICY "subscribers_member_delete" ON subscribers
  FOR DELETE USING (is_workspace_member(workspace_id));

-- EMAIL_SENDS, WIDGET_SETTINGS, CHANGELOG_SETTINGS
CREATE POLICY "email_sends_member" ON email_sends
  FOR ALL USING (is_workspace_member(workspace_id));
CREATE POLICY "widget_settings_member" ON widget_settings
  FOR ALL USING (is_workspace_member(workspace_id));
CREATE POLICY "changelog_settings_member" ON changelog_settings
  FOR ALL USING (is_workspace_member(workspace_id));
