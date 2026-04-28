# Mergecast Pre-Launch Checklist

> **Status:** Ready to deploy — all code fixes committed to `main`.  
> This document covers every operational task required to go from a clean repo to a live production service.

---

## 1. What's already done (code is merged)

All the following are on `main` and require no further code changes:

| Area                                                                          | Done |
|-------------------------------------------------------------------------------|------|
| Security: IDOR membership checks on all authenticated routes                  | ✅    |
| Security: timing-safe cron secret comparison                                  | ✅    |
| Security: open redirect prevention in auth callback                           | ✅    |
| Security: `server-only` guard on Supabase service client                      | ✅    |
| Security: HTML escaping in Resend email templates                             | ✅    |
| Security: Stripe/GitHub env var guards (fail fast on boot)                    | ✅    |
| Security: Content-Security-Policy header                                      | ✅    |
| DB: 3 clean baseline migrations (schema, functions, RLS)                      | ✅    |
| DB: atomic publish counter via Postgres RPC                                   | ✅    |
| DB: transactional workspace creation via Postgres RPC                         | ✅    |
| DB: all CHECK constraints (plan, role, status, accent_color, position, theme) | ✅    |
| DB: `updated_at` triggers on all relevant tables                              | ✅    |
| DB: complete FK index coverage                                                | ✅    |
| Rate limiting on public subscribe endpoint (5 req/IP/min)                     | ✅    |
| Pricing consistency across landing page, billing page, and API                | ✅    |
| Branded 404 and 500 error pages                                               | ✅    |
| `robots.txt` and dynamic `sitemap.xml`                                        | ✅    |
| SVG + PNG favicon with apple-touch-icon                                       | ✅    |
| Mobile-responsive dashboard (collapsible sidebar, stacking entry editor)      | ✅    |
| Vercel cron job configured (`vercel.json`)                                    | ✅    |

---

## 2. Infrastructure to provision

### 2.1 Supabase project

