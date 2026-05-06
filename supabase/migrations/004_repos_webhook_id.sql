-- Add webhook_id so we can delete the GitHub webhook when disconnecting a repo.
ALTER TABLE repos ADD COLUMN IF NOT EXISTS webhook_id BIGINT;
