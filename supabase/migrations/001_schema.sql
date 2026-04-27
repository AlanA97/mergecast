-- 001_schema.sql
--
-- Complete baseline schema for Mergecast.
-- All tables are created with their final constraints, CHECK rules, and
-- FK delete behaviours already applied — no incremental patches needed.

-- ─────────────────────────────────────────────────────────────────────────────
-- WORKSPACES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE workspaces (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                     TEXT        UNIQUE NOT NULL,
  name                     TEXT        NOT NULL,
  logo_url                 TEXT,
  plan                     TEXT        NOT NULL DEFAULT 'free'
                                         CHECK (plan IN ('free', 'starter', 'growth', 'scale')),
  stripe_customer_id       TEXT        UNIQUE,
  stripe_subscription_id   TEXT        UNIQUE,
  stripe_price_id          TEXT,
  publish_count_this_month INT         NOT NULL DEFAULT 0
                                         CHECK (publish_count_this_month >= 0),
  publish_quota_reset_at   TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month'),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- WORKSPACE MEMBERS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE workspace_members (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT        NOT NULL DEFAULT 'owner'
                             CHECK (role IN ('owner', 'admin', 'member')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- REPOS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE repos (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  github_repo_id         BIGINT      NOT NULL UNIQUE,
  full_name              TEXT        NOT NULL,
  github_installation_id BIGINT      NOT NULL,
  webhook_secret         TEXT        NOT NULL,
  is_active              BOOLEAN     NOT NULL DEFAULT true,
  connected_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- CHANGELOG ENTRIES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE changelog_entries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  repo_id       UUID        REFERENCES repos(id) ON DELETE SET NULL,
  pr_number     INT,
  pr_title      TEXT,
  pr_body       TEXT,
  pr_url        TEXT,
  pr_merged_at  TIMESTAMPTZ,
  pr_author     TEXT,
  ai_draft      TEXT,
  title         TEXT,
  final_content TEXT,
  status        TEXT        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'published', 'archived', 'ignored')),
  view_count    INT         NOT NULL DEFAULT 0,
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- SUBSCRIBERS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE subscribers (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email              TEXT        NOT NULL,
  confirmed          BOOLEAN     NOT NULL DEFAULT false,
  confirmation_token TEXT        UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  unsubscribe_token  TEXT        UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  subscribed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at       TIMESTAMPTZ,
  unsubscribed_at    TIMESTAMPTZ,
  UNIQUE (workspace_id, email)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- EMAIL SENDS
--
-- entry_id is nullable + SET NULL so send audit records survive entry deletion.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE email_sends (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entry_id        UUID        REFERENCES changelog_entries(id) ON DELETE SET NULL,
  resend_batch_id TEXT,
  recipient_count INT         NOT NULL DEFAULT 0,
  status          TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at         TIMESTAMPTZ,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- WIDGET SETTINGS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE widget_settings (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,
  position     TEXT        NOT NULL DEFAULT 'bottom-right',
  theme        TEXT        NOT NULL DEFAULT 'light',
  accent_color TEXT        NOT NULL DEFAULT '#000000'
                             CHECK (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  button_label TEXT        NOT NULL DEFAULT 'What''s new',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- CHANGELOG SETTINGS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE changelog_settings (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,
  custom_domain          TEXT        UNIQUE,
  custom_domain_verified BOOLEAN     NOT NULL DEFAULT false,
  page_title             TEXT,
  page_description       TEXT,
  accent_color           TEXT        NOT NULL DEFAULT '#000000'
                                       CHECK (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  show_powered_by        BOOLEAN     NOT NULL DEFAULT true,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PR IGNORE RULES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE pr_ignore_rules (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  rule_type    TEXT        NOT NULL CHECK (rule_type IN ('title_prefix', 'title_contains', 'label')),
  pattern      TEXT        NOT NULL CHECK (pattern <> ''),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, rule_type, pattern)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

-- workspace_members: queried on every auth check and workspace list load
CREATE INDEX idx_workspace_members_workspace_id ON workspace_members (workspace_id);
CREATE INDEX idx_workspace_members_user_id      ON workspace_members (user_id);

-- repos: looked up by workspace on limit checks; by github_repo_id on webhooks
-- (github_repo_id already has an implicit index from the UNIQUE constraint)
CREATE INDEX idx_repos_workspace_id ON repos (workspace_id);

-- changelog_entries: composite for the common dashboard list query
CREATE INDEX idx_entries_workspace_status ON changelog_entries (workspace_id, status);

-- changelog_entries: partial composite for public changelog page
CREATE INDEX idx_entries_workspace_published
  ON changelog_entries (workspace_id, published_at DESC)
  WHERE status = 'published';

-- changelog_entries: unique partial to enforce one entry per PR per repo,
-- while excluding manually created entries (pr_number IS NULL)
CREATE UNIQUE INDEX idx_entries_repo_pr_unique
  ON changelog_entries (repo_id, pr_number)
  WHERE pr_number IS NOT NULL;

-- subscribers: full-table scanned on every publish email send
CREATE INDEX idx_subscribers_workspace_id ON subscribers (workspace_id);

-- subscribers: partial index for the active-subscriber email query
CREATE INDEX idx_subscribers_active
  ON subscribers (workspace_id)
  WHERE confirmed = true AND unsubscribed_at IS NULL;

-- email_sends: FK support + status queries per workspace
CREATE INDEX idx_email_sends_workspace_id ON email_sends (workspace_id);
CREATE INDEX idx_email_sends_entry_id     ON email_sends (entry_id);

-- pr_ignore_rules: looked up by workspace_id on every incoming webhook
CREATE INDEX idx_pr_ignore_rules_workspace ON pr_ignore_rules (workspace_id);
