-- Migration 007: revoke EXECUTE on internal functions from PUBLIC
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Migration 006 revoked EXECUTE from the anon and authenticated roles
-- explicitly, but PostgreSQL grants EXECUTE to PUBLIC by default when a
-- function is created. The anon and authenticated roles inherit from PUBLIC,
-- so they could still call these functions via /rest/v1/rpc/.
--
-- Revoking from PUBLIC removes the privilege for all roles (including anon
-- and authenticated). The service_role is a superuser-equivalent and bypasses
-- privilege checks entirely, so it continues to work without an explicit grant.

REVOKE EXECUTE ON FUNCTION create_workspace_with_defaults(text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION increment_entry_views(uuid[], uuid)               FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION increment_publish_count(uuid)                     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION is_workspace_member(uuid)                         FROM PUBLIC;
