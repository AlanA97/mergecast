# Mergecast — Developer Guide

> **Audience:** Developers setting up a local environment, testing the product, or deploying to production.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Local Development Setup](#2-local-development-setup)
3. [Environment Variables](#3-environment-variables)
4. [Running the App Locally](#4-running-the-app-locally)
5. [Testing](#5-testing)
6. [Manual QA — Testing the Core Flows Locally](#6-manual-qa--testing-the-core-flows-locally)
7. [Deploying to Production (Vercel)](#7-deploying-to-production-vercel)
8. [Post-Deployment Verification](#8-post-deployment-verification)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Prerequisites

Install these before starting:

| Tool               | Version | Install                                                       |
|--------------------|---------|---------------------------------------------------------------|
| Bun                | 1.3+    | https://bun.sh — `curl -fsSL https://bun.sh/install \| bash` |
| Node.js            | 20+     | https://nodejs.org or `nvm install 20` — runtime for Next.js  |
| Git                | any     | https://git-scm.com                                           |
| Supabase CLI       | latest  | `bun install -g supabase`                                     |
| Stripe CLI         | latest  | https://stripe.com/docs/stripe-cli                            |
| ngrok (or similar) | any     | https://ngrok.com — needed to receive GitHub webhooks locally |

> **Why bun?** Bun is the package manager for this project — installs are ~5× faster than npm. Node.js is still used as the runtime (Bun as a Next.js 16 runtime has open compatibility issues).

> **Why ngrok?** GitHub App webhooks require a public HTTPS URL. ngrok creates a tunnel from a public URL to your `localhost:3000` in one command.

---

## 2. Local Development Setup

### 2.1 Clone and install

```bash
git clone https://github.com/<your-org>/mergecast.git
cd mergecast
bun install
```

### 2.2 Create a local Supabase project

```bash
supabase start
```

This spins up Postgres, Auth, and the Supabase API locally via Docker. On first run it takes a few minutes to pull images.

When it finishes, it prints your local credentials:

```
API URL:     http://127.0.0.1:54321
anon key:    eyJ...
service_role key: eyJ...
DB URL:      postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio URL:  http://127.0.0.1:54323
```

Keep these — you'll need them for the env file in the next step.

### 2.3 Run migrations

```bash
supabase db reset
```

`db reset` drops and recreates the local database, then runs all three migrations in order:

```
supabase/migrations/001_schema.sql   # tables, indexes, constraints
supabase/migrations/002_functions.sql # RPC functions, triggers
supabase/migrations/003_rls.sql      # Row Level Security policies
```

Re-run this command any time you want a clean slate.

### 2.4 Copy the env file

```bash
cp .env.example .env.local
```

Now open `.env.local` and fill in each variable — see [§3 Environment Variables](#3-environment-variables) for what each one does and how to get it.

---

## 3. Environment Variables

### Quick reference

| Variable                               | Required | Dev source                | Description                                            |
|----------------------------------------|----------|---------------------------|--------------------------------------------------------|
| `NEXT_PUBLIC_APP_URL`                  | ✅        | `http://localhost:3000`   | Base URL — used in emails and redirect links           |
| `NEXT_PUBLIC_SUPABASE_URL`             | ✅        | `supabase start` output   | Supabase project URL                                   |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅        | `supabase start` output   | Supabase anon key (safe to expose)                     |
| `SUPABASE_SECRET_KEY`                  | ✅        | `supabase start` output   | Supabase service role key — **never expose to client** |
| `NEXT_PUBLIC_GITHUB_APP_SLUG`          | ✅        | GitHub App settings       | The URL slug of your GitHub App                        |
| `GITHUB_APP_ID`                        | ✅        | GitHub App settings       | Numeric App ID                                         |
| `GITHUB_APP_PRIVATE_KEY`               | ✅        | GitHub App → generate key | Base64-encoded PEM (see below)                         |
| `GITHUB_APP_WEBHOOK_SECRET`            | ✅        | you choose                | Random string used to verify webhook payloads          |
| `OPENAI_API_KEY`                       | ✅        | platform.openai.com       | API key with access to `gpt-4o`                        |
| `STRIPE_SECRET_KEY`                    | ✅        | Stripe dashboard          | Use `sk_test_...` for dev, `sk_live_...` for prod      |
| `STRIPE_WEBHOOK_SECRET`                | ✅        | Stripe CLI / dashboard    | Webhook signing secret                                 |
| `STRIPE_PRICE_STARTER_MONTHLY`         | ✅        | Stripe dashboard          | `price_...` ID for $19/mo Starter                      |
| `STRIPE_PRICE_GROWTH_MONTHLY`          | ✅        | Stripe dashboard          | `price_...` ID for $49/mo Growth                       |
| `STRIPE_PRICE_SCALE_MONTHLY`           | ✅        | Stripe dashboard          | `price_...` ID for $79/mo Scale                        |
| `RESEND_API_KEY`                       | ✅        | resend.com                | API key for transactional email                        |
| `RESEND_FROM_EMAIL`                    | ✅        | `noreply@mergecast.co`    | Must match a verified sending domain                   |
| `CRON_SECRET`                          | ✅        | you generate              | Secret for the monthly quota-reset cron endpoint       |

### Detailed setup instructions per service

#### Supabase (local)

After `supabase start`:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon key from supabase start>
SUPABASE_SECRET_KEY=<service_role key from supabase start>
```

> For production, replace these with values from your Supabase cloud project's Settings → API page.

#### GitHub App

You need to create a GitHub App that listens for PR webhooks. This is separate from the GitHub OAuth app used for sign-in (that's handled by Supabase Auth).

1. Go to https://github.com/settings/apps/new
2. Fill in:
   - **Name:** Mergecast Dev (or similar)
   - **Homepage URL:** `http://localhost:3000`
   - **Webhook URL:** your ngrok URL + `/api/webhooks/github`  
     e.g. `https://abc123.ngrok.io/api/webhooks/github`
   - **Webhook secret:** pick a random string — paste it as `GITHUB_APP_WEBHOOK_SECRET`
3. Under **Permissions → Repository**, set Pull requests to **Read-only**
4. Under **Subscribe to events**, tick **Pull request**
5. After saving, copy:
   - **App ID** (numeric, at the top of the settings page) → `GITHUB_APP_ID`
   - **App slug** (from the URL — `github.com/apps/<slug>`) → `NEXT_PUBLIC_GITHUB_APP_SLUG`
6. Scroll to the bottom and click **Generate a private key**. A `.pem` file downloads.
7. Base64-encode it (no newlines):

   ```bash
   base64 -i your-app.private-key.pem | tr -d '\n'
   ```

   Paste the output as `GITHUB_APP_PRIVATE_KEY`.

> **Tip:** For local dev, you can leave the GitHub App webhook inactive (`Active` checkbox unchecked) and trigger webhooks manually using the Stripe CLI approach below — or just test via `curl` against your local endpoint.

#### Stripe

1. Log in to https://dashboard.stripe.com and switch to **Test mode**.
2. Create three products (Catalog → Products → Add product):
   - **Starter** — $19.00 recurring monthly → copy the `price_...` ID
   - **Growth** — $49.00 recurring monthly → copy the `price_...` ID
   - **Scale** — $79.00 recurring monthly → copy the `price_...` ID
3. Go to Developers → API keys → copy the **Secret key** (`sk_test_...`)
4. For the webhook secret in dev, use the Stripe CLI (see [§4](#4-running-the-app-locally) below)

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_GROWTH_MONTHLY=price_...
STRIPE_PRICE_SCALE_MONTHLY=price_...
```

`STRIPE_WEBHOOK_SECRET` is set after you start the Stripe CLI listener — it prints the secret on startup.

#### OpenAI

1. Go to https://platform.openai.com/api-keys
2. Create a new project key and ensure your account has access to `gpt-4o`
3. Set a **Usage limit** in Settings → Billing → Usage limits

```env
OPENAI_API_KEY=sk-...
```

#### Resend

For local development you can use the Resend sandbox — no DNS verification needed.

1. Sign up at https://resend.com
2. Create an API key
3. For dev, emails are captured in Resend's dashboard even without domain verification

```env
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@mergecast.co
```

#### Cron secret

Generate a random value:

```bash
openssl rand -hex 32
```

```env
CRON_SECRET=<output from above>
```

---

## 4. Running the App Locally

You need three terminal windows running simultaneously for the full local experience.

### Terminal 1 — Next.js dev server

```bash
bun dev
```

App runs at http://localhost:3000.

> The prebuild hook automatically bundles the embeddable widget (`public/widget/widget.js`) before the main build. For dev, it's served directly — run `bun run build:widget` if you change anything in `widget/`.

### Terminal 2 — Stripe webhook listener

```bash
stripe listen --forward-to http://localhost:3000/api/webhooks/stripe
```

On startup, it prints:

```
> Ready! Your webhook signing secret is whsec_... (^C to quit)
```

Copy the `whsec_...` value and add it to `.env.local`:

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

Restart the dev server after adding it.

### Terminal 3 — ngrok tunnel (for GitHub webhooks)

```bash
ngrok http 3000
```

Copy the `https://` forwarding URL and use it as the Webhook URL in your GitHub App settings:

```
https://abc123.ngrok-free.app/api/webhooks/github
```

> **Note:** ngrok free tier generates a new URL each session. Update your GitHub App webhook URL when you restart ngrok.

### Supabase Auth — enable GitHub OAuth locally

1. Open Supabase Studio at http://127.0.0.1:54323
2. Go to Authentication → Providers → GitHub
3. Create a **separate** GitHub OAuth App at https://github.com/settings/developers (this is for user sign-in, not webhooks):
   - Homepage: `http://localhost:3000`
   - Callback URL: `http://127.0.0.1:54321/auth/v1/callback`
4. Paste Client ID and Secret into Supabase Studio
5. Under Authentication → URL Configuration:
   - Site URL: `http://localhost:3000`
   - Redirect URLs: add `http://localhost:3000/api/auth/callback`

---

## 5. Testing

### Unit and integration tests

```bash
# Run all tests once
bun run test

# Watch mode (re-runs on file save)
bun run test:watch

# Run a specific test file
bun run test -- tests/lib/plans.test.ts

# Run tests matching a pattern
bun run test -- --reporter=verbose subscribe
```

### What the tests cover

| File                                        | Covers                                           |
|---------------------------------------------|--------------------------------------------------|
| `tests/lib/plans.test.ts`                   | Plan limits, price ID mapping                    |
| `tests/lib/quota.test.ts`                   | Quota enforcement, per-month reset logic         |
| `tests/lib/github/webhook.test.ts`          | PR payload parsing, signature validation         |
| `tests/lib/github/ignore-rules.test.ts`     | Rule matching (title prefix, contains, label)    |
| `tests/lib/openai/generate-draft.test.ts`   | AI draft generation prompting                    |
| `tests/lib/stripe/webhooks.test.ts`         | Stripe event handling                            |
| `tests/api/auth/callback.test.ts`           | Auth callback open-redirect prevention           |
| `tests/api/cron/reset-quotas.test.ts`       | Cron endpoint auth + quota reset                 |
| `tests/api/entries/route.test.ts`           | Entry CRUD, IDOR checks                          |
| `tests/api/public/subscribe.test.ts`        | Subscribe flow, rate limiting, limit enforcement |
| `tests/api/public/publish.test.ts`          | Publish flow, quota checks                       |
| `tests/api/public/rss.test.ts`              | RSS feed generation                              |
| `tests/api/webhooks/webhook.test.ts`        | GitHub webhook end-to-end                        |
| `tests/api/workspaces/ignore-rules.test.ts` | Ignore rule CRUD                                 |

### Linting

```bash
bun run lint
```

Fix automatically where possible:

```bash
bun run lint --fix
```

### Before every commit / PR

```bash
bun run test && bun run lint && bun run build
```

All three must pass with zero errors before merging.

---

## 6. Manual QA — Testing the Core Flows Locally

Work through each flow after setting up your local environment. Use **test mode** for Stripe and the **Supabase local Studio** to inspect data directly.

### Flow 1: Sign-up and onboarding

1. Open http://localhost:3000 and click **Get started**
2. Sign in with GitHub — you'll be redirected to `/onboarding`
3. Create a workspace: enter a name, pick a slug
4. Install the GitHub App when prompted (or skip and install later from Settings)
5. **Check in Studio:** `workspace_members` table should have one row for your user

**Expected result:** Redirected to `/dashboard` after onboarding completes.

### Flow 2: GitHub webhook → draft entry

This requires the ngrok tunnel and GitHub App to be configured.

1. Open a pull request and merge it into `main` on a repo where your GitHub App is installed
2. Within ~5 seconds, a new row should appear in the `changelog_entries` table with `status = 'draft'`
3. The entry should appear in your dashboard under **Drafts**

**Shortcut — test without a real PR:**

```bash
# Send a fake merged PR payload to your local endpoint
curl -X POST http://localhost:3000/api/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-Hub-Signature-256: sha256=$(echo -n '{"action":"closed","pull_request":{"merged":true,"number":1,"title":"Fix login bug","body":"Fixes the login redirect issue","user":{"login":"octocat"},"merged_at":"2026-01-01T00:00:00Z","base":{"repo":{"id":123,"full_name":"org/repo","name":"repo"}},"labels":[]}}' | openssl dgst -sha256 -hmac "$GITHUB_APP_WEBHOOK_SECRET" | awk '{print $2}')" \
  -d '{"action":"closed","pull_request":{"merged":true,"number":1,"title":"Fix login bug","body":"Fixes the login redirect issue","user":{"login":"octocat"},"merged_at":"2026-01-01T00:00:00Z","base":{"repo":{"id":123,"full_name":"org/repo","name":"repo"}},"labels":[]}}'
```

Replace `$GITHUB_APP_WEBHOOK_SECRET` with your actual secret value.

### Flow 3: Edit and publish an entry

1. Click a draft entry in the dashboard
2. Edit the title and body
3. Click **Save draft** — should persist without page reload
4. Click **Regenerate with AI** — should replace the body with a GPT-4o-generated version
5. Click **Publish** — entry moves to `status = 'published'`

**Check the public changelog:** http://localhost:3000/`<your-workspace-slug>`  
The entry should appear there immediately.

### Flow 4: Subscriber email flow

1. Open your public changelog URL (e.g. http://localhost:3000/myworkspace)
2. Enter a test email and submit the subscribe form
3. In Resend's dashboard, you should see the confirmation email
4. The subscriber row in the DB should have `confirmed = false`
5. Click the confirmation link in the email
6. The row should update to `confirmed = true`
7. Publish a new entry — the subscriber should receive the entry email

### Flow 5: Rate limiting on subscribe

Subscribe 5 times in quick succession from the same IP:

```bash
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/public/subscribe \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"test$i@example.com\", \"workspace_slug\": \"<your-slug>\"}"
  echo ""
done
```

The 6th request should return:

```json
{ "error": "Too many requests", "status": 429 }
```

### Flow 6: Billing

> Use Stripe test cards: `4242 4242 4242 4242`, any future expiry, any CVC.

1. Click **Billing** in the dashboard sidebar
2. Click **Upgrade** on the Starter plan
3. Complete the Stripe test checkout
4. After redirect, the dashboard should show **Starter** as the current plan
5. Click **Manage subscription** → the Stripe customer portal opens
6. Cancel the subscription — the plan should revert to **free** after the webhook fires

### Flow 7: Widget embed

1. Go to **Dashboard → Widget**
2. Copy the `<script>` snippet shown
3. Create a bare HTML file on your machine:

   ```html
   <!DOCTYPE html>
   <html lang="en">
     <body>
       <h1>My App</h1>
       <!-- paste the snippet here -->
     </body>
   </html>
   ```

4. Open the HTML file in a browser (or serve it with `npx serve .`)
5. A "What's new" button should appear — clicking it shows the drawer with your published entries

### Flow 8: Cron endpoint

Test the monthly quota-reset endpoint directly:

```bash
curl -X POST http://localhost:3000/api/cron/reset-quotas \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected response: `{ "ok": true, "reset": <number> }`

Test that it rejects invalid secrets:

```bash
curl -X POST http://localhost:3000/api/cron/reset-quotas \
  -H "Authorization: Bearer wrong-secret"
```

Expected: `401 Unauthorized`

### Flow 9: Public pages

| URL                 | Expected                                |
|---------------------|-----------------------------------------|
| `/<slug>`           | Public changelog with published entries |
| `/<slug>/rss.xml`   | Valid RSS 2.0 feed                      |
| `/sitemap.xml`      | Lists your workspace slug               |
| `/robots.txt`       | Disallows `/dashboard/` and `/api/`     |
| `/nonexistent-slug` | Branded 404 page                        |

---

## 7. Deploying to Production (Vercel)

### 7.1 Provision cloud services

Before deploying, you need live (not local) versions of every service. Follow the steps in [`docs/superpowers/specs/2026-04-27-prelaunch-checklist.md`](superpowers/specs/2026-04-27-prelaunch-checklist.md) §2 for:

- Supabase cloud project (run the 3 migrations via SQL editor)
- Stripe live products and webhook endpoint
- GitHub App pointing to `https://mergecast.co/api/webhooks/github`
- Resend domain verification
- OpenAI project key

### 7.2 Connect the repo to Vercel

1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Framework preset: **Next.js** (auto-detected)
4. Do **not** change the build command — the `prebuild` hook in `package.json` runs `build:widget` automatically

### 7.3 Set environment variables in Vercel

Go to your project → **Settings → Environment Variables** and add all the **Production** environment.

> **Common mistake:** `GITHUB_APP_PRIVATE_KEY` must be the base64-encoded PEM with **no newlines**. Generate it with:
> ```bash
> base64 -i your-app.private-key.pem | tr -d '\n'
> ```

### 7.4 Deploy

Either push to `main` (if you've set up auto-deploy) or click **Deploy** in the Vercel dashboard.

Monitor the build log — the `build:widget` step runs first, then `next build`. Both must succeed.

### 7.5 Add your custom domain

1. Vercel project → **Settings → Domains** → add `mergecast.co`
2. Vercel shows you the DNS records to add (typically an A record or CNAME)
3. Add them at your DNS registrar
4. Wait for propagation (usually 2–10 minutes with Cloudflare, up to 48 hours with others)
5. Vercel provisions the TLS certificate automatically once DNS resolves

### 7.6 Update Supabase redirect URLs for production

In your Supabase cloud project → **Authentication → URL Configuration**:

- **Site URL:** `https://mergecast.co`
- **Redirect URLs:** add `https://mergecast.co/api/auth/callback`

In your Supabase cloud project → **Authentication → Providers → GitHub**:
- Set the OAuth callback to `https://<project-ref>.supabase.co/auth/v1/callback`
- Update your GitHub OAuth App's callback URL to match

### 7.7 Verify the cron job

The Vercel cron is declared in `vercel.json`:

```json
{ "path": "/api/cron/reset-quotas", "schedule": "0 0 1 * *" }
```

Runs on the 1st of every month at 00:00 UTC. Vercel attaches the `Authorization: Bearer <CRON_SECRET>` header automatically.

To confirm it's registered: Vercel project → **Settings → Cron Jobs**.

---

## 8. Post-Deployment Verification

Run through these checks immediately after going live, before announcing publicly.

### Automated check — build and tests

```bash
bun run test && bun run lint && bun run build
```

All must pass with zero errors.

### Smoke test checklist

**Auth**
- [ ] Sign in with GitHub at `https://mergecast.co` → redirected to `/onboarding`
- [ ] Complete onboarding → redirected to `/dashboard`

**Core loop**
- [ ] Merge a PR on a connected repo → draft appears in dashboard within 10 seconds
- [ ] Edit and save draft
- [ ] Regenerate with AI
- [ ] Publish → appears on public changelog URL

**Subscribers**
- [ ] Subscribe on public changelog → confirmation email arrives (check Resend logs)
- [ ] Click confirm link → subscriber marked confirmed
- [ ] Unsubscribe link works

**Billing**
- [ ] Upgrade to Starter plan → Stripe checkout opens
- [ ] Complete checkout → plan updated in dashboard
- [ ] Manage subscription portal opens and returns correctly

**Widget**
- [ ] Embed snippet from `/dashboard/widget` loads on a test page
- [ ] Published entries render in the drawer

**Public pages**
- [ ] `https://mergecast.co/<slug>` → changelog renders
- [ ] `https://mergecast.co/<slug>/rss.xml` → valid RSS
- [ ] `https://mergecast.co/sitemap.xml` → includes workspace slugs
- [ ] `https://mergecast.co/robots.txt` → disallows `/dashboard/` and `/api/`
- [ ] Unknown slug → branded 404

**Mobile**
- [ ] Dashboard sidebar hamburger works on a phone-sized viewport
- [ ] Entry editor is usable at 375px width
- [ ] Public changelog and subscribe form work on mobile

---

## 9. Troubleshooting

### `supabase start` fails

Make sure Docker Desktop is running. Then:

```bash
supabase stop --no-backup
supabase start
```

### GitHub webhook 401 / signature mismatch

The signature is computed from the raw request body using `GITHUB_APP_WEBHOOK_SECRET`. Make sure:
- The env var is set correctly (no extra spaces or quotes)
- The GitHub App webhook secret matches exactly

### Stripe webhook 400 / `No signatures found`

The Stripe CLI listener generates a new `STRIPE_WEBHOOK_SECRET` each time it starts. After restarting the CLI, update `.env.local` and restart the dev server.

### `GITHUB_APP_PRIVATE_KEY` errors in production

The private key must be:
1. Base64-encoded (single-line, no newlines)
2. The original RSA private key from the `.pem` file (not converted or re-encoded)

To verify locally:
```bash
echo "$GITHUB_APP_PRIVATE_KEY" | base64 --decode | head -1
# should print: -----BEGIN RSA PRIVATE KEY-----
```

### Build fails: `build:widget` esbuild error

The widget builds before `next build` via the `prebuild` hook. If esbuild fails:

```bash
bun run build:widget
```

Run it in isolation to see the full error output.

### RLS policy errors (403 from API)

If API routes return 403 unexpectedly, check:
1. The user is a member of the workspace they're trying to access
2. The `is_workspace_member()` function exists (run `003_rls.sql` if missing)
3. RLS is enabled on the relevant table (check Supabase Studio → Table Editor → RLS)

### Emails not arriving

1. Check Resend dashboard → Emails → filter by `to` address
2. Verify `RESEND_FROM_EMAIL` matches a domain you've verified in Resend
3. For local dev, Resend sandbox may silently drop emails without a verified domain — add your personal email as a test recipient in Resend's settings
