# Mergecast — Full Product Specification

**Date:** 2026-04-22  
**Status:** Approved — ready for implementation planning  
**Stack:** Next.js 16, Supabase, Stripe, Resend, OpenAI GPT-4o, Tailwind + shadcn/ui, Vercel

---

## Table of Contents

1. [Screens](#screens)
2. [Database Schema](#database-schema)
3. [API Routes](#api-routes)
4. [User Flows](#user-flows)
5. [Payment Logic](#payment-logic)
6. [Edge Cases](#edge-cases)

---

## 1. Screens

### 1.1 Public Screens (unauthenticated)

#### Landing Page `/`
- Hero: headline + subheadline + CTA ("Start free")
- Problem/solution section (manual vs automated)
- Live demo screenshot or animated GIF of the dashboard
- Pricing table (3 paid tiers + free)
- Changelog page example (embed a real Mergecast changelog)
- Footer: links to changelog, pricing, login
- No nav clutter — conversion focused

#### Public Changelog Page `changelog.mergecast.co/[slug]` or custom domain
- Workspace logo + name at top
- List of published entries (newest first)
- Each entry: title, date, markdown body rendered
- Email subscribe form at top (name optional, email required)
- "Powered by Mergecast" badge (hidden on paid plans if toggled)
- RSS feed link
- No auth required

#### Email Confirmation `/confirm-subscription?token=...`
- Confirms subscriber, shows success message
- "You're subscribed to [Workspace Name] updates"
- Link back to changelog

#### Unsubscribe `/unsubscribe?token=...`
- One-click unsubscribe, no login
- Confirms "You've been unsubscribed"
- Option to re-subscribe

---

### 1.2 Auth Screens

#### Sign Up `/signup`
- GitHub OAuth button (primary)
- Email + password fallback (secondary)
- "By signing up you agree to..." ToS/Privacy
- On success: redirect to onboarding

#### Sign In `/login`
- GitHub OAuth button
- Email + password
- "Forgot password" link
- On success: redirect to `/dashboard`

#### Forgot Password `/forgot-password`
- Email input → Supabase sends reset link

---

### 1.3 Onboarding Flow `/onboarding`

Three-step linear wizard. Cannot skip steps. Progress indicator at top.

**Step 1 — Create workspace**
- Input: Workspace name (required)
- Input: Slug (auto-generated from name, editable)
- Slug preview: `changelog.mergecast.co/[slug]`
- Slug uniqueness validated on blur

**Step 2 — Connect GitHub**
- "Install GitHub App" button → opens GitHub App install page in new tab
- On return (GitHub redirects back with `installation_id`): auto-detects install
- Repo selector: list of repos from installation, select one
- "Skip for now" option (can connect later from dashboard)

**Step 3 — Preview your changelog**
- Shows the empty changelog page for their slug
- "Copy widget snippet" button (pre-populated with their workspace ID)
- CTA: "Go to dashboard"

---

### 1.4 Dashboard `/dashboard`

Main authenticated interface. Left sidebar nav.

**Sidebar:**
- Mergecast logo
- Entries (active)
- Subscribers
- Widget
- Settings
- Upgrade badge (if on free)
- Workspace switcher (future — single workspace for MVP)

**Main area — Entries list:**
- Tabs: All | Draft | Published | Archived
- Each entry card:
  - PR title (truncated)
  - Repo name + PR number
  - Status badge (draft/published/archived)
  - Date created
  - "Review" or "View" CTA
- Empty state: "Waiting for your first PR merge. Connect a repo to get started."
- Banner if approaching free tier limit: "X publishes remaining this month"

---

### 1.5 Entry Detail `/dashboard/entries/[id]`

**Left panel (60%):**
- Editable title field (defaults to AI-suggested title)
- Rich text editor (markdown) for final_content — populated from ai_draft on first load
- "Regenerate with AI" button (re-runs OpenAI with same PR data)
- Character/word count

**Right panel (40%):**
- Source PR info: title, number, repo, merge date, link to GitHub PR
- Raw PR description (collapsible)
- AI draft (collapsible, read-only — for reference)
- Status badge

**Bottom action bar:**
- "Archive" (moves to archived, no email sent)
- "Ignore" (hides from list — for trivial PRs like dependency bumps)
- "Save draft" (saves edits without publishing)
- "Publish" (primary CTA — publishes and emails subscribers)
  - On click: confirmation modal showing subscriber count and preview
  - Disabled with tooltip if free tier limit reached

---

### 1.6 Subscribers `/dashboard/subscribers`

- Total count + confirmed count
- Table: email | confirmed | subscribed date | actions
- Search/filter
- Export CSV button (Starter+)
- Manual "Add subscriber" button (for importing existing list)
- Pagination (25/page)

---

### 1.7 Widget `/dashboard/widget`

- Widget preview (live iframe showing current settings)
- Settings form:
  - Position: bottom-right / bottom-left
  - Theme: light / dark / auto
  - Accent color (color picker)
  - Button label (default: "What's new")
- Install instructions:
  - Code snippet to copy (one `<script>` tag)
  - Framework-specific examples: React, Vue, plain HTML

---

### 1.8 Settings `/dashboard/settings`

**Sections:**

- **Workspace**
  - Name, slug (warning: changing slug breaks existing links)
  - Logo upload (stored in Supabase Storage)
  - Delete workspace (with confirmation)

- **Changelog Page**
  - Page title, meta description
  - Accent color
  - "Powered by Mergecast" toggle (Growth+ only)
  - Custom domain (Starter+): input field + DNS instructions + verify button + status badge

- **Repos**
  - Connected repos list (repo name + connected date + disconnect button)
  - "Connect another repo" (Growth+: up to 3; Scale: unlimited)

- **Notifications** (future)

---

### 1.9 Billing `/dashboard/billing`

- Current plan + renewal date
- Usage: publishes this month / limit, subscriber count / limit
- "Upgrade" / "Change plan" → Stripe Checkout or Portal
- Invoice history (link to Stripe Portal)
- Cancel subscription (→ Stripe Portal)

---

### 1.10 Admin Panel `/admin` (internal only)

- Guarded by `is_admin` flag on user record
- Workspace list: name, plan, slug, created_at, MRR
- Click workspace: view details + manual plan override dropdown
- Basic stats: total workspaces, total paid, MRR estimate
- No public route — admin flag checked server-side

---

## 2. Database Schema

```sql
-- ─────────────────────────────────────────
-- WORKSPACES
-- ─────────────────────────────────────────
CREATE TABLE workspaces (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                    TEXT UNIQUE NOT NULL,
  name                    TEXT NOT NULL,
  logo_url                TEXT,
  plan                    TEXT NOT NULL DEFAULT 'free',  -- free | starter | growth | scale
  stripe_customer_id      TEXT UNIQUE,
  stripe_subscription_id  TEXT UNIQUE,
  stripe_price_id         TEXT,
  -- publish quota tracking (reset monthly)
  publish_count_this_month INT NOT NULL DEFAULT 0,
  publish_quota_reset_at   TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', now()) + interval '1 month',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- WORKSPACE MEMBERS
-- ─────────────────────────────────────────
CREATE TABLE workspace_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'owner',  -- owner | member (future)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

-- ─────────────────────────────────────────
-- REPOS
-- ─────────────────────────────────────────
CREATE TABLE repos (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  github_repo_id          BIGINT NOT NULL UNIQUE,
  full_name               TEXT NOT NULL,          -- "owner/repo"
  github_installation_id  BIGINT NOT NULL,
  webhook_secret          TEXT NOT NULL,          -- HMAC secret per repo
  is_active               BOOLEAN NOT NULL DEFAULT true,
  connected_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- CHANGELOG ENTRIES
-- ─────────────────────────────────────────
CREATE TABLE changelog_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  repo_id         UUID REFERENCES repos(id) ON DELETE SET NULL,
  -- source PR data
  pr_number       INT,
  pr_title        TEXT,
  pr_body         TEXT,
  pr_url          TEXT,
  pr_merged_at    TIMESTAMPTZ,
  pr_author       TEXT,
  -- AI + user content
  ai_draft        TEXT,
  title           TEXT,           -- user-editable title
  final_content   TEXT,           -- markdown, user-edited
  -- lifecycle
  status          TEXT NOT NULL DEFAULT 'draft',  -- draft | published | archived | ignored
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_entries_workspace_status ON changelog_entries(workspace_id, status);
CREATE INDEX idx_entries_published_at ON changelog_entries(workspace_id, published_at DESC)
  WHERE status = 'published';

-- ─────────────────────────────────────────
-- SUBSCRIBERS
-- ─────────────────────────────────────────
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

-- ─────────────────────────────────────────
-- EMAIL SENDS
-- ─────────────────────────────────────────
CREATE TABLE email_sends (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entry_id          UUID NOT NULL REFERENCES changelog_entries(id) ON DELETE CASCADE,
  resend_batch_id   TEXT,
  recipient_count   INT NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | failed
  sent_at           TIMESTAMPTZ,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- WIDGET SETTINGS (1:1 with workspace)
-- ─────────────────────────────────────────
CREATE TABLE widget_settings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,
  position      TEXT NOT NULL DEFAULT 'bottom-right',   -- bottom-right | bottom-left
  theme         TEXT NOT NULL DEFAULT 'light',           -- light | dark | auto
  accent_color  TEXT NOT NULL DEFAULT '#000000',
  button_label  TEXT NOT NULL DEFAULT 'What''s new',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- CHANGELOG PAGE SETTINGS (1:1 with workspace)
-- ─────────────────────────────────────────
CREATE TABLE changelog_settings (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id              UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,
  custom_domain             TEXT UNIQUE,
  custom_domain_verified    BOOLEAN NOT NULL DEFAULT false,
  page_title                TEXT,
  page_description          TEXT,
  accent_color              TEXT NOT NULL DEFAULT '#000000',
  show_powered_by           BOOLEAN NOT NULL DEFAULT true,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- RLS POLICIES (all tables)
-- ─────────────────────────────────────────
-- Enable RLS on every table above.
-- Policy pattern: user can read/write rows where workspace_id is in their workspace_members.
-- Public read for published changelog_entries (for widget + public page SSR).
-- subscribers: insert allowed without auth (subscribe form); read/delete gated to workspace member.
```

---

## 3. API Routes

All authenticated routes require a valid Supabase session. Workspace ownership validated on every request — never trust workspace_id from the client without a membership check.

### 3.1 Public Routes (no auth)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/public/changelog/[slug]` | Returns published entries for a workspace slug (for widget + SSR fallback). Query params: `limit`, `before` (cursor). |
| `POST` | `/api/public/subscribe` | Subscribe an email to a workspace's changelog. Body: `{ workspace_id, email }`. Creates unconfirmed subscriber, sends confirmation email. |
| `GET` | `/api/public/confirm-subscription` | Confirms subscriber. Query: `token`. Sets `confirmed=true`, `confirmed_at=now()`. |
| `GET` | `/api/public/unsubscribe` | Unsubscribes. Query: `token`. Sets `unsubscribed_at=now()`. |

### 3.2 Authenticated Routes

#### Workspace

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/workspaces` | Create workspace. Body: `{ name, slug }`. Validates slug uniqueness. Creates workspace + workspace_member (owner) + default widget_settings + changelog_settings. |
| `GET` | `/api/workspaces` | List workspaces for current user (via workspace_members). |
| `GET` | `/api/workspaces/[id]` | Get workspace details + plan usage stats. |

#### Entries

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/workspaces/[id]/entries` | List entries. Query: `status`, `page`, `limit`. |
| `GET` | `/api/workspaces/[id]/entries/[entryId]` | Get single entry with all fields. |
| `PATCH` | `/api/workspaces/[id]/entries/[entryId]` | Update `title`, `final_content`, `status` (to archived/ignored only — publish has its own endpoint). |
| `POST` | `/api/workspaces/[id]/entries/[entryId]/publish` | Publish entry. Checks plan quota. Sets `status=published`, `published_at=now()`. Increments `publish_count_this_month`. Queues email send job. Returns updated entry. |
| `POST` | `/api/workspaces/[id]/entries/[entryId]/regenerate` | Re-runs OpenAI on the original PR data. Replaces `ai_draft`. Does not touch `final_content` if already edited. |

#### Repos

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/workspaces/[id]/repos` | List connected repos. |
| `POST` | `/api/workspaces/[id]/repos` | Connect repo. Body: `{ github_installation_id, github_repo_id, full_name }`. Validates plan repo limit. Registers GitHub webhook. Stores `webhook_secret`. |
| `DELETE` | `/api/workspaces/[id]/repos/[repoId]` | Disconnect repo. Deletes GitHub webhook. Sets `is_active=false` (soft delete to preserve historical entries). |

#### Subscribers

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/workspaces/[id]/subscribers` | List subscribers. Query: `confirmed`, `page`, `limit`. |
| `POST` | `/api/workspaces/[id]/subscribers/import` | Bulk import emails (CSV body). Starter+ only. Creates confirmed subscribers directly (skips confirmation email — user takes responsibility). |
| `DELETE` | `/api/workspaces/[id]/subscribers/[subscriberId]` | Remove subscriber. |

#### Settings

| Method | Path | Description |
|---|---|---|
| `PATCH` | `/api/workspaces/[id]/settings` | Update workspace name, logo (URL after Supabase Storage upload). Slug changes blocked after first publish. |
| `GET` | `/api/workspaces/[id]/widget-settings` | Get widget settings. |
| `PATCH` | `/api/workspaces/[id]/widget-settings` | Update widget settings. |
| `GET` | `/api/workspaces/[id]/changelog-settings` | Get changelog page settings. |
| `PATCH` | `/api/workspaces/[id]/changelog-settings` | Update page title, description, colors, `show_powered_by`. |
| `POST` | `/api/workspaces/[id]/changelog-settings/verify-domain` | Trigger CNAME verification check for custom domain. |

#### Billing

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/billing/create-checkout` | Create Stripe Checkout session. Body: `{ workspace_id, price_id }`. Returns `{ url }`. |
| `POST` | `/api/billing/create-portal` | Create Stripe Customer Portal session. Returns `{ url }`. |
| `GET` | `/api/billing/plans` | Return plan definitions (limits, pricing) — static config, not from Stripe. |

#### Admin

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/workspaces` | List all workspaces with plan and usage. Requires `is_admin=true` on user. |
| `PATCH` | `/api/admin/workspaces/[id]` | Override plan. Body: `{ plan }`. Bypasses Stripe. |

### 3.3 Webhook Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/webhooks/github` | Receives GitHub `pull_request` events. Validates HMAC-SHA256 signature using per-repo `webhook_secret`. Processes only `action=closed` + `merged=true`. Queues AI generation. Returns 200 immediately (async processing). |
| `POST` | `/api/webhooks/stripe` | Receives Stripe events. Validates webhook signature. Handles: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. |

### 3.4 Widget Endpoint

| Method | Path | Description |
|---|---|---|
| `GET` | `/widget/[slug].js` | Returns the embeddable JS bundle, personalized with the workspace's widget settings. Cached aggressively at CDN edge. On publish, cache is purged. |

---

## 4. User Flows

### Flow 1: Sign Up → First Published Entry

```
1. User lands on mergecast.co
2. Clicks "Start free"
3. /signup → clicks "Continue with GitHub"
4. GitHub OAuth → Supabase creates user session
5. Redirected to /onboarding/workspace
6. Enters workspace name → slug auto-generated → validates uniqueness → Next
7. /onboarding/connect → clicks "Install GitHub App"
8. GitHub App page → user selects repos → installs → redirected back with installation_id
9. App detects installation_id in callback URL → shows repo list → user selects one repo → Next
10. /onboarding/done → sees empty changelog preview → copies widget snippet → "Go to dashboard"
11. /dashboard → empty entries list → waiting state
12. Dev team merges a PR on connected repo
13. GitHub sends webhook → /api/webhooks/github
14. Server validates HMAC → creates pending entry → queues OpenAI call
15. OpenAI generates ai_draft + suggested title → entry saved as status=draft
16. Dashboard refreshes (polling or Supabase Realtime) → entry card appears
17. User clicks "Review"
18. Entry detail: reads AI draft, edits final_content if needed
19. Clicks "Publish"
20. Confirmation modal: "Send to 0 subscribers" (new account) → Confirm
21. Entry status = published → published_at set → quota incremented
22. Public changelog page at mergecast.co/[slug] now shows entry
23. Subscriber email queued (0 recipients, no email sent)
```

### Flow 2: Subscriber Signs Up and Receives Email

```
1. Visitor lands on mergecast.co/[slug] (the public changelog)
2. Enters email in subscribe form → clicks "Subscribe"
3. POST /api/public/subscribe → creates unconfirmed subscriber
4. Resend sends confirmation email with link: /confirm-subscription?token=...
5. Visitor clicks link → GET /api/public/confirm-subscription
6. confirmed=true, confirmed_at=now()
7. User publishes next entry in dashboard
8. Server queries confirmed subscribers for this workspace
9. Resend sends email to each (batch send via Resend API)
10. email_sends record created with recipient_count and resend_batch_id
11. Subscriber receives email: entry title, formatted content, "Read on changelog" link, unsubscribe link
```

### Flow 3: Free Tier Limit Hit → Upgrade

```
1. User has published 3 entries this month (free tier limit)
2. New PR merges → draft appears in dashboard
3. User opens entry → clicks "Publish"
4. Server: checks publish_count_this_month >= 3 AND plan = 'free' → returns 403
5. Client shows upgrade modal: "You've reached your monthly limit"
6. User clicks "Upgrade to Starter"
7. POST /api/billing/create-checkout → Stripe Checkout session created
8. User completes payment on Stripe-hosted page
9. Stripe webhook: checkout.session.completed → update workspaces.plan, stripe_subscription_id, stripe_price_id
10. User redirected to /dashboard/billing?success=true
11. Dashboard shows "Starter" badge → publish limit now unlimited
12. User returns to entry → publishes successfully
```

### Flow 4: Plan Cancellation

```
1. User goes to /dashboard/billing → clicks "Cancel subscription"
2. POST /api/billing/create-portal → Stripe Customer Portal session
3. User cancels in Stripe Portal → redirected back to /dashboard/billing
4. Stripe sends customer.subscription.deleted webhook
5. Server sets plan='free', clears stripe_subscription_id, stripe_price_id
6. If user has >3 publishes this month or >100 subscribers: data is NOT deleted
   - User can still VIEW everything
   - Future publish attempts blocked by free tier limit
   - Existing published entries remain public
   - Subscribers remain (but capped at 100 for new sends)
```

### Flow 5: Widget Integration

```
1. User goes to /dashboard/widget
2. Copies the one-line script tag
3. Pastes into their app's HTML (before </body>)
4. Widget JS loads from /widget/[slug].js
5. Script reads workspace widget_settings (position, theme, accent_color, button_label)
6. Renders floating button in their app
7. User clicks button → drawer opens → shows latest 10 published entries
8. Entries fetched from /api/public/changelog/[slug] (cached at edge)
9. Each entry shows title, date, rendered markdown body
```

---

## 5. Payment Logic

### Plan Limits

```typescript
export const PLAN_LIMITS = {
  free:    { publishes_per_month: 3,         subscribers: 100,    repos: 1 },
  starter: { publishes_per_month: Infinity,   subscribers: 1000,   repos: 1 },
  growth:  { publishes_per_month: Infinity,   subscribers: 10000,  repos: 3 },
  scale:   { publishes_per_month: Infinity,   subscribers: 50000,  repos: Infinity },
} as const;
```

### Quota Reset

Monthly publish quota resets on the 1st of each month via a Vercel cron job:
- `0 0 1 * *` → hits `/api/cron/reset-quotas` (protected by `CRON_SECRET` header)
- Updates `publish_count_this_month = 0` and `publish_quota_reset_at` for all workspaces

### Enforcement (server-side, never trust client)

On every `POST /api/workspaces/[id]/entries/[entryId]/publish`:
```
1. Fetch workspace (plan, publish_count_this_month, publish_quota_reset_at)
2. If publish_quota_reset_at < now(): reset count to 0, update reset_at (lazy reset fallback)
3. If plan === 'free' AND publish_count_this_month >= 3: return 403 { error: 'QUOTA_EXCEEDED' }
4. Proceed with publish
5. Increment publish_count_this_month
```

On subscriber limit enforcement:
- Checked at subscribe time: if `confirmed subscriber count >= plan limit`, return 403
- Existing subscribers never purged on downgrade

### Stripe Events Handled

| Event | Action |
|---|---|
| `checkout.session.completed` | Set `plan`, `stripe_subscription_id`, `stripe_price_id`, `stripe_customer_id` on workspace |
| `customer.subscription.updated` | Sync plan from `price_id` lookup (handles upgrades/downgrades mid-cycle) |
| `customer.subscription.deleted` | Set `plan='free'`, clear `stripe_subscription_id`, `stripe_price_id` |
| `invoice.payment_failed` | No immediate plan downgrade. After 3 failed attempts (handled by Stripe Dunning), `subscription.deleted` fires and triggers downgrade |

### Stripe Price ID → Plan Mapping

Stored as environment variables, never hardcoded:
```
STRIPE_PRICE_STARTER_MONTHLY=price_xxx
STRIPE_PRICE_GROWTH_MONTHLY=price_xxx
STRIPE_PRICE_SCALE_MONTHLY=price_xxx
```

Server-side function: `getPlanFromPriceId(priceId: string): Plan`

---

## 6. Edge Cases

### GitHub Webhook

| Case | Handling |
|---|---|
| Invalid HMAC signature | Return 401. Log attempt. |
| PR event but `merged=false` (closed without merge) | Ignore silently. Return 200. |
| Repo not found in DB (webhook from unregistered or deleted repo) | Return 200 (so GitHub doesn't retry). Log warning. |
| Repo is `is_active=false` | Return 200. Do not create entry. |
| Workspace on free tier already at publish quota | Still create draft entry. Block only at publish time, not at ingestion. |
| Duplicate webhook delivery (GitHub retry) | Check for existing entry with same `repo_id + pr_number`. If exists, skip. |
| PR title is empty or very short (< 5 chars) | OpenAI still runs — prompt handles it. If OpenAI returns empty draft, entry is created with title="Untitled update" and empty draft. User must edit manually. |
| PR body is empty | OpenAI generates from title alone. Works fine for simple PRs. |
| OpenAI API timeout (>30s) | Entry created with `ai_draft=null`. Dashboard shows "AI generation pending — retry available". User can click "Regenerate". |
| OpenAI API error (5xx) | Same as timeout. Retry available. |
| OpenAI returns inappropriate/hallucinated content | Mandatory review step catches this. Never auto-published. |

### Subscriptions & Email

| Case | Handling |
|---|---|
| Email already subscribed (duplicate) | Return 200 (don't expose subscriber list). Re-send confirmation if not yet confirmed. |
| Confirmation token expired | Tokens do not expire in MVP. If re-confirmation needed, user re-subscribes (deduplication handles it). |
| Unsubscribe token used twice | Idempotent — `unsubscribed_at` already set, return success page. |
| Email send partially fails (Resend partial error) | Log failed recipients in `email_sends.error_message`. Mark status='partial'. Do not retry automatically in MVP — admin can investigate. |
| Workspace has 0 confirmed subscribers on publish | Skip email send entirely. No `email_sends` record created. |
| Subscriber over plan limit tries to subscribe | Return 403 `SUBSCRIBER_LIMIT_REACHED`. Public page shows "Subscriptions temporarily unavailable". |
| Resend API down | Email send fails gracefully. Entry still publishes. `email_sends` status='failed'. Manual retry not supported in MVP — acknowledged limitation. |

### Billing & Plans

| Case | Handling |
|---|---|
| Stripe webhook arrives out of order (update before create) | Use `stripe_subscription_id` as idempotency key. Always fetch latest subscription state from Stripe on ambiguous events. |
| User closes Stripe Checkout without completing | No action needed — no webhook fired, plan unchanged. |
| User downgrades from Growth (3 repos) to Starter (1 repo) | Existing repos not disconnected. User sees warning banner: "Your plan supports 1 repo — disconnect 2 repos to comply." Enforce limit only on connecting new repos, not on existing. |
| User's card declines mid-subscription (dunning) | Stripe handles retry logic. After dunning period ends, `subscription.deleted` fires → downgrade to free. User emailed by Stripe (not our system). |
| Two Stripe webhooks for same event (duplicate delivery) | All Stripe webhook handlers are idempotent. Use `stripe_subscription_id` + `status` to detect and skip duplicate state updates. |
| Cron job fails to reset monthly quotas | Lazy reset fallback in publish endpoint catches this (checks `publish_quota_reset_at < now()`). |

### Auth & Workspaces

| Case | Handling |
|---|---|
| Slug collision on workspace creation | Validated at form level (debounced uniqueness check). Server also returns 409 with `SLUG_TAKEN`. Client retries with suggested alternative (slug + random suffix). |
| User tries to change slug after first publish | Blocked in UI (field disabled) and on server (returns 400 `SLUG_LOCKED`). Message: "Slug cannot be changed after publishing — it would break existing links." |
| GitHub App uninstalled (user removes it from GitHub settings) | GitHub sends `installation.deleted` webhook (if we register for it). Set all repos for that installation to `is_active=false`. Dashboard shows reconnect prompt. In MVP, handle gracefully — new webhooks won't fire, drafts stop appearing. |
| User deletes workspace | Cascade deletes: repos, entries, subscribers, settings, email_sends. Stripe subscription must be cancelled first (or auto-cancelled via server). Stripe customer NOT deleted (preserve billing history). |
| User signs up with different GitHub account than the one used to install the GitHub App | GitHub App installation is per-account/org. The installation belongs to the GitHub user/org, not to Mergecast's user. On repo connect, we verify the authenticated user has access to the installation via GitHub API before accepting. |

### Custom Domain (Starter+)

| Case | Handling |
|---|---|
| Domain already in use by another workspace | `custom_domain` has UNIQUE constraint. Return 409. |
| CNAME not yet propagated when verify is clicked | Verification fails gracefully with message: "CNAME not detected yet. DNS changes can take up to 48 hours." |
| Domain verification passes but Vercel domain assignment fails | Log error, mark `custom_domain_verified=false`, surface error to user. |

### Widget

| Case | Handling |
|---|---|
| Widget JS fails to load (e.g. ad blocker) | Script tag loads asynchronously — no impact on host page. No errors thrown. Widget simply doesn't appear. |
| Workspace has no published entries | Widget renders button but drawer shows empty state: "No updates yet." |
| Widget script embedded on a page with CSP restrictions | Documented limitation. Widget requires `script-src` to include Mergecast's domain. Not solvable in MVP. |
