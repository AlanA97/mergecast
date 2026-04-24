# Mergecast

**Mergecast** is an open-source changelog platform that turns merged GitHub pull requests into polished product updates - automatically. It generates AI-written release notes, publishes them to a hosted changelog page, notifies email subscribers, and surfaces updates via an embeddable widget you can drop into any website.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Usage](#usage)
- [Development](#development)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

- **GitHub integration** - Install the GitHub App, connect a repo, and Mergecast listens for merged PRs automatically
- **AI-generated drafts** - GPT-4o turns PR titles and descriptions into user-facing release notes
- **PR noise filtering** - Ignore rules suppress CI runs, dependency bumps, and internal commits
- **Embeddable widget** - A single `<script>` tag adds a changelog drawer to any website, no framework required
- **Email subscribers** - Double opt-in, per-workspace subscriber lists with auto-send on publish
- **RSS feed** - Every changelog has a `/rss.xml` feed at `/<workspace-slug>/rss.xml`
- **Plan-gated limits** - Free tier includes 3 publishes/month; paid plans unlock unlimited publishes, more subscribers, and badge removal
- **Admin dashboard** - Workspace count, plan breakdown, and MRR estimate at `/admin`

---

## Tech Stack

| Layer           | Technology                                      |
|-----------------|-------------------------------------------------|
| Framework       | Next.js 16 (App Router)                         |
| Database & Auth | Supabase (PostgreSQL + Row-Level Security)      |
| UI              | shadcn/ui, Radix UI, Tailwind CSS, Lucide React |
| AI              | OpenAI GPT-4o                                   |
| Email           | Resend                                          |
| Payments        | Stripe                                          |
| GitHub          | GitHub App (Octokit)                            |
| Widget bundler  | esbuild                                         |
| Tests           | Vitest, Testing Library                         |

---

## Project Structure

```
mergecast/
├── app/
│   ├── (auth)/              # Login & signup pages
│   ├── (app)/dashboard/     # Protected dashboard (entries, billing, widget, settings, subscribers)
│   ├── (public)/[slug]/     # Public changelog page + RSS feed
│   ├── admin/               # Admin stats (requires is_admin flag)
│   ├── api/                 # API routes (see below)
│   ├── onboarding/          # Workspace creation flow
│   └── page.tsx             # Marketing landing page
├── components/
│   ├── dashboard/           # Dashboard components (entry card, editor, etc.)
│   ├── public/              # Public changelog components
│   └── ui/                  # shadcn/ui base components
├── lib/
│   ├── github/              # GitHub App client, webhook parsing, ignore rules
│   ├── openai/              # AI draft generation
│   ├── stripe/              # Stripe client & webhook handlers
│   ├── supabase/            # Supabase server + client helpers
│   ├── resend/              # Email sending
│   ├── plans.ts             # Plan definitions & quota limits
│   └── quota.ts             # Publish quota enforcement
├── widget/
│   ├── src/index.ts         # Embeddable widget source (vanilla JS IIFE)
│   └── build.ts             # esbuild config
├── supabase/
│   └── migrations/          # SQL migration files (run in order)
├── tests/                   # Vitest test files
└── docs/                    # Project documentation
```

---

## Installation

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- A [GitHub App](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/about-creating-github-apps) with webhook permissions
- An [OpenAI](https://platform.openai.com) account (GPT-4o access)
- A [Stripe](https://stripe.com) account
- A [Resend](https://resend.com) account

### Steps

1. **Clone the repository**

   ```bash
   git clone https://github.com/AlanA97/mergecast.git
   cd mergecast
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   Copy the `.env.example` into a `.env.local` file in the project root and fill in your values:

   ```bash
   cp .env.example .env.local
   ```

4. **Apply database migrations**

   In the Supabase dashboard, open the SQL editor and run each file in `supabase/migrations/` in order:

   ```
   001_initial_schema.sql
   002_rls_policies.sql
   003_view_count_and_ignore_rules.sql
   004_fix_function_search_paths.sql
   ```

5. **Start the development server**

   ```bash
   npm run dev
   ```

   The app will be available at [http://localhost:3000](http://localhost:3000).

---

### Plans

Plans are defined in `lib/plans.ts`:

| Plan    | Price | Publishes/mo | Subscribers | Repos     | Remove badge |
|---------|-------|--------------|-------------|-----------|--------------|
| Free    | $0    | 3            | 100         | 1         | No           |
| Starter | $19   | Unlimited    | 1,000       | 1         | No           |
| Growth  | $49   | Unlimited    | 10,000      | 3         | Yes          |
| Scale   | $79   | Unlimited    | 50,000      | Unlimited | Yes          |

---

## Usage

### Embedding the Widget

Add a single `<script>` tag anywhere on your page:

```html
<script
  src="https://mergecast.co/widget/widget.js"
  data-workspace="your-workspace-slug"
></script>
```

The widget renders a toggleable changelog drawer in the bottom-right corner. You can customize it from the **Widget** tab in the dashboard (accent color, position, button label, theme).

### Connecting a GitHub Repository

1. Go to **Settings** in the dashboard
2. Click **Install GitHub App** - this redirects to GitHub to grant access
3. Select the repository you want to monitor
4. Mergecast will create a draft changelog entry for every merged pull request

### PR Ignore Rules

Prevent noise entries by adding ignore rules on the Settings page. Rules can match:

- **Title prefix** - e.g. `chore:`, `deps:`, `ci:`
- **Title contains** - e.g. `bump`, `dependabot`
- **Label** - e.g. `internal`, `skip-changelog`

### Publishing an Entry

1. Open an auto-generated draft in the dashboard
2. Review and edit the AI-generated content
3. Click **Publish** - this posts the entry to your public changelog and emails all confirmed subscribers

### Subscribing to a Changelog

Visitors can subscribe on your public changelog page (`/<workspace-slug>`). They receive a confirmation email; once confirmed they receive an email each time you publish.

### Monthly Quota Reset

The Free plan quota resets on the first of each month. Configure a cron job (e.g. Vercel Cron, GitHub Actions) to call:

```
POST /api/cron/reset-quotas
Authorization: Bearer <CRON_SECRET>
```

---

## Development

### Run tests

```bash
npm test          # run all tests once
npm run test:watch  # watch mode
```

### Build the widget

The widget is automatically built before `next build`. To build it separately:

```bash
npm run build:widget
```

Output: `public/widget/widget.js`

### Lint

```bash
npm run lint
```

### GitHub webhook (local development)

Use [ngrok](https://ngrok.com) or a similar tool to expose localhost, then set the webhook URL in your GitHub App settings:

```
https://<your-ngrok-url>/api/webhooks/github
```

### Stripe webhook (local development)

Use the [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

The CLI will print a `STRIPE_WEBHOOK_SECRET` to use locally.

---

## Deployment

The recommended platform is [Vercel](https://vercel.com). Any platform that supports Next.js 16 and serverless functions will work.

### Vercel

1. Import the repo in the Vercel dashboard
2. Add all environment variables from `.env.local`
3. Set up a Cron job in `vercel.json` (or the Vercel dashboard) to hit `/api/cron/reset-quotas` monthly:

   ```json
   {
     "crons": [
       {
         "path": "/api/cron/reset-quotas",
         "schedule": "0 0 1 * *"
       }
     ]
   }
   ```

4. Update `NEXT_PUBLIC_APP_URL` to your production domain
5. Update your GitHub App webhook URL to the production URL
6. Update your Stripe webhook endpoint to the production URL

---

## Troubleshooting

**Widget not loading**
- Confirm the `data-workspace` attribute matches your workspace slug exactly
- Check the browser console for network errors - the widget fetches `/api/public/changelog/<slug>`
- Ensure `NEXT_PUBLIC_APP_URL` is set correctly in production

**GitHub webhook not triggering drafts**
- Verify the webhook secret in both the Supabase `repos` table and `GITHUB_APP_WEBHOOK_SECRET`
- Check that the PR was actually merged (not just closed)
- Check whether an ignore rule is silently suppressing the entry
- Inspect the webhook delivery logs in your GitHub App settings

**AI draft not generated**
- Confirm `OPENAI_API_KEY` is valid and has access to `gpt-4o`
- Check server logs - OpenAI errors are logged but do not block entry creation

**Emails not sending**
- Verify `RESEND_API_KEY` and `RESEND_FROM_EMAIL`
- Confirm the subscriber's email address has been confirmed (double opt-in)
- Resend delivery logs are available in the Resend dashboard

**Quota not resetting**
- Confirm your cron job is calling `/api/cron/reset-quotas` with the correct `Authorization: Bearer <CRON_SECRET>` header

**"Powered by Mergecast" badge won't hide**
- Badge removal requires the **Growth** plan or above. Upgrade your workspace to remove it.

---

## License

MIT
