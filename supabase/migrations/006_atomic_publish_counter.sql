-- 006_atomic_publish_counter.sql
--
-- Provides an atomic increment for publish_count_this_month so concurrent
-- publish requests cannot lose each other's increments via read-modify-write.
--
-- Security: SECURITY DEFINER + fixed search_path so this runs as the function
-- owner (postgres), not the caller. The caller still needs service-role access
-- since the function is not exposed via RLS.

CREATE OR REPLACE FUNCTION increment_publish_count(p_workspace_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE workspaces
  SET    publish_count_this_month = publish_count_this_month + 1
  WHERE  id = p_workspace_id;
$$;
