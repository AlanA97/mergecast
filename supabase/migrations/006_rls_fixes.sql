-- Migration 006: tighten overly-permissive RLS policies
-- ─────────────────────────────────────────────────────────────────────────────

-- subscribers_public_insert: WITH CHECK (true) allows inserts for any
-- workspace_id, including ones that don't exist. Restrict to rows whose
-- workspace_id references a real workspace so phantom subscriptions can't
-- be created via direct DB access.
DROP POLICY IF EXISTS "subscribers_public_insert" ON subscribers;

CREATE POLICY "subscribers_public_insert" ON subscribers
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM workspaces WHERE id = workspace_id)
  );

-- changelog_entries / changelog_settings: both tables were visible in the
-- GraphQL schema to anon users because Supabase's default setup grants SELECT
-- on all public tables to the anon role at the PostgreSQL privilege level.
-- RLS policies alone don't remove GraphQL schema visibility — the underlying
-- privilege must be revoked.
--
-- All public reads (public changelog page, widget, RSS) go through the
-- service-role client which bypasses RLS, so anon never legitimately needs
-- direct SELECT access. Workspace members are covered by their existing
-- member policies.
--
-- Also drop the entries_public_read policy which was dead code that
-- additionally exposed changelog_entries rows to anon via RLS.
DROP POLICY IF EXISTS "entries_public_read" ON changelog_entries;

REVOKE SELECT ON changelog_entries  FROM anon;
REVOKE SELECT ON changelog_settings FROM anon;
REVOKE SELECT ON email_sends        FROM anon;
REVOKE SELECT ON pr_ignore_rules    FROM anon;
REVOKE SELECT ON repos              FROM anon;
REVOKE SELECT ON subscribers        FROM anon;
REVOKE SELECT ON widget_settings    FROM anon;
REVOKE SELECT ON workspace_members  FROM anon;
REVOKE SELECT ON workspaces         FROM anon;

-- changelog_entries: all reads now go through the service-role client with
-- explicit auth/membership checks in application code. Revoking SELECT from
-- authenticated removes the table from the GraphQL schema for signed-in users
-- who aren't workspace members.
REVOKE SELECT ON changelog_entries  FROM authenticated;
REVOKE SELECT ON changelog_settings FROM authenticated;
REVOKE SELECT ON email_sends        FROM authenticated;
REVOKE SELECT ON pr_ignore_rules    FROM authenticated;
REVOKE SELECT ON repos              FROM authenticated;
REVOKE SELECT ON subscribers        FROM authenticated;
REVOKE SELECT ON widget_settings    FROM authenticated;
REVOKE SELECT ON workspace_members  FROM authenticated;
REVOKE SELECT ON workspaces         FROM authenticated;

-- create_workspace_with_defaults is a SECURITY DEFINER function that accepts
-- an arbitrary p_user_id, so anon or authenticated callers could create
-- workspaces on behalf of any user ID. The app always invokes it via the
-- service-role client, so restrict EXECUTE to the service_role only.
REVOKE EXECUTE ON FUNCTION create_workspace_with_defaults(text, text, uuid) FROM anon, authenticated;

-- increment_entry_views: migration 005 added a two-argument overload
-- (entry_ids, p_workspace_id) via CREATE OR REPLACE, but that only replaces
-- an exact signature match — the original one-argument overload still exists
-- as a separate function and is callable by anon.
--
-- Drop the old one-argument version (unused since 005) and revoke anon EXECUTE
-- on the two-argument version (the public page calls it via service client).
DROP FUNCTION IF EXISTS increment_entry_views(uuid[]);
REVOKE EXECUTE ON FUNCTION increment_entry_views(uuid[], uuid) FROM anon, authenticated;

-- increment_publish_count is only called from the publish route via service
-- client. Revoke from anon and authenticated to prevent REST API abuse.
REVOKE EXECUTE ON FUNCTION increment_publish_count(uuid) FROM anon, authenticated;

-- is_workspace_member is an internal RLS helper, not a public API. It is never
-- called directly from app code. Revoke the REST-callable anon privilege.
REVOKE EXECUTE ON FUNCTION is_workspace_member(uuid) FROM anon, authenticated;

-- workspace_members RLS performance: auth.uid() is re-evaluated per row.
-- Wrap in (SELECT auth.uid()) so Postgres evaluates it once per statement.
DROP POLICY IF EXISTS "own_memberships"              ON workspace_members;
DROP POLICY IF EXISTS "workspace_members_self_delete" ON workspace_members;

CREATE POLICY "own_memberships" ON workspace_members
  FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "workspace_members_self_delete" ON workspace_members
  FOR DELETE USING (user_id = (SELECT auth.uid()));
