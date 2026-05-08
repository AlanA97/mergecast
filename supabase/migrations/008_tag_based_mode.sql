-- Migration 008: tag-based changelog mode
--
-- Adds a per-repo toggle so teams can opt into one changelog entry per Git tag
-- instead of one per merged PR.  When tag_based_mode = true on a repo:
--   • pull_request webhooks are silently skipped (no entry created per PR)
--   • create webhooks (ref_type = 'tag') aggregate all PRs since the previous
--     tag into a single changelog_entries row.

ALTER TABLE repos ADD COLUMN IF NOT EXISTS tag_based_mode BOOLEAN NOT NULL DEFAULT false;

-- Tag entries have pr_number = NULL and tag_name = the pushed tag ref.
ALTER TABLE changelog_entries ADD COLUMN IF NOT EXISTS tag_name TEXT;

-- Idempotency guard: one entry per tag per repo (mirrors the existing PR uniqueness index).
CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_repo_tag_unique
  ON changelog_entries (repo_id, tag_name)
  WHERE tag_name IS NOT NULL;