1. Create a new project at [supabase.com](https://supabase.com).
2. **Run migrations** — in order, from the Supabase SQL editor or CLI:
   ```
   supabase/migrations/001_schema.sql
   supabase/migrations/002_functions.sql
   supabase/migrations/003_rls.sql
   ```
3. **Enable GitHub OAuth provider**  
   Dashboard → Authentication → Providers → GitHub  
   - Client ID + Secret: from your GitHub OAuth App (separate from the GitHub App used for webhooks — this is for user sign-in)  
   - Callback URL to set in GitHub: `https://<project-ref>.supabase.co/auth/v1/callback`

4. **Set auth redirect URLs**  
   Dashboard → Authentication → URL Configuration  
   - Site URL: `https://mergecast.co`  
   - Redirect URLs: add `https://mergecast.co/api/auth/callback`

5. **Collect credentials** for env vars:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Anon/public key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - Service role key → `SUPABASE_SECRET_KEY` *(keep secret — never expose to client)*

---

### 2.2 Stripe

1. Create three products in the Stripe dashboard (or use the API):

   | Product | Price  | Billing           | Env var                        |
   |---------|--------|-------------------|--------------------------------|
   | Starter | $19.00 | Monthly recurring | `STRIPE_PRICE_STARTER_MONTHLY` |
   | Growth  | $49.00 | Monthly recurring | `STRIPE_PRICE_GROWTH_MONTHLY`  |
   | Scale   | $79.00 | Monthly recurring | `STRIPE_PRICE_SCALE_MONTHLY`   |

   Copy each `price_xxx` ID into the corresponding env var.

2. **Register webhook endpoint**  
   Stripe Dashboard → Developers → Webhooks → Add endpoint  
   - URL: `https://mergecast.co/api/webhooks/stripe`  
   - Events to listen for:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`
   - Copy the signing secret → `STRIPE_WEBHOOK_SECRET`

3. Copy your secret key → `STRIPE_SECRET_KEY`  
   Use `sk_live_...` for production; `sk_test_...` is fine for a staging deploy.

4. **Configure customer portal**  
   Stripe Dashboard → Settings → Billing → Customer portal  
   Enable it and set the return URL to `https://mergecast.co/dashboard/billing`.

---

### 2.3 GitHub App (for webhook → changelog drafts)

> This is the app that listens for merged PRs. It is separate from the GitHub OAuth app used for user sign-in.

1. Create a GitHub App at [github.com/settings/apps/new](https://github.com/settings/apps/new):
   - **Name**: Mergecast (or your choice)
   - **Homepage URL**: `https://mergecast.co`
   - **Webhook URL**: `https://mergecast.co/api/webhooks/github`
   - **Webhook secret**: generate a random string → `GITHUB_APP_WEBHOOK_SECRET`
   - **Permissions** (Repository):
     - Pull requests → Read-only
   - **Subscribe to events**: Pull request
   - Uncheck "Active" on Webhook if you want to test before going live

2. After creation:
   - Copy the numeric App ID → `GITHUB_APP_ID`
   - Copy the App slug (from the URL) → `NEXT_PUBLIC_GITHUB_APP_SLUG`
   - Generate a private key (bottom of the app settings page), download the `.pem` file, then base64-encode it:
     ```bash
     base64 -i your-app.private-key.pem | tr -d '\n'
     ```
     Paste the result → `GITHUB_APP_PRIVATE_KEY`

---

### 2.4 Resend (transactional email)

1. Create an account at [resend.com](https://resend.com).
2. **Verify your sending domain** (DNS TXT/CNAME records for `mergecast.co`).
3. Create an API key → `RESEND_API_KEY`
4. Set `RESEND_FROM_EMAIL=noreply@mergecast.co` (must match the verified domain).

---

### 2.5 OpenAI

1. Create a project API key at [platform.openai.com](https://platform.openai.com) → `OPENAI_API_KEY`
2. Ensure the key has access to `gpt-4o`.
3. Set a usage/spend limit in the OpenAI dashboard to avoid runaway costs.

---

## 3. Vercel deployment

### 3.1 Deploy

```bash
# Connect the repo in Vercel dashboard, or:
vercel --prod
```

Framework preset: **Next.js**. No custom build command needed — `npm run build` runs `build:widget` automatically via the `prebuild` hook.

### 3.2 Environment variables

Set all the following in Vercel → Project → Settings → Environment Variables (Production):

```
NEXT_PUBLIC_APP_URL=https://mergecast.co

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=

NEXT_PUBLIC_GITHUB_APP_SLUG=
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=          # base64-encoded PEM, no newlines
GITHUB_APP_WEBHOOK_SECRET=

OPENAI_API_KEY=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STARTER_MONTHLY=
STRIPE_PRICE_GROWTH_MONTHLY=
STRIPE_PRICE_SCALE_MONTHLY=

RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@mergecast.co

CRON_SECRET=                     # generate with: openssl rand -hex 32  (Vercel passes this automatically in the Authorization header)
```

### 3.3 Cron job

`vercel.json` already configures the monthly quota-reset cron:
```json
{ "path": "/api/cron/reset-quotas", "schedule": "0 0 1 * *" }
```
Runs on the 1st of every month at 00:00 UTC. Vercel passes the `Authorization: Bearer <CRON_SECRET>` header automatically.

### 3.4 Custom domain

Vercel → Project → Settings → Domains → add `mergecast.co`.  
Update your DNS registrar with the CNAME/A records Vercel provides.

---

## 4. Admin user setup

The `/admin` route is protected by `user.app_metadata.is_admin === true`. Set this manually in Supabase for your account:

```sql
-- Run in Supabase SQL editor — replace with your user's UUID
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"is_admin": true}'::jsonb
WHERE id = '<your-user-uuid>';
```

---

## 5. Pre-launch smoke tests

Run through each of these on the live URL before announcing:

**Sign-up & onboarding**
- [ ] Sign up with GitHub OAuth → redirected to `/onboarding`
- [ ] Create workspace (check slug collision returns 409)
- [ ] Install GitHub App → redirected back to onboarding done step

**Core loop**
- [ ] Merge a PR on a connected repo → draft entry appears in dashboard within ~10 seconds
- [ ] Edit title + content → Save draft works
- [ ] Regenerate with AI works
- [ ] Publish → public changelog updates, subscribed users receive email
- [ ] Archive entry → removed from public feed

**Subscribers**
- [ ] Subscribe on public changelog page → confirmation email arrives
- [ ] Click confirm link → subscriber marked confirmed
- [ ] Unsubscribe link in email → subscriber removed
- [ ] Free plan: 101st subscriber returns `SUBSCRIBER_LIMIT_REACHED`

**Billing**
- [ ] Upgrade from free to Starter → Stripe checkout redirects correctly
- [ ] Post-checkout: plan updated to `starter` in dashboard
- [ ] Manage subscription portal opens and returns to `/dashboard/billing`

**Widget**
- [ ] Script snippet from `/dashboard/widget` loads and renders the drawer on a test page
- [ ] Published entries appear in widget

**Public pages**
- [ ] `/{slug}` renders with correct metadata and published entries
- [ ] `/{slug}/rss.xml` returns valid RSS
- [ ] Unknown slug returns 404 (branded page)
- [ ] `/sitemap.xml` includes workspace slugs
- [ ] `/robots.txt` disallows `/dashboard/` and `/api/`

**Mobile**
- [ ] Dashboard sidebar opens/closes via hamburger on a phone viewport
- [ ] Entry editor is readable and usable on 375px width
- [ ] Public changelog and subscribe form work on mobile

---

## 6. Post-launch: things to do next

These are not blockers for launch but should be addressed in the first sprint after shipping:

- **Error monitoring**: add Sentry (or similar) to `app/error.tsx` — right now errors are only `console.error`'d.
- **Rate limiting at scale**: the current in-memory rate limiter in `lib/rate-limit.ts` is per-Vercel-instance. Swap the backing store for [Vercel KV](https://vercel.com/storage/kv) or [Upstash Redis](https://upstash.com) for cluster-wide enforcement.
- **CSP nonce upgrade**: `next.config.ts` uses `'unsafe-inline'` for scripts/styles. A nonce-based CSP (generated in `proxy.ts`, threaded via headers to the root layout) would be significantly stronger.
- **Subscriber export**: no way to export the subscriber list yet — useful once you have paying users.
- **Repo limit enforcement**: `PLAN_LIMITS.repos` is defined but not enforced server-side when connecting a new repo. Add a check in the repo-connect flow.
- **Custom domain for changelogs**: the onboarding and settings UI mentions `changelog.mergecast.co/{slug}` but the app currently serves changelogs at `/{slug}` on the main domain. A subdomain proxy or wildcard domain setup is needed if subdomain changelogs are the intended UX.
