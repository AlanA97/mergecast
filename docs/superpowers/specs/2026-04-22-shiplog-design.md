# Mergecast — Product Design Spec

**Date:** 2026-04-22  
**Status:** Approved for implementation  
**Founder profile:** Solo, senior software engineer  
**Target launch:** 4 weeks from start

---

## Problem

Every SaaS team ships updates. Communicating those updates to users requires someone to translate technical PR/commit language into readable copy, maintain a public changelog page, capture and email subscribers, and embed a "What's new" widget in the product. This is tedious, skipped constantly, and has no AI-native solution.

Existing tools (Headwayapp, Changelogfy, Beamer) are fully manual. GitHub Releases are developer-facing, not user-facing.

---

## Solution

Mergecast connects to a GitHub repo, listens for merged PRs, uses AI to generate user-facing release notes, hosts a public changelog page, emails subscribers, and provides an embeddable widget — with the user reviewing AI output before publishing.

---

## Target User

**Primary:** Indie hackers and early-stage SaaS founders (1–10 person teams) who ship regularly and want professional user-facing communication without a dedicated marketing person.

**Secondary:** Growth-stage SaaS teams ($1M–$5M ARR) who need to systematize changelog communication across multiple products.

---

## Why Existing Tools Fail

| Tool                     | Gap                                                   |
|--------------------------|-------------------------------------------------------|
| Headwayapp / Changelogfy | 100% manual — users churn when they stop posting      |
| Beamer                   | Expensive, feature-bloated, no AI generation          |
| GitHub Releases          | Developer-facing, no public page, no email, no widget |
| Notion public pages      | No structure, no automation, no subscriber management |

---

## Core Architecture

```
GitHub Webhook (PR merged)
    → Next.js API Route (webhook handler)
    → Queue entry in Supabase (pending_entries table)
    → OpenAI GPT-4o (PR title + description → user-facing summary)
    → Draft entry stored (requires manual review/publish)

User publishes entry:
    → Entry status = published
    → Public changelog page updated (SSR/ISR)
    → Subscriber email sent via Resend
    → Widget JS reflects new entry
```

---

## Data Schema

```sql
-- Core entities
workspaces       (id, slug, name, logo_url, plan, stripe_customer_id, stripe_subscription_id, created_at)
workspace_members (id, workspace_id, user_id, role)
repos            (id, workspace_id, github_repo_id, full_name, webhook_id, connected_at)
changelog_entries (id, workspace_id, repo_id, pr_number, pr_title, ai_draft, final_content, status [draft|published|archived], published_at, created_at)
subscribers      (id, workspace_id, email, confirmed, subscribed_at, unsubscribed_at)
email_sends      (id, workspace_id, entry_id, sent_at, recipient_count)

-- Auth: Supabase Auth (users table managed by Supabase)
```

---

## User Journey

1. **Sign up** → GitHub OAuth → workspace created
2. **Connect repo** → GitHub App install → webhook registered
3. **First PR merges** → AI draft appears in dashboard
4. **User reviews draft** → edits if needed → clicks Publish
5. **Entry published** → changelog page updates → subscribers emailed
6. **User adds widget** → copies JS snippet → embeds in their app
7. **Billing** → free tier hits limit → upgrades via Stripe Checkout

---

## Feature Scope

### MVP (ship in 4 weeks)
- GitHub OAuth + repo connection via GitHub App
- Webhook listener for `pull_request` events (merged)
- OpenAI draft generation
- Draft review/edit UI
- Public changelog page (`[slug].mergecast.co`)
- Email subscriber capture + confirmation
- Email send on publish (Resend)
- Embeddable JS widget
- Stripe subscription billing (3 tiers)
- Plan enforcement (publish limits, subscriber limits)
- Basic settings (workspace name, logo, changelog branding)
- Landing page

### V1.5 (week 5–6)
- Custom domain via CNAME
- GitLab support

### V2+
- Slack/Discord notifications on publish
- Multiple repos per workspace (Growth+ plan)
- Changelog categories/labels
- Analytics (views, widget clicks)
- Team seats

---

## Pricing

| Tier    | Price  | Limits                                                        |
|---------|--------|---------------------------------------------------------------|
| Free    | $0     | 1 repo, 3 publishes/mo, 100 subscribers, mergecast.co subdomain |
| Starter | $29/mo | 1 repo, unlimited publishes, custom domain, 1k subscribers    |
| Growth  | $59/mo | 3 repos, unlimited, 10k subscribers, widget + email           |
| Scale   | $99/mo | Unlimited repos, 50k subscribers, team seats                  |

---

## Tech Stack (latest stable versions)

| Layer           | Choice               | Reason                                                       |
|-----------------|----------------------|--------------------------------------------------------------|
| Frontend + API  | Next.js 16           | Full-stack, SSR for changelog pages, API routes for webhooks |
| Database + Auth | Supabase             | Postgres, Auth, Storage, Realtime — all-in-one               |
| Email           | Resend               | Developer-friendly, cheap, reliable deliverability           |
| Payments        | Stripe Billing       | Standard, Checkout handles UI, webhooks for lifecycle        |
| Styling         | Tailwind + shadcn/ui | Fast, professional, low maintenance                          |
| Hosting         | Vercel               | Zero-config Next.js, edge functions for widget               |
| Analytics       | PostHog              | Product analytics + feature flags, generous free tier        |
| Widget          | Vanilla JS bundle    | No framework dependency, embeds anywhere                     |

---

## Auth Strategy

- Supabase Auth with GitHub OAuth as primary sign-in
- Email/password as fallback
- GitHub OAuth also used for repo access (separate GitHub App installation)
- RLS policies on all Supabase tables scoped to workspace membership

---

## Payment Integration

- Stripe Checkout for subscription creation (hosted page, no card form to build)
- Stripe Customer Portal for self-serve plan changes and cancellation
- Stripe webhooks: `customer.subscription.created/updated/deleted` → sync plan in `workspaces` table
- Plan enforcement via middleware check on publish/subscriber actions

---

## Admin Panel (minimal)

- List of workspaces (name, plan, created_at, MRR contribution)
- Ability to manually override plan (for beta users, refunds)
- No complex analytics needed — PostHog + Stripe Dashboard covers it

---

## Launch Distribution

1. GitHub Marketplace listing (free inbound channel)
2. ProductHunt launch
3. Hacker News Show HN
4. Indie Hackers + dev communities
5. SEO: "changelog tool for SaaS", "release notes generator", "what's new widget"
6. Build-in-public on X/Twitter during development

---

## Risks

| Risk                          | Mitigation                                                     |
|-------------------------------|----------------------------------------------------------------|
| AI output quality             | Mandatory edit step — never auto-publish                       |
| GitHub API changes            | Webhooks are fundamental infrastructure, stable                |
| "Good enough" with free tools | Free tier captures these users; 3-publish limit forces upgrade |
| Funded competitor             | 6–12 month window to get 200 paying customers and strong brand |
| Low free→paid conversion      | Deliberate free tier limits; upgrade wall is hit quickly       |
