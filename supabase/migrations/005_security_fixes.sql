-- 005_security_fixes.sql
--
-- Security hardening:
--   1. Scope increment_entry_views to a specific workspace so the
--      SECURITY DEFINER function cannot increment view_count for entries
--      belonging to other workspaces.
--   2. Add confirmation_token_expires_at to subscribers so stale
--      confirmation links can be rejected after 72 hours.

-- ── 1. increment_entry_views — scoped to workspace ───────────────────────────

CREATE OR REPLACE FUNCTION increment_entry_views(entry_ids UUID[], p_workspace_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE changelog_entries
  SET    view_count = view_count + 1
  WHERE  id = ANY(entry_ids)
  AND    workspace_id = p_workspace_id;
$$;

-- ── 2. Confirmation token expiry ─────────────────────────────────────────────

ALTER TABLE subscribers
  ADD COLUMN IF NOT EXISTS confirmation_token_expires_at TIMESTAMPTZ;

-- Back-fill existing unconfirmed rows with a far-future expiry so they
-- don't break immediately (they were sent before expiry existed).
UPDATE subscribers
SET    confirmation_token_expires_at = now() + INTERVAL '72 hours'
WHERE  confirmed = false
AND    confirmation_token IS NOT NULL
AND    confirmation_token_expires_at IS NULL;
