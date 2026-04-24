-- WORKSPACES
CREATE TABLE workspaces (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                      TEXT UNIQUE NOT NULL,
  name                      TEXT NOT NULL,
  logo_url                  TEXT,
  plan                      TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id        TEXT UNIQUE,
  stripe_subscription_id    TEXT UNIQUE,
  stripe_price_id           TEXT,
  publish_count_this_month  INT NOT NULL DEFAULT 0,
  publish_quota_reset_at    TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month'),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- WORKSPACE MEMBERS
CREATE TABLE workspace_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'owner',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

-- REPOS
CREATE TABLE repos (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  github_repo_id          BIGINT NOT NULL UNIQUE,
  full_name               TEXT NOT NULL,
  github_installation_id  BIGINT NOT NULL,
  webhook_secret          TEXT NOT NULL,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  connected_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CHANGELOG ENTRIES
CREATE TABLE changelog_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  repo_id       UUID REFERENCES repos(id) ON DELETE SET NULL,
  pr_number     INT,
  pr_title      TEXT,
  pr_body       TEXT,
  pr_url        TEXT,
  pr_merged_at  TIMESTAMPTZ,
  pr_author     TEXT,
  ai_draft      TEXT,
  title         TEXT,
  final_content TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_entries_workspace_status ON changelog_entries(workspace_id, status);
CREATE INDEX idx_entries_published_at ON changelog_entries(workspace_id, published_at DESC)
  WHERE status = 'published';

-- SUBSCRIBERS
CREATE TABLE subscribers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email                 TEXT NOT NULL,
  confirmed             BOOLEAN NOT NULL DEFAULT false,
  confirmation_token    TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  unsubscribe_token     TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  subscribed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at          TIMESTAMPTZ,
  unsubscribed_at       TIMESTAMPTZ,
  UNIQUE (workspace_id, email)
);

-- EMAIL SENDS
CREATE TABLE email_sends (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entry_id         UUID NOT NULL REFERENCES changelog_entries(id) ON DELETE CASCADE,
  resend_batch_id  TEXT,
  recipient_count  INT NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pending',
  sent_at          TIMESTAMPTZ,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- WIDGET SETTINGS
CREATE TABLE widget_settings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,
  position      TEXT NOT NULL DEFAULT 'bottom-right',
  theme         TEXT NOT NULL DEFAULT 'light',
  accent_color  TEXT NOT NULL DEFAULT '#000000',
  button_label  TEXT NOT NULL DEFAULT 'What''s new',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CHANGELOG SETTINGS
CREATE TABLE changelog_settings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,
  custom_domain           TEXT UNIQUE,
  custom_domain_verified  BOOLEAN NOT NULL DEFAULT false,
  page_title              TEXT,
  page_description        TEXT,
  accent_color            TEXT NOT NULL DEFAULT '#000000',
  show_powered_by         BOOLEAN NOT NULL DEFAULT true,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
