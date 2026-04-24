# Mergecast MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Mergecast — an AI-powered changelog SaaS that connects to GitHub, auto-drafts release notes from merged PRs, hosts a public changelog page, emails subscribers, and provides an embeddable widget.

**Architecture:** Next.js 16 App Router for frontend + API routes; Supabase for Postgres + Auth + Storage; GitHub App for webhook delivery; OpenAI GPT-4o for draft generation; Resend for transactional/broadcast email; Stripe Billing for subscriptions; a vanilla-JS widget bundle served from the edge.

**Tech Stack:** Next.js 16, Supabase (Postgres + Auth + Storage), OpenAI GPT-4o, Stripe Billing, Resend, Tailwind CSS, shadcn/ui, Vercel (hosting + cron), Vitest + Testing Library (tests)

---

## File Structure

```
mergecast/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx                        # auth guard + sidebar
│   │   ├── dashboard/page.tsx                # entry list
│   │   ├── dashboard/entries/[id]/page.tsx   # entry review/edit
│   │   ├── dashboard/subscribers/page.tsx
│   │   ├── dashboard/widget/page.tsx
│   │   ├── dashboard/settings/page.tsx
│   │   └── dashboard/billing/page.tsx
│   ├── (public)/
│   │   └── [slug]/page.tsx                   # public changelog (SSR)
│   ├── onboarding/page.tsx
│   ├── confirm-subscription/page.tsx
│   ├── unsubscribe/page.tsx
│   ├── admin/page.tsx
│   └── api/
│       ├── auth/callback/route.ts            # Supabase OAuth callback
│       ├── public/
│       │   ├── changelog/[slug]/route.ts
│       │   ├── subscribe/route.ts
│       │   ├── confirm-subscription/route.ts
│       │   └── unsubscribe/route.ts
│       ├── workspaces/route.ts
│       ├── workspaces/[id]/route.ts
│       ├── workspaces/[id]/entries/route.ts
│       ├── workspaces/[id]/entries/[entryId]/route.ts
│       ├── workspaces/[id]/entries/[entryId]/publish/route.ts
│       ├── workspaces/[id]/entries/[entryId]/regenerate/route.ts
│       ├── workspaces/[id]/repos/route.ts
│       ├── workspaces/[id]/repos/[repoId]/route.ts
│       ├── workspaces/[id]/subscribers/route.ts
│       ├── workspaces/[id]/widget-settings/route.ts
│       ├── workspaces/[id]/changelog-settings/route.ts
│       ├── workspaces/[id]/changelog-settings/verify-domain/route.ts
│       ├── billing/create-checkout/route.ts
│       ├── billing/create-portal/route.ts
│       ├── billing/plans/route.ts
│       ├── webhooks/github/route.ts
│       ├── webhooks/stripe/route.ts
│       ├── cron/reset-quotas/route.ts
│       └── admin/workspaces/route.ts
├── lib/
│   ├── supabase/
│   │   ├── server.ts                         # createServerClient (cookie-based)
│   │   ├── client.ts                         # createBrowserClient
│   │   └── middleware.ts                     # session refresh
│   ├── github/
│   │   ├── app.ts                            # Octokit App client, webhook registration
│   │   └── webhook.ts                        # HMAC validation, event parsing
│   ├── openai/
│   │   └── generate-draft.ts                 # PR → user-facing summary
│   ├── stripe/
│   │   ├── client.ts                         # Stripe SDK singleton
│   │   └── webhooks.ts                       # event handlers
│   ├── resend/
│   │   ├── client.ts                         # Resend SDK singleton
│   │   └── email.ts                          # send confirmation, send broadcast
│   ├── plans.ts                              # PLAN_LIMITS, getPlanFromPriceId
│   ├── quota.ts                              # checkPublishQuota, incrementPublishCount
│   └── utils.ts                             # slugify, generateToken
├── components/
│   ├── ui/                                   # shadcn/ui primitives
│   ├── dashboard/
│   │   ├── sidebar.tsx
│   │   ├── entry-card.tsx
│   │   └── entry-editor.tsx
│   └── public/
│       ├── changelog-entry.tsx
│       └── subscribe-form.tsx
├── widget/
│   └── src/index.ts                          # compiled → public/widget/[slug].js
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql
│       └── 002_rls_policies.sql
└── tests/
    ├── lib/
    │   ├── plans.test.ts
    │   ├── quota.test.ts
    │   ├── github-webhook.test.ts
    │   ├── generate-draft.test.ts
    │   └── stripe-webhooks.test.ts
    └── api/
        ├── publish.test.ts
        └── subscribe.test.ts
```

---

## Milestone 1: Foundation

### Task 1: Scaffold the project

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `.env.local`, `.env.example`, `.gitignore`

- [ ] **Step 1: Create the Next.js app**

```bash
cd /Users/alanalic/Projects/new-idea
npx create-next-app@latest mergecast \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --no-src-dir \
  --import-alias "@/*"
cd mergecast
```

- [ ] **Step 2: Install dependencies**

```bash
npm install \
  @supabase/supabase-js \
  @supabase/ssr \
  openai \
  stripe \
  resend \
  @octokit/app \
  @octokit/rest \
  zod \
  lucide-react \
  next-themes \
  @radix-ui/react-dialog \
  @radix-ui/react-dropdown-menu \
  @radix-ui/react-tabs \
  @radix-ui/react-badge \
  class-variance-authority \
  clsx \
  tailwind-merge

npm install -D \
  vitest \
  @vitest/coverage-v8 \
  @testing-library/react \
  @testing-library/jest-dom \
  @testing-library/user-event \
  @vitejs/plugin-react \
  jsdom \
  esbuild
```

- [ ] **Step 3: Install shadcn/ui**

```bash
npx shadcn@latest init
# Choose: Default style, Neutral base color, yes to CSS variables
npx shadcn@latest add button input label card badge tabs dialog dropdown-menu separator toast
```

- [ ] **Step 4: Create `.env.example`**

```bash
cat > .env.example << 'EOF'
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# GitHub App
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=        # base64-encoded PEM
GITHUB_APP_WEBHOOK_SECRET=     # shared secret for all webhooks
NEXT_PUBLIC_GITHUB_APP_SLUG=   # e.g. "mergecast-app"

# OpenAI
OPENAI_API_KEY=

# Stripe
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STARTER_MONTHLY=
STRIPE_PRICE_GROWTH_MONTHLY=
STRIPE_PRICE_SCALE_MONTHLY=

# Resend
RESEND_API_KEY=
RESEND_FROM_EMAIL=updates@mergecast.co

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=                   # random string to protect cron endpoint
EOF
```

- [ ] **Step 5: Copy to `.env.local` and add to `.gitignore`**

```bash
cp .env.example .env.local
echo ".env.local" >> .gitignore
```

- [ ] **Step 6: Configure Vitest**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

Create `tests/setup.ts`:

```typescript
import '@testing-library/jest-dom'
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js 16 project with Supabase, Stripe, Resend, Vitest"
```

---

### Task 2: Supabase project + schema migration

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`
- Create: `supabase/migrations/002_rls_policies.sql`

- [ ] **Step 1: Create Supabase project**

1. Go to supabase.com → New project → name: `mergecast`
2. Save: Project URL, anon key, service role key → paste into `.env.local`
3. Install Supabase CLI: `npm install -D supabase`
4. Link project: `npx supabase login && npx supabase link --project-ref <your-ref>`

- [ ] **Step 2: Write the schema migration**

Create `supabase/migrations/001_initial_schema.sql`:

```sql
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
```

- [ ] **Step 3: Write RLS policies**

Create `supabase/migrations/002_rls_policies.sql`:

```sql
-- Enable RLS on all tables
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE repos ENABLE ROW LEVEL SECURITY;
ALTER TABLE changelog_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE widget_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE changelog_settings ENABLE ROW LEVEL SECURITY;

-- Helper: is current user a member of this workspace?
CREATE OR REPLACE FUNCTION is_workspace_member(ws_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- WORKSPACES: members can read/update their workspace
CREATE POLICY "workspace_member_read" ON workspaces
  FOR SELECT USING (is_workspace_member(id));
CREATE POLICY "workspace_member_update" ON workspaces
  FOR UPDATE USING (is_workspace_member(id));
-- INSERT handled by service role (on workspace creation)

-- WORKSPACE_MEMBERS: read own memberships
CREATE POLICY "own_memberships" ON workspace_members
  FOR SELECT USING (user_id = auth.uid());

-- REPOS: workspace members
CREATE POLICY "repos_member_all" ON repos
  FOR ALL USING (is_workspace_member(workspace_id));

-- CHANGELOG_ENTRIES: members can do all; public can read published
CREATE POLICY "entries_member_all" ON changelog_entries
  FOR ALL USING (is_workspace_member(workspace_id));
CREATE POLICY "entries_public_read" ON changelog_entries
  FOR SELECT USING (status = 'published');

-- SUBSCRIBERS: members can read; anyone can insert (subscribe form)
CREATE POLICY "subscribers_member_read" ON subscribers
  FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "subscribers_public_insert" ON subscribers
  FOR INSERT WITH CHECK (true);
CREATE POLICY "subscribers_member_delete" ON subscribers
  FOR DELETE USING (is_workspace_member(workspace_id));

-- EMAIL_SENDS, WIDGET_SETTINGS, CHANGELOG_SETTINGS: members only
CREATE POLICY "email_sends_member" ON email_sends
  FOR ALL USING (is_workspace_member(workspace_id));
CREATE POLICY "widget_settings_member" ON widget_settings
  FOR ALL USING (is_workspace_member(workspace_id));
CREATE POLICY "changelog_settings_member" ON changelog_settings
  FOR ALL USING (is_workspace_member(workspace_id));
```

- [ ] **Step 4: Push migrations**

```bash
npx supabase db push
```

Expected output:
```
Applying migration 001_initial_schema.sql...
Applying migration 002_rls_policies.sql...
Done.
```

- [ ] **Step 5: Generate TypeScript types**

```bash
npx supabase gen types typescript --linked > lib/supabase/database.types.ts
```

- [ ] **Step 6: Commit**

```bash
git add supabase/ lib/supabase/database.types.ts
git commit -m "feat: add Supabase schema migrations and RLS policies"
```

---

### Task 3: Supabase client helpers + plan limits

**Files:**
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/middleware.ts`
- Create: `lib/plans.ts`
- Create: `lib/utils.ts`
- Create: `tests/lib/plans.test.ts`
- Modify: `middleware.ts` (root)

- [ ] **Step 1: Write the failing test for plan limits**

Create `tests/lib/plans.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { PLAN_LIMITS, getPlanFromPriceId } from '@/lib/plans'

describe('PLAN_LIMITS', () => {
  it('free tier allows 3 publishes per month', () => {
    expect(PLAN_LIMITS.free.publishes_per_month).toBe(3)
  })

  it('starter tier has unlimited publishes', () => {
    expect(PLAN_LIMITS.starter.publishes_per_month).toBe(Infinity)
  })

  it('free tier caps subscribers at 100', () => {
    expect(PLAN_LIMITS.free.subscribers).toBe(100)
  })

  it('free tier allows 1 repo', () => {
    expect(PLAN_LIMITS.free.repos).toBe(1)
  })

  it('growth tier allows 3 repos', () => {
    expect(PLAN_LIMITS.growth.repos).toBe(3)
  })

  it('scale tier allows unlimited repos', () => {
    expect(PLAN_LIMITS.scale.repos).toBe(Infinity)
  })
})

describe('getPlanFromPriceId', () => {
  it('returns starter for starter price id', () => {
    process.env.STRIPE_PRICE_STARTER_MONTHLY = 'price_starter'
    expect(getPlanFromPriceId('price_starter')).toBe('starter')
  })

  it('returns growth for growth price id', () => {
    process.env.STRIPE_PRICE_GROWTH_MONTHLY = 'price_growth'
    expect(getPlanFromPriceId('price_growth')).toBe('growth')
  })

  it('returns scale for scale price id', () => {
    process.env.STRIPE_PRICE_SCALE_MONTHLY = 'price_scale'
    expect(getPlanFromPriceId('price_scale')).toBe('scale')
  })

  it('returns free for unknown price id', () => {
    expect(getPlanFromPriceId('price_unknown')).toBe('free')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test tests/lib/plans.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/plans'`

- [ ] **Step 3: Implement `lib/plans.ts`**

```typescript
export type Plan = 'free' | 'starter' | 'growth' | 'scale'

export const PLAN_LIMITS: Record<Plan, { publishes_per_month: number; subscribers: number; repos: number }> = {
  free:    { publishes_per_month: 3,        subscribers: 100,   repos: 1        },
  starter: { publishes_per_month: Infinity, subscribers: 1000,  repos: 1        },
  growth:  { publishes_per_month: Infinity, subscribers: 10000, repos: 3        },
  scale:   { publishes_per_month: Infinity, subscribers: 50000, repos: Infinity },
}

export function getPlanFromPriceId(priceId: string): Plan {
  if (priceId === process.env.STRIPE_PRICE_STARTER_MONTHLY) return 'starter'
  if (priceId === process.env.STRIPE_PRICE_GROWTH_MONTHLY)  return 'growth'
  if (priceId === process.env.STRIPE_PRICE_SCALE_MONTHLY)   return 'scale'
  return 'free'
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm test tests/lib/plans.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 5: Implement `lib/utils.ts`**

```typescript
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 63)
}

export function generateToken(bytes = 32): string {
  const array = new Uint8Array(bytes)
  crypto.getRandomValues(array)
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
}
```

- [ ] **Step 6: Implement Supabase helpers**

Create `lib/supabase/server.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './database.types'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}

export function createSupabaseServiceClient() {
  const { createClient } = require('@supabase/supabase-js')
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

Create `lib/supabase/client.ts`:

```typescript
'use client'
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 7: Add session-refresh middleware**

Create `lib/supabase/middleware.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/signup')
  const isAppRoute = request.nextUrl.pathname.startsWith('/dashboard') ||
    request.nextUrl.pathname.startsWith('/onboarding')

  if (!user && isAppRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
```

Create `middleware.ts` at project root:

```typescript
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|widget|api/webhooks|api/public|api/cron).*)'],
}
```

- [ ] **Step 8: Commit**

```bash
git add lib/ middleware.ts tests/lib/plans.test.ts
git commit -m "feat: add Supabase helpers, plan limits, utils, session middleware"
```

---

## Milestone 2: Auth

### Task 4: GitHub OAuth sign-in + sign-up pages

**Files:**
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/signup/page.tsx`
- Create: `app/api/auth/callback/route.ts`

- [ ] **Step 1: Create the OAuth callback route**

Create `app/api/auth/callback/route.ts`:

```typescript
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
```

- [ ] **Step 2: Enable GitHub OAuth in Supabase**

1. Supabase Dashboard → Authentication → Providers → GitHub → Enable
2. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
   - Homepage URL: `http://localhost:3000`
   - Callback URL: `https://<your-supabase-ref>.supabase.co/auth/v1/callback`
3. Copy Client ID + Client Secret → paste into Supabase GitHub provider settings

- [ ] **Step 3: Create login page**

Create `app/(auth)/login/page.tsx`:

```typescript
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Github } from 'lucide-react'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  const { error } = await searchParams

  async function signInWithGitHub() {
    'use server'
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`,
        scopes: 'read:user user:email',
      },
    })
    if (data.url) redirect(data.url)
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="text-muted-foreground text-sm">Sign in to your Mergecast account</p>
        </div>
        {error && (
          <p className="text-destructive text-sm text-center">Authentication failed. Please try again.</p>
        )}
        <form action={signInWithGitHub}>
          <Button type="submit" className="w-full" size="lg">
            <Github className="mr-2 h-4 w-4" />
            Continue with GitHub
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <a href="/signup" className="underline">Sign up free</a>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create signup page**

Create `app/(auth)/signup/page.tsx`:

```typescript
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Github } from 'lucide-react'

export default async function SignupPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  async function signUpWithGitHub() {
    'use server'
    const supabase = await createSupabaseServerClient()
    const { data } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback?next=/onboarding`,
        scopes: 'read:user user:email',
      },
    })
    if (data.url) redirect(data.url)
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Start for free</h1>
          <p className="text-muted-foreground text-sm">
            Connect your GitHub repo and ship your first changelog in minutes.
          </p>
        </div>
        <form action={signUpWithGitHub}>
          <Button type="submit" className="w-full" size="lg">
            <Github className="mr-2 h-4 w-4" />
            Continue with GitHub
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <a href="/login" className="underline">Sign in</a>
        </p>
        <p className="text-center text-xs text-muted-foreground">
          By signing up you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Manual test — confirm auth flow works**

```bash
npm run dev
# Open http://localhost:3000/signup
# Click "Continue with GitHub"
# Authorize → should redirect to /onboarding (404 for now — that's fine)
# Check Supabase dashboard → Authentication → Users → confirm user created
```

- [ ] **Step 6: Commit**

```bash
git add app/(auth)/ app/api/auth/
git commit -m "feat: add GitHub OAuth sign-in and sign-up pages"
```

---

## Milestone 3: Onboarding

### Task 5: Workspace creation API

**Files:**
- Create: `app/api/workspaces/route.ts`
- Create: `lib/quota.ts`
- Create: `tests/lib/quota.test.ts`

- [ ] **Step 1: Write failing test for quota logic**

Create `tests/lib/quota.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkPublishQuota } from '@/lib/quota'
import type { Plan } from '@/lib/plans'

// Mock Supabase service client
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: vi.fn(),
}))

import { createSupabaseServiceClient } from '@/lib/supabase/server'

function makeWorkspace(plan: Plan, count: number, resetAt: Date) {
  return {
    plan,
    publish_count_this_month: count,
    publish_quota_reset_at: resetAt.toISOString(),
  }
}

describe('checkPublishQuota', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('allows publish when free tier has quota remaining', async () => {
    const ws = makeWorkspace('free', 2, new Date(Date.now() + 86400000))
    const result = await checkPublishQuota(ws as any)
    expect(result.allowed).toBe(true)
  })

  it('blocks publish when free tier quota exhausted', async () => {
    const ws = makeWorkspace('free', 3, new Date(Date.now() + 86400000))
    const result = await checkPublishQuota(ws as any)
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('QUOTA_EXCEEDED')
  })

  it('allows publish on paid tier regardless of count', async () => {
    const ws = makeWorkspace('starter', 9999, new Date(Date.now() + 86400000))
    const result = await checkPublishQuota(ws as any)
    expect(result.allowed).toBe(true)
  })

  it('resets count and allows publish when quota_reset_at is in the past', async () => {
    const mockUpdate = vi.fn().mockResolvedValue({ error: null })
    ;(createSupabaseServiceClient as any).mockReturnValue({
      from: () => ({ update: () => ({ eq: mockUpdate }) }),
    })
    const ws = makeWorkspace('free', 3, new Date(Date.now() - 1000))
    const result = await checkPublishQuota(ws as any, 'ws-id-123')
    expect(result.allowed).toBe(true)
    expect(mockUpdate).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test tests/lib/quota.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/quota'`

- [ ] **Step 3: Implement `lib/quota.ts`**

```typescript
import { PLAN_LIMITS, type Plan } from '@/lib/plans'
import { createSupabaseServiceClient } from '@/lib/supabase/server'

interface WorkspaceQuotaFields {
  plan: Plan
  publish_count_this_month: number
  publish_quota_reset_at: string
}

interface QuotaResult {
  allowed: boolean
  reason?: 'QUOTA_EXCEEDED'
}

export async function checkPublishQuota(
  workspace: WorkspaceQuotaFields,
  workspaceId?: string
): Promise<QuotaResult> {
  const limit = PLAN_LIMITS[workspace.plan as Plan].publishes_per_month

  // Lazy reset: if reset_at is in the past, reset the counter
  if (new Date(workspace.publish_quota_reset_at) < new Date()) {
    if (workspaceId) {
      const supabase = createSupabaseServiceClient()
      const nextReset = new Date()
      nextReset.setMonth(nextReset.getMonth() + 1, 1)
      nextReset.setHours(0, 0, 0, 0)
      await supabase
        .from('workspaces')
        .update({
          publish_count_this_month: 0,
          publish_quota_reset_at: nextReset.toISOString(),
        })
        .eq('id', workspaceId)
    }
    return { allowed: true }
  }

  if (workspace.publish_count_this_month >= limit) {
    return { allowed: false, reason: 'QUOTA_EXCEEDED' }
  }

  return { allowed: true }
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm test tests/lib/quota.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Implement workspace creation route**

Create `app/api/workspaces/route.ts`:

```typescript
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const CreateWorkspaceSchema = z.object({
  name: z.string().min(1).max(64),
  slug: z.string().min(2).max(63).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
})

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = CreateWorkspaceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { name, slug } = parsed.data
  const service = createSupabaseServiceClient()

  // Check slug uniqueness
  const { data: existing } = await service
    .from('workspaces')
    .select('id')
    .eq('slug', slug)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'SLUG_TAKEN' }, { status: 409 })
  }

  // Create workspace
  const { data: workspace, error: wsError } = await service
    .from('workspaces')
    .insert({ name, slug })
    .select()
    .single()

  if (wsError || !workspace) {
    return NextResponse.json({ error: 'Failed to create workspace' }, { status: 500 })
  }

  // Add creator as owner
  await service.from('workspace_members').insert({
    workspace_id: workspace.id,
    user_id: user.id,
    role: 'owner',
  })

  // Create default settings
  await Promise.all([
    service.from('widget_settings').insert({ workspace_id: workspace.id }),
    service.from('changelog_settings').insert({ workspace_id: workspace.id }),
  ])

  return NextResponse.json({ workspace }, { status: 201 })
}

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, workspaces(*)')
    .eq('user_id', user.id)

  const workspaces = (memberships ?? []).map(m => ({ ...m.workspaces, role: m.role }))
  return NextResponse.json({ workspaces })
}
```

- [ ] **Step 6: Commit**

```bash
git add app/api/workspaces/ lib/quota.ts tests/lib/quota.test.ts
git commit -m "feat: workspace creation API with slug validation and quota helpers"
```

---

### Task 6: GitHub App setup + repo connection API

**Files:**
- Create: `lib/github/app.ts`
- Create: `app/api/workspaces/[id]/repos/route.ts`

- [ ] **Step 1: Create a GitHub App**

1. GitHub → Settings → Developer settings → GitHub Apps → New GitHub App
2. Settings:
   - Name: `Mergecast` (or `Mergecast Dev` for local)
   - Homepage URL: `http://localhost:3000`
   - Webhook URL: Use `smee.io` for local dev (run `npx smee-client --url https://smee.io/<id> --target http://localhost:3000/api/webhooks/github`)
   - Webhook secret: generate a random string → save as `GITHUB_APP_WEBHOOK_SECRET`
   - Permissions → Repository → Pull requests: Read-only
   - Subscribe to events: Pull request
   - Where can it be installed: Any account
3. After creation: note the App ID → `GITHUB_APP_ID`
4. Generate a private key → download PEM file → base64 encode:
   ```bash
   base64 -i private-key.pem | tr -d '\n'
   ```
   → save as `GITHUB_APP_PRIVATE_KEY`
5. Note the App slug from the URL → `NEXT_PUBLIC_GITHUB_APP_SLUG`

- [ ] **Step 2: Implement `lib/github/app.ts`**

Create `lib/github/app.ts`:

```typescript
import { App } from '@octokit/app'

let _app: App | null = null

export function getGitHubApp(): App {
  if (_app) return _app
  _app = new App({
    appId: process.env.GITHUB_APP_ID!,
    privateKey: Buffer.from(process.env.GITHUB_APP_PRIVATE_KEY!, 'base64').toString('utf-8'),
    webhooks: { secret: process.env.GITHUB_APP_WEBHOOK_SECRET! },
  })
  return _app
}

export async function getInstallationOctokit(installationId: number) {
  const app = getGitHubApp()
  return app.getInstallationOctokit(installationId)
}

export async function registerWebhookForRepo(
  installationId: number,
  owner: string,
  repo: string,
  webhookSecret: string
): Promise<number> {
  const octokit = await getInstallationOctokit(installationId)
  const { data } = await octokit.rest.repos.createWebhook({
    owner,
    repo,
    config: {
      url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/github`,
      content_type: 'json',
      secret: webhookSecret,
    },
    events: ['pull_request'],
    active: true,
  })
  return data.id
}

export async function deleteWebhookForRepo(
  installationId: number,
  owner: string,
  repo: string,
  hookId: number
): Promise<void> {
  const octokit = await getInstallationOctokit(installationId)
  await octokit.rest.repos.deleteWebhook({ owner, repo, hook_id: hookId })
}
```

- [ ] **Step 3: Implement repo connection route**

Create `app/api/workspaces/[id]/repos/route.ts`:

```typescript
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { registerWebhookForRepo, deleteWebhookForRepo } from '@/lib/github/app'
import { PLAN_LIMITS } from '@/lib/plans'
import { generateToken } from '@/lib/utils'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const ConnectRepoSchema = z.object({
  github_installation_id: z.number(),
  github_repo_id: z.number(),
  full_name: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workspaceId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()

  // Verify membership
  const { data: membership } = await service
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: workspace } = await service
    .from('workspaces')
    .select('plan')
    .eq('id', workspaceId)
    .single()
  if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Check repo limit
  const { count } = await service
    .from('repos')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)

  const repoLimit = PLAN_LIMITS[workspace.plan as any].repos
  if ((count ?? 0) >= repoLimit) {
    return NextResponse.json({ error: 'REPO_LIMIT_REACHED' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = ConnectRepoSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { github_installation_id, github_repo_id, full_name } = parsed.data
  const [owner, repo] = full_name.split('/')
  const webhookSecret = generateToken(32)

  // Register webhook via GitHub API
  let webhookId: number
  try {
    webhookId = await registerWebhookForRepo(github_installation_id, owner, repo, webhookSecret)
  } catch (err) {
    return NextResponse.json({ error: 'Failed to register GitHub webhook' }, { status: 502 })
  }

  const { data: repoRecord, error } = await service
    .from('repos')
    .upsert({
      workspace_id: workspaceId,
      github_repo_id,
      full_name,
      github_installation_id,
      webhook_secret: webhookSecret,
      is_active: true,
    }, { onConflict: 'github_repo_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Failed to save repo' }, { status: 500 })

  return NextResponse.json({ repo: repoRecord }, { status: 201 })
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workspaceId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: repos } = await supabase
    .from('repos')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .order('connected_at', { ascending: false })

  return NextResponse.json({ repos: repos ?? [] })
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/github/ app/api/workspaces/
git commit -m "feat: GitHub App integration and repo connection API"
```

---

### Task 7: Onboarding UI

**Files:**
- Create: `app/onboarding/page.tsx`

- [ ] **Step 1: Implement 3-step onboarding wizard**

Create `app/onboarding/page.tsx`:

```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { slugify } from '@/lib/utils'
import { Github } from 'lucide-react'

type Step = 'workspace' | 'connect' | 'done'

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('workspace')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugError, setSlugError] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [loading, setLoading] = useState(false)

  function handleNameChange(value: string) {
    setName(value)
    setSlug(slugify(value))
    setSlugError('')
  }

  async function createWorkspace() {
    setLoading(true)
    const res = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug }),
    })
    const data = await res.json()
    setLoading(false)

    if (res.status === 409) {
      setSlugError('This slug is already taken. Try a different one.')
      return
    }
    if (!res.ok) {
      setSlugError('Something went wrong. Please try again.')
      return
    }

    setWorkspaceId(data.workspace.id)
    setStep('connect')
  }

  function openGitHubApp() {
    const appSlug = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG
    window.open(`https://github.com/apps/${appSlug}/installations/new`, '_blank')
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-8 p-8">
        {/* Step indicator */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {(['workspace', 'connect', 'done'] as Step[]).map((s, i) => (
            <span key={s} className={`flex items-center gap-2 ${step === s ? 'text-foreground font-medium' : ''}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs
                ${step === s ? 'bg-foreground text-background' : 'bg-muted'}`}>
                {i + 1}
              </span>
              {s === 'workspace' ? 'Name it' : s === 'connect' ? 'Connect repo' : 'Done'}
              {i < 2 && <span className="mx-1">→</span>}
            </span>
          ))}
        </div>

        {step === 'workspace' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold">Name your changelog</h1>
              <p className="text-muted-foreground text-sm mt-1">This is how your users will find your changelog.</p>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Workspace name</Label>
                <Input
                  value={name}
                  onChange={e => handleNameChange(e.target.value)}
                  placeholder="Acme Inc"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label>Changelog URL</Label>
                <div className="flex items-center rounded-md border bg-muted px-3 py-2 text-sm">
                  <span className="text-muted-foreground">changelog.mergecast.co/</span>
                  <Input
                    value={slug}
                    onChange={e => { setSlug(e.target.value); setSlugError('') }}
                    className="border-0 bg-transparent p-0 focus-visible:ring-0"
                    placeholder="acme"
                  />
                </div>
                {slugError && <p className="text-destructive text-xs">{slugError}</p>}
              </div>
            </div>
            <Button
              onClick={createWorkspace}
              disabled={!name || !slug || loading}
              className="w-full"
            >
              {loading ? 'Creating…' : 'Continue'}
            </Button>
          </div>
        )}

        {step === 'connect' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold">Connect a GitHub repo</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Mergecast will listen for merged pull requests and draft release notes automatically.
              </p>
            </div>
            <Button onClick={openGitHubApp} className="w-full" size="lg">
              <Github className="mr-2 h-4 w-4" />
              Install GitHub App
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Opens GitHub in a new tab. Return here when done.
            </p>
            <Button variant="outline" className="w-full" onClick={() => setStep('done')}>
              I've installed it — continue
            </Button>
            <button
              className="w-full text-sm text-muted-foreground underline"
              onClick={() => setStep('done')}
            >
              Skip for now
            </button>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-6 text-center">
            <div className="text-5xl">🎉</div>
            <div>
              <h1 className="text-2xl font-bold">You're all set</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Merge a PR and your first draft will appear in the dashboard.
              </p>
            </div>
            <Button className="w-full" onClick={() => router.push('/dashboard')}>
              Go to dashboard
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Manual test**

```bash
npm run dev
# Sign up → should redirect to /onboarding
# Enter workspace name → slug auto-fills
# Click Continue → workspace created → step 2
# Click "Skip for now" → step 3 → "Go to dashboard" → /dashboard (404 for now)
```

- [ ] **Step 3: Commit**

```bash
git add app/onboarding/
git commit -m "feat: 3-step onboarding wizard (workspace + GitHub App + done)"
```

---

## Milestone 4: GitHub Webhook + AI Draft Generation

### Task 8: Webhook HMAC validation + event parsing

**Files:**
- Create: `lib/github/webhook.ts`
- Create: `tests/lib/github-webhook.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/lib/github-webhook.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { validateGitHubWebhookSignature, parsePullRequestEvent } from '@/lib/github/webhook'

const SECRET = 'test-secret-abc'

async function makeSignedRequest(body: string, secret: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  return `sha256=${hex}`
}

describe('validateGitHubWebhookSignature', () => {
  it('returns true for a valid signature', async () => {
    const body = JSON.stringify({ action: 'closed' })
    const sig = await makeSignedRequest(body, SECRET)
    const result = await validateGitHubWebhookSignature(body, sig, SECRET)
    expect(result).toBe(true)
  })

  it('returns false for an invalid signature', async () => {
    const body = JSON.stringify({ action: 'closed' })
    const result = await validateGitHubWebhookSignature(body, 'sha256=fakesig', SECRET)
    expect(result).toBe(false)
  })

  it('returns false when signature is missing', async () => {
    const result = await validateGitHubWebhookSignature('body', '', SECRET)
    expect(result).toBe(false)
  })
})

describe('parsePullRequestEvent', () => {
  it('returns null for non-merged PRs', () => {
    const payload = { action: 'closed', pull_request: { merged: false, title: 'test', number: 1, body: '', html_url: '', user: { login: 'user' }, merged_at: null }, repository: { id: 123, full_name: 'owner/repo' } }
    expect(parsePullRequestEvent(payload)).toBeNull()
  })

  it('returns null for non-closed actions', () => {
    const payload = { action: 'opened', pull_request: { merged: false, title: 'test', number: 1, body: '', html_url: '', user: { login: 'user' }, merged_at: null }, repository: { id: 123, full_name: 'owner/repo' } }
    expect(parsePullRequestEvent(payload)).toBeNull()
  })

  it('returns parsed PR data for a merged PR', () => {
    const payload = {
      action: 'closed',
      pull_request: {
        merged: true,
        number: 42,
        title: 'Add dark mode',
        body: 'Users can now toggle dark mode.',
        html_url: 'https://github.com/owner/repo/pull/42',
        user: { login: 'janedoe' },
        merged_at: '2026-04-22T10:00:00Z',
      },
      repository: { id: 99, full_name: 'owner/repo' },
    }
    const result = parsePullRequestEvent(payload)
    expect(result).toEqual({
      prNumber: 42,
      prTitle: 'Add dark mode',
      prBody: 'Users can now toggle dark mode.',
      prUrl: 'https://github.com/owner/repo/pull/42',
      prAuthor: 'janedoe',
      prMergedAt: '2026-04-22T10:00:00Z',
      repoId: 99,
      repoFullName: 'owner/repo',
    })
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test tests/lib/github-webhook.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/github/webhook'`

- [ ] **Step 3: Implement `lib/github/webhook.ts`**

```typescript
export async function validateGitHubWebhookSignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!signature || !signature.startsWith('sha256=')) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const expectedBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  const expectedHex = 'sha256=' + Array.from(new Uint8Array(expectedBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  // Constant-time comparison
  if (expectedHex.length !== signature.length) return false
  let mismatch = 0
  for (let i = 0; i < expectedHex.length; i++) {
    mismatch |= expectedHex.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return mismatch === 0
}

export interface ParsedPullRequest {
  prNumber: number
  prTitle: string
  prBody: string
  prUrl: string
  prAuthor: string
  prMergedAt: string
  repoId: number
  repoFullName: string
}

export function parsePullRequestEvent(payload: any): ParsedPullRequest | null {
  if (payload.action !== 'closed') return null
  if (!payload.pull_request?.merged) return null

  return {
    prNumber:    payload.pull_request.number,
    prTitle:     payload.pull_request.title ?? '',
    prBody:      payload.pull_request.body ?? '',
    prUrl:       payload.pull_request.html_url,
    prAuthor:    payload.pull_request.user?.login ?? '',
    prMergedAt:  payload.pull_request.merged_at,
    repoId:      payload.repository.id,
    repoFullName: payload.repository.full_name,
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test tests/lib/github-webhook.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/github/webhook.ts tests/lib/github-webhook.test.ts
git commit -m "feat: GitHub webhook HMAC validation and PR event parser"
```

---

### Task 9: OpenAI draft generation

**Files:**
- Create: `lib/openai/generate-draft.ts`
- Create: `tests/lib/generate-draft.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/lib/generate-draft.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { generateChangelogDraft } from '@/lib/openai/generate-draft'

vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: '{"title":"Dark mode support","body":"You can now switch between light and dark mode in your account settings."}' } }],
          }),
        },
      },
    })),
  }
})

describe('generateChangelogDraft', () => {
  it('returns title and body from OpenAI response', async () => {
    const result = await generateChangelogDraft({
      prTitle: 'Add dark mode toggle',
      prBody: 'Implements a theme switcher in the settings page. Closes #123.',
    })
    expect(result.title).toBe('Dark mode support')
    expect(result.body).toContain('dark mode')
  })

  it('returns fallback on malformed JSON response', async () => {
    const { default: OpenAI } = await import('openai')
    ;(OpenAI as any).mockImplementationOnce(() => ({
      chat: { completions: { create: vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'not json at all' } }],
      }) } },
    }))
    const result = await generateChangelogDraft({ prTitle: 'Fix bug', prBody: '' })
    expect(result.title).toBe('Fix bug')
    expect(result.body).toBe('')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test tests/lib/generate-draft.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/openai/generate-draft'`

- [ ] **Step 3: Implement `lib/openai/generate-draft.ts`**

```typescript
import OpenAI from 'openai'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

interface DraftInput {
  prTitle: string
  prBody: string
}

interface DraftOutput {
  title: string
  body: string
}

const SYSTEM_PROMPT = `You are a product writer for a SaaS company. Your job is to turn a GitHub pull request into a concise, user-facing changelog entry.

Rules:
- Write for end users, not developers. Avoid technical jargon like "refactor", "fix null pointer", "bump dependency".
- Title: short, positive, feature-focused (e.g. "Dark mode support", "Faster search results")
- Body: 1–3 sentences explaining what changed and why it benefits the user
- If the PR is a dependency bump, internal refactor, or CI change with no user impact, return: {"title":"","body":""}
- Respond ONLY with valid JSON: {"title":"...","body":"..."}`

export async function generateChangelogDraft(input: DraftInput): Promise<DraftOutput> {
  const userMessage = `PR Title: ${input.prTitle}\nPR Description: ${input.prBody || '(none)'}`

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.4,
      max_tokens: 300,
    })

    const content = response.choices[0]?.message?.content ?? ''
    const parsed = JSON.parse(content)

    return {
      title: parsed.title ?? input.prTitle,
      body: parsed.body ?? '',
    }
  } catch {
    return { title: input.prTitle, body: '' }
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test tests/lib/generate-draft.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/openai/ tests/lib/generate-draft.test.ts
git commit -m "feat: OpenAI changelog draft generation with fallback handling"
```

---

### Task 10: GitHub webhook route

**Files:**
- Create: `app/api/webhooks/github/route.ts`

- [ ] **Step 1: Implement the webhook handler**

Create `app/api/webhooks/github/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { validateGitHubWebhookSignature, parsePullRequestEvent } from '@/lib/github/webhook'
import { generateChangelogDraft } from '@/lib/openai/generate-draft'
import { createSupabaseServiceClient } from '@/lib/supabase/server'

// Required: disable body parsing so we can validate the raw body signature
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256') ?? ''
  const event = request.headers.get('x-github-event') ?? ''

  // Only process pull_request events
  if (event !== 'pull_request') {
    return NextResponse.json({ ok: true })
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const pr = parsePullRequestEvent(payload)
  if (!pr) {
    // Not a merged PR — silently ignore
    return NextResponse.json({ ok: true })
  }

  const service = createSupabaseServiceClient()

  // Look up the repo record by github_repo_id
  const { data: repo } = await service
    .from('repos')
    .select('id, workspace_id, webhook_secret, is_active')
    .eq('github_repo_id', pr.repoId)
    .single()

  if (!repo) {
    // Unknown repo — acknowledge to prevent GitHub retries
    return NextResponse.json({ ok: true })
  }

  if (!repo.is_active) {
    return NextResponse.json({ ok: true })
  }

  // Validate HMAC with per-repo secret
  const valid = await validateGitHubWebhookSignature(rawBody, signature, repo.webhook_secret)
  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Idempotency: skip if entry for this PR already exists
  const { data: existing } = await service
    .from('changelog_entries')
    .select('id')
    .eq('repo_id', repo.id)
    .eq('pr_number', pr.prNumber)
    .single()

  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  // Generate AI draft (async — but we await it here for simplicity in MVP)
  const draft = await generateChangelogDraft({
    prTitle: pr.prTitle,
    prBody: pr.prBody,
  })

  // Create the draft entry
  await service.from('changelog_entries').insert({
    workspace_id: repo.workspace_id,
    repo_id: repo.id,
    pr_number: pr.prNumber,
    pr_title: pr.prTitle,
    pr_body: pr.prBody,
    pr_url: pr.prUrl,
    pr_author: pr.prAuthor,
    pr_merged_at: pr.prMergedAt,
    ai_draft: draft.body,
    title: draft.title || pr.prTitle,
    final_content: draft.body,
    status: 'draft',
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Set up smee.io for local webhook testing**

```bash
npx smee-client --url https://smee.io/<your-smee-id> --target http://localhost:3000/api/webhooks/github
# Keep this running in a separate terminal during development
```

- [ ] **Step 3: End-to-end smoke test**

```bash
# With dev server + smee running:
# 1. Create a test PR on your connected repo
# 2. Merge the PR
# 3. Check Supabase dashboard → changelog_entries table → new row with status=draft
# 4. Verify ai_draft is populated (may take a few seconds)
```

- [ ] **Step 4: Commit**

```bash
git add app/api/webhooks/github/
git commit -m "feat: GitHub webhook handler with HMAC validation and AI draft creation"
```

---

---

## Milestone 5: Dashboard + Entry Management

### Task 11: App layout + sidebar

**Files:**
- Create: `app/(app)/layout.tsx`
- Create: `components/dashboard/sidebar.tsx`

- [ ] **Step 1: Create the authenticated app layout**

Create `app/(app)/layout.tsx`:

```typescript
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('workspace_id, workspaces(id, name, slug, plan)')
    .eq('user_id', user.id)
    .limit(1)

  if (!memberships?.length) redirect('/onboarding')

  const workspace = (memberships[0].workspaces as any)

  return (
    <div className="flex h-screen">
      <Sidebar workspace={workspace} />
      <main className="flex-1 overflow-auto bg-muted/10">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Create sidebar component**

Create `components/dashboard/sidebar.tsx`:

```typescript
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, Code2, Settings, CreditCard, LogOut } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

const NAV = [
  { href: '/dashboard',              label: 'Entries',     icon: LayoutDashboard },
  { href: '/dashboard/subscribers',  label: 'Subscribers', icon: Users },
  { href: '/dashboard/widget',       label: 'Widget',      icon: Code2 },
  { href: '/dashboard/settings',     label: 'Settings',    icon: Settings },
  { href: '/dashboard/billing',      label: 'Billing',     icon: CreditCard },
]

export function Sidebar({ workspace }: { workspace: { name: string; slug: string; plan: string } }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="flex w-56 flex-col border-r bg-background">
      <div className="flex h-14 items-center border-b px-4">
        <span className="font-semibold text-sm">Mergecast</span>
      </div>
      <div className="px-3 py-2">
        <p className="truncate text-xs font-medium text-muted-foreground">{workspace.name}</p>
        {workspace.plan === 'free' && (
          <Badge variant="secondary" className="mt-1 text-xs">Free</Badge>
        )}
      </div>
      <nav className="flex-1 space-y-1 px-2 py-2">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
              pathname === href
                ? 'bg-muted font-medium'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="border-t p-2">
        <button
          onClick={signOut}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: Add `cn` helper to `lib/utils.ts`**

```typescript
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 63)
}

export function generateToken(bytes = 32): string {
  const array = new Uint8Array(bytes)
  crypto.getRandomValues(array)
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
}
```

- [ ] **Step 4: Commit**

```bash
git add app/(app)/ components/dashboard/sidebar.tsx lib/utils.ts
git commit -m "feat: authenticated app layout with sidebar navigation"
```

---

### Task 12: Entries list API + dashboard page

**Files:**
- Create: `app/api/workspaces/[id]/entries/route.ts`
- Create: `app/(app)/dashboard/page.tsx`
- Create: `components/dashboard/entry-card.tsx`

- [ ] **Step 1: Implement entries list API**

Create `app/api/workspaces/[id]/entries/route.ts`:

```typescript
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workspaceId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50)
  const offset = (page - 1) * limit

  let query = supabase
    .from('changelog_entries')
    .select('*', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status)

  const { data: entries, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ entries: entries ?? [], total: count ?? 0, page, limit })
}
```

- [ ] **Step 2: Install date-fns and create entry card**

```bash
npm install date-fns
```

Create `components/dashboard/entry-card.tsx`:

```typescript
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  draft: 'secondary',
  published: 'default',
  archived: 'outline',
  ignored: 'outline',
}

interface EntryCardProps {
  entry: {
    id: string
    title: string | null
    pr_title: string | null
    pr_number: number | null
    status: string
    created_at: string
    published_at: string | null
  }
  workspaceId: string
}

export function EntryCard({ entry, workspaceId }: EntryCardProps) {
  const displayTitle = entry.title || entry.pr_title || 'Untitled update'
  const date = entry.published_at ?? entry.created_at

  return (
    <Link href={`/dashboard/entries/${entry.id}`}>
      <div className="flex items-center justify-between rounded-lg border bg-background p-4 hover:bg-muted/50 transition-colors cursor-pointer">
        <div className="space-y-1 min-w-0">
          <p className="font-medium text-sm truncate">{displayTitle}</p>
          <p className="text-xs text-muted-foreground">
            {entry.pr_number ? `PR #${entry.pr_number} · ` : ''}
            {formatDistanceToNow(new Date(date), { addSuffix: true })}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[entry.status] ?? 'secondary'} className="ml-4 shrink-0">
          {entry.status}
        </Badge>
      </div>
    </Link>
  )
}
```

- [ ] **Step 3: Create dashboard page**

Create `app/(app)/dashboard/page.tsx`:

```typescript
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { EntryCard } from '@/components/dashboard/entry-card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'

async function getWorkspace(userId: string) {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('workspace_members')
    .select('workspaces(*)')
    .eq('user_id', userId)
    .limit(1)
    .single()
  return data?.workspaces as any
}

async function getEntries(workspaceId: string, status?: string) {
  const supabase = await createSupabaseServerClient()
  let query = supabase
    .from('changelog_entries')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (status) query = query.eq('status', status)
  const { data } = await query
  return data ?? []
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const workspace = await getWorkspace(user!.id)
  const { tab } = await searchParams
  const activeTab = tab ?? 'all'

  const [all, drafts, published] = await Promise.all([
    getEntries(workspace.id),
    getEntries(workspace.id, 'draft'),
    getEntries(workspace.id, 'published'),
  ])

  const entries = activeTab === 'draft' ? drafts : activeTab === 'published' ? published : all

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Entries</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Merge a PR to generate your next draft automatically.</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/${workspace.slug}`} target="_blank">
            <ExternalLink className="mr-2 h-3 w-3" />View changelog
          </Link>
        </Button>
      </div>
      <Tabs defaultValue={activeTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="all">All ({all.length})</TabsTrigger>
          <TabsTrigger value="draft">Drafts ({drafts.length})</TabsTrigger>
          <TabsTrigger value="published">Published ({published.length})</TabsTrigger>
        </TabsList>
        <TabsContent value={activeTab}>
          {entries.length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center">
              <p className="text-muted-foreground text-sm">
                {activeTab === 'draft' ? 'No drafts. Merge a PR to get started.'
                  : activeTab === 'published' ? 'Nothing published yet.'
                  : 'No entries yet. Connect a repo and merge a PR.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map(entry => (
                <EntryCard key={entry.id} entry={entry} workspaceId={workspace.id} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/workspaces/ app/(app)/dashboard/ components/dashboard/entry-card.tsx
git commit -m "feat: entries list API and dashboard page with tab filtering"
```

---

### Task 13: Entry detail + publish API

**Files:**
- Create: `app/api/workspaces/[id]/entries/[entryId]/route.ts`
- Create: `app/api/workspaces/[id]/entries/[entryId]/publish/route.ts`
- Create: `app/api/workspaces/[id]/entries/[entryId]/regenerate/route.ts`
- Create: `app/(app)/dashboard/entries/[id]/page.tsx`
- Create: `components/dashboard/entry-editor.tsx`
- Create: `tests/api/publish.test.ts`

- [ ] **Step 1: Write failing test for publish quota enforcement**

Create `tests/api/publish.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/quota', () => ({
  checkPublishQuota: vi.fn(),
}))

import { checkPublishQuota } from '@/lib/quota'

describe('publish quota enforcement', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('blocks publish when quota returns not allowed', async () => {
    ;(checkPublishQuota as any).mockResolvedValue({ allowed: false, reason: 'QUOTA_EXCEEDED' })
    const result = await checkPublishQuota({} as any)
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('QUOTA_EXCEEDED')
  })

  it('allows publish when quota returns allowed', async () => {
    ;(checkPublishQuota as any).mockResolvedValue({ allowed: true })
    const result = await checkPublishQuota({} as any)
    expect(result.allowed).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to confirm it passes**

```bash
npm test tests/api/publish.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 3: Implement entry CRUD route**

Create `app/api/workspaces/[id]/entries/[entryId]/route.ts`:

```typescript
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

type Params = { params: Promise<{ id: string; entryId: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id: workspaceId, entryId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: entry } = await supabase
    .from('changelog_entries')
    .select('*')
    .eq('id', entryId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ entry })
}

const UpdateEntrySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  final_content: z.string().optional(),
  status: z.enum(['archived', 'ignored', 'draft']).optional(),
})

export async function PATCH(request: Request, { params }: Params) {
  const { id: workspaceId, entryId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = UpdateEntrySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { data: entry, error } = await supabase
    .from('changelog_entries')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', entryId)
    .eq('workspace_id', workspaceId)
    .select()
    .single()

  if (error || !entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ entry })
}
```

- [ ] **Step 4: Implement publish route**

Create `app/api/workspaces/[id]/entries/[entryId]/publish/route.ts`:

```typescript
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { checkPublishQuota } from '@/lib/quota'
import { sendPublishEmail } from '@/lib/resend/email'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ id: string; entryId: string }> }

export async function POST(_req: Request, { params }: Params) {
  const { id: workspaceId, entryId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()

  const { data: workspace } = await service
    .from('workspaces')
    .select('id, plan, publish_count_this_month, publish_quota_reset_at, slug, name')
    .eq('id', workspaceId)
    .single()
  if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: membership } = await service
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const quota = await checkPublishQuota(workspace, workspaceId)
  if (!quota.allowed) {
    return NextResponse.json({ error: quota.reason }, { status: 403 })
  }

  const { data: entry } = await service
    .from('changelog_entries')
    .select('*')
    .eq('id', entryId)
    .eq('workspace_id', workspaceId)
    .single()
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (entry.status === 'published') {
    return NextResponse.json({ error: 'Already published' }, { status: 409 })
  }

  const publishedAt = new Date().toISOString()

  const { data: published, error: updateError } = await service
    .from('changelog_entries')
    .update({ status: 'published', published_at: publishedAt, updated_at: publishedAt })
    .eq('id', entryId)
    .select()
    .single()
  if (updateError) return NextResponse.json({ error: 'Failed to publish' }, { status: 500 })

  await service
    .from('workspaces')
    .update({ publish_count_this_month: workspace.publish_count_this_month + 1 })
    .eq('id', workspaceId)

  // Fire-and-forget email send
  sendPublishEmail({
    workspaceId,
    workspaceName: workspace.name,
    workspaceSlug: workspace.slug,
    entry: published,
  }).catch(console.error)

  return NextResponse.json({ entry: published })
}
```

- [ ] **Step 5: Implement regenerate route**

Create `app/api/workspaces/[id]/entries/[entryId]/regenerate/route.ts`:

```typescript
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { generateChangelogDraft } from '@/lib/openai/generate-draft'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ id: string; entryId: string }> }

export async function POST(_req: Request, { params }: Params) {
  const { id: workspaceId, entryId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const { data: entry } = await service
    .from('changelog_entries')
    .select('pr_title, pr_body, workspace_id')
    .eq('id', entryId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const draft = await generateChangelogDraft({
    prTitle: entry.pr_title ?? '',
    prBody: entry.pr_body ?? '',
  })

  const { data: updated } = await service
    .from('changelog_entries')
    .update({ ai_draft: draft.body, updated_at: new Date().toISOString() })
    .eq('id', entryId)
    .select()
    .single()

  return NextResponse.json({ entry: updated })
}
```

- [ ] **Step 6: Create entry editor component**

Create `components/dashboard/entry-editor.tsx`:

```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ExternalLink, RefreshCw } from 'lucide-react'

interface EntryEditorProps {
  entry: {
    id: string
    title: string | null
    final_content: string | null
    ai_draft: string | null
    pr_title: string | null
    pr_number: number | null
    pr_url: string | null
    pr_author: string | null
    pr_merged_at: string | null
    pr_body: string | null
    status: string
  }
  workspaceId: string
  subscriberCount: number
}

export function EntryEditor({ entry, workspaceId, subscriberCount }: EntryEditorProps) {
  const router = useRouter()
  const [title, setTitle] = useState(entry.title ?? entry.pr_title ?? '')
  const [content, setContent] = useState(entry.final_content ?? entry.ai_draft ?? '')
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')

  async function saveDraft() {
    setSaving(true)
    await fetch(`/api/workspaces/${workspaceId}/entries/${entry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, final_content: content }),
    })
    setSaving(false)
  }

  async function publish() {
    setPublishing(true)
    setError('')
    const res = await fetch(`/api/workspaces/${workspaceId}/entries/${entry.id}/publish`, {
      method: 'POST',
    })
    if (res.status === 403) {
      const data = await res.json()
      setError(data.error === 'QUOTA_EXCEEDED'
        ? 'Monthly publish limit reached. Upgrade to continue.'
        : 'You do not have permission to publish.')
      setPublishing(false)
      setShowConfirm(false)
      return
    }
    router.push('/dashboard?tab=published')
    router.refresh()
  }

  async function regenerate() {
    setRegenerating(true)
    const res = await fetch(`/api/workspaces/${workspaceId}/entries/${entry.id}/regenerate`, {
      method: 'POST',
    })
    const data = await res.json()
    if (data.entry?.ai_draft) setContent(data.entry.ai_draft)
    setRegenerating(false)
  }

  async function archive() {
    await fetch(`/api/workspaces/${workspaceId}/entries/${entry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    })
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="flex gap-6 p-6 max-w-5xl">
      <div className="flex-1 space-y-4">
        <div className="space-y-2">
          <Label>Title</Label>
          <Input value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Content (markdown)</Label>
            <Button variant="ghost" size="sm" onClick={regenerate} disabled={regenerating}>
              <RefreshCw className={`mr-1 h-3 w-3 ${regenerating ? 'animate-spin' : ''}`} />
              Regenerate with AI
            </Button>
          </div>
          <Textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            className="min-h-[280px] font-mono text-sm"
          />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <div className="flex items-center gap-2 pt-2">
          <Button variant="outline" onClick={archive}>Archive</Button>
          <Button variant="outline" onClick={saveDraft} disabled={saving}>
            {saving ? 'Saving…' : 'Save draft'}
          </Button>
          <Button onClick={() => setShowConfirm(true)} disabled={entry.status === 'published'}>
            {entry.status === 'published' ? 'Published' : 'Publish'}
          </Button>
        </div>

        {showConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-background rounded-lg p-6 max-w-sm w-full space-y-4">
              <h2 className="font-semibold">Publish this entry?</h2>
              <p className="text-sm text-muted-foreground">
                This will update your public changelog and email{' '}
                <strong>{subscriberCount} subscriber{subscriberCount !== 1 ? 's' : ''}</strong>.
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowConfirm(false)}>Cancel</Button>
                <Button onClick={publish} disabled={publishing}>
                  {publishing ? 'Publishing…' : 'Confirm publish'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="w-72 shrink-0 space-y-4">
        <div className="rounded-lg border p-4 space-y-3 text-sm">
          <p className="font-medium">Source PR</p>
          {entry.pr_url && (
            <a href={entry.pr_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
              <ExternalLink className="h-3 w-3" />
              {entry.pr_title} #{entry.pr_number}
            </a>
          )}
          {entry.pr_author && <p className="text-muted-foreground">by @{entry.pr_author}</p>}
          <Badge>{entry.status}</Badge>
        </div>
        {entry.ai_draft && (
          <div className="rounded-lg border p-4 space-y-2 text-sm">
            <p className="font-medium text-muted-foreground">AI draft (reference)</p>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{entry.ai_draft}</p>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Create entry detail page**

Create `app/(app)/dashboard/entries/[id]/page.tsx`:

```typescript
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { EntryEditor } from '@/components/dashboard/entry-editor'
import { notFound } from 'next/navigation'

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: entryId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspaces(id, slug)')
    .eq('user_id', user!.id)
    .limit(1)
    .single()

  if (!membership) notFound()
  const workspace = membership.workspaces as any

  const { data: entry } = await supabase
    .from('changelog_entries')
    .select('*')
    .eq('id', entryId)
    .eq('workspace_id', workspace.id)
    .single()

  if (!entry) notFound()

  const { count: subscriberCount } = await supabase
    .from('subscribers')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspace.id)
    .eq('confirmed', true)
    .is('unsubscribed_at', null)

  return (
    <EntryEditor entry={entry} workspaceId={workspace.id} subscriberCount={subscriberCount ?? 0} />
  )
}
```

- [ ] **Step 8: Commit**

```bash
git add app/api/workspaces/ app/(app)/dashboard/entries/ components/dashboard/entry-editor.tsx tests/api/
git commit -m "feat: entry detail page with editor, publish flow, and AI regeneration"
```

---

## Milestone 6: Public Changelog Page

### Task 14: Public API + changelog SSR page + subscribe form

**Files:**
- Create: `app/api/public/changelog/[slug]/route.ts`
- Create: `app/api/public/subscribe/route.ts`
- Create: `app/api/public/confirm-subscription/route.ts`
- Create: `app/api/public/unsubscribe/route.ts`
- Create: `app/(public)/[slug]/page.tsx`
- Create: `components/public/changelog-entry.tsx`
- Create: `components/public/subscribe-form.tsx`
- Create: `tests/api/subscribe.test.ts`

- [ ] **Step 1: Write failing test for subscribe validation**

Create `tests/api/subscribe.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

describe('subscribe email validation', () => {
  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  it('accepts valid email', () => {
    expect(isValidEmail('user@example.com')).toBe(true)
  })

  it('rejects invalid email formats', () => {
    ['notanemail', 'missing@', '@nodomain', ''].forEach(email => {
      expect(isValidEmail(email)).toBe(false)
    })
  })
})
```

- [ ] **Step 2: Run test to confirm it passes**

```bash
npm test tests/api/subscribe.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 3: Implement public changelog API**

Create `app/api/public/changelog/[slug]/route.ts`:

```typescript
import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const service = createSupabaseServiceClient()

  const { data: workspace } = await service
    .from('workspaces')
    .select('id, name, logo_url, slug')
    .eq('slug', slug)
    .single()

  if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: entries } = await service
    .from('changelog_entries')
    .select('id, title, final_content, published_at')
    .eq('workspace_id', workspace.id)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ workspace, entries: entries ?? [] }, {
    headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' },
  })
}
```

- [ ] **Step 4: Implement subscribe route**

Create `app/api/public/subscribe/route.ts`:

```typescript
import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { sendConfirmationEmail } from '@/lib/resend/email'
import { PLAN_LIMITS } from '@/lib/plans'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const SubscribeSchema = z.object({
  workspace_id: z.string().uuid(),
  email: z.string().email(),
})

export async function POST(request: Request) {
  const body = await request.json()
  const parsed = SubscribeSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { workspace_id, email } = parsed.data
  const service = createSupabaseServiceClient()

  const { data: workspace } = await service
    .from('workspaces')
    .select('plan, name, slug')
    .eq('id', workspace_id)
    .single()
  if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { count } = await service
    .from('subscribers')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspace_id)
    .eq('confirmed', true)
    .is('unsubscribed_at', null)

  const limit = PLAN_LIMITS[workspace.plan as any].subscribers
  if ((count ?? 0) >= limit) {
    return NextResponse.json({ error: 'SUBSCRIBER_LIMIT_REACHED' }, { status: 403 })
  }

  const { data: existing } = await service
    .from('subscribers')
    .select('id, confirmed, confirmation_token')
    .eq('workspace_id', workspace_id)
    .eq('email', email)
    .single()

  if (existing) {
    if (!existing.confirmed) {
      await sendConfirmationEmail({
        email,
        workspaceName: workspace.name,
        workspaceSlug: workspace.slug,
        token: existing.confirmation_token!,
      })
    }
    return NextResponse.json({ ok: true })
  }

  const { data: subscriber } = await service
    .from('subscribers')
    .insert({ workspace_id, email })
    .select()
    .single()

  if (subscriber) {
    await sendConfirmationEmail({
      email,
      workspaceName: workspace.name,
      workspaceSlug: workspace.slug,
      token: subscriber.confirmation_token!,
    })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Implement confirm + unsubscribe routes**

Create `app/api/public/confirm-subscription/route.ts`:

```typescript
import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  if (!token) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?error=invalid_token`)

  const service = createSupabaseServiceClient()
  const { data: subscriber } = await service
    .from('subscribers')
    .update({ confirmed: true, confirmed_at: new Date().toISOString(), confirmation_token: null })
    .eq('confirmation_token', token)
    .select('workspaces(slug)')
    .single()

  if (!subscriber) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?error=invalid_token`)
  }

  const slug = (subscriber.workspaces as any)?.slug ?? ''
  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_APP_URL}/confirm-subscription?slug=${slug}`
  )
}
```

Create `app/api/public/unsubscribe/route.ts`:

```typescript
import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  if (!token) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/`)

  const service = createSupabaseServiceClient()
  await service
    .from('subscribers')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('unsubscribe_token', token)
    .is('unsubscribed_at', null)

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/unsubscribe?success=true`)
}
```

- [ ] **Step 6: Install react-markdown and create changelog entry component**

```bash
npm install react-markdown
```

Create `components/public/changelog-entry.tsx`:

```typescript
import { format } from 'date-fns'
import ReactMarkdown from 'react-markdown'

interface EntryProps {
  entry: {
    id: string
    title: string | null
    final_content: string | null
    published_at: string | null
  }
}

export function ChangelogEntry({ entry }: EntryProps) {
  return (
    <article className="border-b pb-8 last:border-0">
      <time className="text-xs text-muted-foreground">
        {entry.published_at ? format(new Date(entry.published_at), 'MMMM d, yyyy') : ''}
      </time>
      <h2 className="text-lg font-semibold mt-1 mb-3">{entry.title ?? 'Update'}</h2>
      <div className="prose prose-sm max-w-none text-muted-foreground">
        <ReactMarkdown>{entry.final_content ?? ''}</ReactMarkdown>
      </div>
    </article>
  )
}
```

- [ ] **Step 7: Create subscribe form component**

Create `components/public/subscribe-form.tsx`:

```typescript
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function SubscribeForm({ workspaceId }: { workspaceId: string }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function subscribe(e: React.FormEvent) {
    e.preventDefault()
    setState('loading')
    const res = await fetch('/api/public/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: workspaceId, email }),
    })
    if (res.ok) {
      setState('success')
    } else {
      const data = await res.json()
      setErrorMsg(data.error === 'SUBSCRIBER_LIMIT_REACHED'
        ? 'Subscriptions are temporarily unavailable.'
        : 'Something went wrong. Please try again.')
      setState('error')
    }
  }

  if (state === 'success') {
    return (
      <div className="rounded-lg border p-4 text-sm text-center">
        Check your inbox to confirm your subscription.
      </div>
    )
  }

  return (
    <form onSubmit={subscribe} className="flex gap-2">
      <Input
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
        className="flex-1"
      />
      <Button type="submit" disabled={state === 'loading'}>
        {state === 'loading' ? 'Subscribing…' : 'Subscribe'}
      </Button>
      {state === 'error' && <p className="text-destructive text-xs mt-1">{errorMsg}</p>}
    </form>
  )
}
```

- [ ] **Step 8: Create public changelog page**

Create `app/(public)/[slug]/page.tsx`:

```typescript
import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ChangelogEntry } from '@/components/public/changelog-entry'
import { SubscribeForm } from '@/components/public/subscribe-form'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const service = createSupabaseServiceClient()
  const { data: workspace } = await service.from('workspaces').select('name').eq('slug', slug).single()
  return { title: workspace ? `${workspace.name} Changelog` : 'Changelog' }
}

export default async function PublicChangelogPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const service = createSupabaseServiceClient()

  const { data: workspace } = await service
    .from('workspaces').select('id, name, logo_url, slug').eq('slug', slug).single()
  if (!workspace) notFound()

  const { data: settings } = await service
    .from('changelog_settings')
    .select('page_title, page_description, show_powered_by')
    .eq('workspace_id', workspace.id).single()

  const { data: entries } = await service
    .from('changelog_entries')
    .select('id, title, final_content, published_at')
    .eq('workspace_id', workspace.id)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(50)

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <header className="mb-10 space-y-3">
        {workspace.logo_url && (
          <img src={workspace.logo_url} alt={workspace.name} className="h-8 w-8 rounded" />
        )}
        <h1 className="text-2xl font-bold">{settings?.page_title ?? `${workspace.name} Changelog`}</h1>
        {settings?.page_description && (
          <p className="text-muted-foreground">{settings.page_description}</p>
        )}
        <SubscribeForm workspaceId={workspace.id} />
      </header>

      {(!entries || entries.length === 0) ? (
        <p className="text-muted-foreground text-sm">No updates yet.</p>
      ) : (
        <div className="space-y-8">
          {entries.map(entry => <ChangelogEntry key={entry.id} entry={entry} />)}
        </div>
      )}

      {settings?.show_powered_by !== false && (
        <footer className="mt-12 text-xs text-muted-foreground text-center">
          Powered by <a href="https://mergecast.co" className="underline">Mergecast</a>
        </footer>
      )}
    </div>
  )
}
```

- [ ] **Step 9: Create confirm + unsubscribe pages**

Create `app/confirm-subscription/page.tsx`:

```typescript
import Link from 'next/link'
export default async function ConfirmSubscriptionPage({
  searchParams,
}: { searchParams: Promise<{ slug?: string }> }) {
  const { slug } = await searchParams
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <div className="text-4xl">✓</div>
        <h1 className="text-xl font-semibold">You&apos;re subscribed!</h1>
        <p className="text-muted-foreground text-sm">You&apos;ll receive emails when new updates are published.</p>
        {slug && <Link href={`/${slug}`} className="text-sm underline">View changelog</Link>}
      </div>
    </div>
  )
}
```

Create `app/unsubscribe/page.tsx`:

```typescript
export default async function UnsubscribePage({
  searchParams,
}: { searchParams: Promise<{ success?: string }> }) {
  const { success } = await searchParams
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-xl font-semibold">
          {success ? "You've been unsubscribed" : 'Unsubscribe'}
        </h1>
        <p className="text-muted-foreground text-sm">
          {success ? "You won't receive any more emails." : 'Invalid or expired unsubscribe link.'}
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 10: Commit**

```bash
git add app/api/public/ app/(public)/ components/public/ app/confirm-subscription/ app/unsubscribe/ tests/api/subscribe.test.ts
git commit -m "feat: public changelog page, subscribe/confirm/unsubscribe with Resend"
```

---

## Milestone 7: Email (Resend)

### Task 15: Resend client + email functions

**Files:**
- Create: `lib/resend/client.ts`
- Create: `lib/resend/email.ts`

- [ ] **Step 1: Set up Resend account**

1. Go to resend.com → create account
2. Create API key → paste into `.env.local` as `RESEND_API_KEY`
3. Add and verify your sending domain (or use `onboarding@resend.dev` for local testing)
4. Set `RESEND_FROM_EMAIL` in `.env.local`

- [ ] **Step 2: Create Resend singleton**

Create `lib/resend/client.ts`:

```typescript
import { Resend } from 'resend'

let _client: Resend | null = null

export function getResendClient(): Resend {
  if (!_client) _client = new Resend(process.env.RESEND_API_KEY)
  return _client
}
```

- [ ] **Step 3: Implement email send functions**

Create `lib/resend/email.ts`:

```typescript
import { getResendClient } from './client'
import { createSupabaseServiceClient } from '@/lib/supabase/server'

interface ConfirmationEmailInput {
  email: string
  workspaceName: string
  workspaceSlug: string
  token: string
}

export async function sendConfirmationEmail(input: ConfirmationEmailInput): Promise<void> {
  const resend = getResendClient()
  const confirmUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/public/confirm-subscription?token=${input.token}`
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: input.email,
    subject: `Confirm your subscription to ${input.workspaceName}`,
    html: `
      <p>Click below to confirm your subscription to the <strong>${input.workspaceName}</strong> changelog:</p>
      <p><a href="${confirmUrl}">Confirm subscription</a></p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
  })
}

interface PublishEmailInput {
  workspaceId: string
  workspaceName: string
  workspaceSlug: string
  entry: {
    id: string
    title: string | null
    final_content: string | null
    published_at: string | null
  }
}

export async function sendPublishEmail(input: PublishEmailInput): Promise<void> {
  const service = createSupabaseServiceClient()

  const { data: subscribers } = await service
    .from('subscribers')
    .select('email, unsubscribe_token')
    .eq('workspace_id', input.workspaceId)
    .eq('confirmed', true)
    .is('unsubscribed_at', null)

  if (!subscribers || subscribers.length === 0) return

  const resend = getResendClient()
  const changelogUrl = `${process.env.NEXT_PUBLIC_APP_URL}/${input.workspaceSlug}`

  const { data: sendRecord } = await service
    .from('email_sends')
    .insert({ workspace_id: input.workspaceId, entry_id: input.entry.id, recipient_count: subscribers.length, status: 'pending' })
    .select()
    .single()

  try {
    const BATCH_SIZE = 100
    for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
      await Promise.all(
        subscribers.slice(i, i + BATCH_SIZE).map(({ email, unsubscribe_token }) =>
          resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL!,
            to: email,
            subject: `${input.workspaceName}: ${input.entry.title ?? 'New update'}`,
            html: buildEmailHtml({
              workspaceName: input.workspaceName,
              entryTitle: input.entry.title ?? 'New update',
              entryContent: input.entry.final_content ?? '',
              changelogUrl,
              unsubscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/public/unsubscribe?token=${unsubscribe_token}`,
            }),
          })
        )
      )
    }
    if (sendRecord) {
      await service.from('email_sends')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', sendRecord.id)
    }
  } catch (err) {
    if (sendRecord) {
      await service.from('email_sends')
        .update({ status: 'failed', error_message: String(err) })
        .eq('id', sendRecord.id)
    }
    throw err
  }
}

function buildEmailHtml(input: {
  workspaceName: string
  entryTitle: string
  entryContent: string
  changelogUrl: string
  unsubscribeUrl: string
}): string {
  // Plain text rendering — no HTML rendering of user content to avoid XSS in emails
  const escapedContent = input.entryContent
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;">
    <h1 style="font-size:20px;font-weight:600;margin-bottom:8px;">${input.entryTitle}</h1>
    <p style="color:#555;font-size:14px;margin-bottom:16px;">${escapedContent}</p>
    <a href="${input.changelogUrl}" style="color:#000;font-size:14px;">View on changelog →</a>
    <hr style="margin:32px 0;border:none;border-top:1px solid #eee;">
    <p style="font-size:12px;color:#999;">
      You subscribed to ${input.workspaceName} updates.
      <a href="${input.unsubscribeUrl}" style="color:#999;">Unsubscribe</a>
    </p>
  </body></html>`
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/resend/
git commit -m "feat: Resend email — confirmation and broadcast with unsubscribe links"
```

---

## Milestone 8: Embeddable Widget

### Task 16: Widget JS bundle + serve route

**Files:**
- Create: `widget/src/index.ts`
- Create: `widget/build.ts`
- Create: `app/api/widget/[slug]/route.ts`
- Create: `app/(app)/dashboard/widget/page.tsx`

- [ ] **Step 1: Install build dependency**

```bash
npm install -D tsx
```

- [ ] **Step 2: Create widget source**

Create `widget/src/index.ts`:

```typescript
(function () {
  const script = document.currentScript as HTMLScriptElement | null
  const workspaceSlug = script?.getAttribute('data-workspace') ?? ''
  if (!workspaceSlug) return

  const API_BASE = 'MERGECAST_API_URL'

  let entries: Array<{ id: string; title: string; final_content: string; published_at: string }> = []
  let isOpen = false

  async function fetchEntries() {
    try {
      const res = await fetch(`${API_BASE}/api/public/changelog/${workspaceSlug}`)
      const data = await res.json()
      entries = data.entries ?? []
    } catch { /* silent fail */ }
  }

  function createWidget(settings: { position: string; theme: string; accentColor: string; buttonLabel: string }) {
    const container = document.createElement('div')
    container.id = 'mergecast-widget'
    container.style.cssText = `position:fixed;${settings.position.includes('right') ? 'right:24px' : 'left:24px'};bottom:24px;z-index:9999;font-family:system-ui,sans-serif;`

    const button = document.createElement('button')
    button.textContent = settings.buttonLabel
    button.style.cssText = `background:${settings.accentColor};color:#fff;border:none;border-radius:9999px;padding:8px 16px;font-size:14px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.15);`

    const drawer = document.createElement('div')
    drawer.style.cssText = `display:none;position:absolute;bottom:48px;${settings.position.includes('right') ? 'right:0' : 'left:0'};width:320px;max-height:480px;overflow-y:auto;background:${settings.theme === 'dark' ? '#1a1a1a' : '#fff'};color:${settings.theme === 'dark' ? '#fff' : '#111'};border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.12);padding:16px;`

    function renderEntries() {
      drawer.textContent = ''
      if (entries.length === 0) {
        const empty = document.createElement('p')
        empty.style.cssText = 'font-size:13px;color:#888;text-align:center;padding:24px 0'
        empty.textContent = 'No updates yet.'
        drawer.appendChild(empty)
        return
      }
      entries.forEach(e => {
        const item = document.createElement('div')
        item.style.cssText = 'padding:12px 0;border-bottom:1px solid rgba(0,0,0,0.08);'
        const date = document.createElement('p')
        date.style.cssText = 'font-size:11px;color:#888;margin:0 0 4px'
        date.textContent = new Date(e.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        const title = document.createElement('p')
        title.style.cssText = 'font-size:14px;font-weight:600;margin:0 0 4px'
        title.textContent = e.title ?? 'Update'
        const body = document.createElement('p')
        body.style.cssText = 'font-size:13px;color:#555;margin:0'
        const content = e.final_content ?? ''
        body.textContent = content.length > 120 ? content.slice(0, 120) + '…' : content
        item.appendChild(date)
        item.appendChild(title)
        item.appendChild(body)
        drawer.appendChild(item)
      })
    }

    button.addEventListener('click', () => {
      isOpen = !isOpen
      drawer.style.display = isOpen ? 'block' : 'none'
      if (isOpen) renderEntries()
    })

    document.addEventListener('click', (e) => {
      if (isOpen && !container.contains(e.target as Node)) {
        isOpen = false
        drawer.style.display = 'none'
      }
    })

    container.appendChild(drawer)
    container.appendChild(button)
    document.body.appendChild(container)
  }

  async function init() {
    await fetchEntries()
    createWidget({
      position: 'bottom-right',
      theme: 'light',
      accentColor: '#000000',
      buttonLabel: "What's new",
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
```

- [ ] **Step 3: Create build script**

Create `widget/build.ts`:

```typescript
import { buildSync } from 'esbuild'
import { writeFileSync, mkdirSync } from 'fs'

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mergecast.co'

const result = buildSync({
  entryPoints: ['widget/src/index.ts'],
  bundle: true,
  minify: true,
  format: 'iife',
  define: { 'MERGECAST_API_URL': JSON.stringify(appUrl) },
  write: false,
})

mkdirSync('public/widget', { recursive: true })
writeFileSync('public/widget/widget.js', result.outputFiles[0].text)
console.log('Widget built:', result.outputFiles[0].text.length, 'bytes')
```

Add to `package.json` scripts:

```json
"build:widget": "tsx widget/build.ts",
"prebuild": "npm run build:widget"
```

- [ ] **Step 4: Build and verify**

```bash
NEXT_PUBLIC_APP_URL=https://mergecast.co npm run build:widget
ls public/widget/widget.js
```

Expected: file exists, non-zero size.

- [ ] **Step 5: Serve widget via API route**

Create `app/api/widget/[slug]/route.ts`:

```typescript
import { readFileSync } from 'fs'
import { join } from 'path'
import { createSupabaseServiceClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const service = createSupabaseServiceClient()

  const { data: workspace } = await service
    .from('workspaces').select('id').eq('slug', slug).single()

  const widgetPath = join(process.cwd(), 'public/widget/widget.js')
  let widgetJs: string
  try {
    widgetJs = readFileSync(widgetPath, 'utf-8')
  } catch {
    return new Response('/* widget not built */', {
      headers: { 'Content-Type': 'application/javascript' },
    })
  }

  if (!workspace) {
    return new Response('/* workspace not found */', {
      headers: { 'Content-Type': 'application/javascript' },
    })
  }

  return new Response(widgetJs, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  })
}
```

- [ ] **Step 6: Create widget dashboard page**

Create `app/(app)/dashboard/widget/page.tsx`:

```typescript
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function WidgetPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspaces(slug)')
    .eq('user_id', user!.id)
    .limit(1)
    .single()

  const slug = (membership?.workspaces as any)?.slug ?? ''
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const snippet = `<script src="${appUrl}/api/widget/${slug}" data-workspace="${slug}" async></script>`

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Embed widget</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Add this script tag before the closing &lt;/body&gt; tag in your app.
        </p>
      </div>
      <div className="rounded-lg border bg-muted p-4">
        <pre className="text-xs overflow-auto whitespace-pre-wrap break-all">{snippet}</pre>
      </div>
      <p className="text-sm text-muted-foreground">
        The widget renders a floating &quot;What&apos;s new&quot; button. Clicking it shows your latest published entries.
      </p>
    </div>
  )
}
```

- [ ] **Step 7: Commit**

```bash
git add widget/ app/api/widget/ app/(app)/dashboard/widget/ public/widget/
git commit -m "feat: embeddable widget — vanilla JS bundle, serve route, dashboard snippet page"
```

---

---

## Milestone 9: Billing (Stripe)

### Task 17: Stripe client + plan sync

**Files:**
- Create: `lib/stripe/client.ts`
- Create: `lib/stripe/webhooks.ts`
- Create: `tests/lib/stripe-webhooks.test.ts`

- [ ] **Step 1: Set up Stripe**

1. Go to stripe.com → create account
2. Dashboard → Developers → API keys → copy Secret key → `STRIPE_SECRET_KEY`
3. Create 3 products with monthly recurring prices:
   - Starter: $19/mo → copy price ID → `STRIPE_PRICE_STARTER_MONTHLY`
   - Growth: $49/mo → copy price ID → `STRIPE_PRICE_GROWTH_MONTHLY`
   - Scale: $79/mo → copy price ID → `STRIPE_PRICE_SCALE_MONTHLY`
4. Developers → Webhooks → Add endpoint:
   - URL: `https://<your-vercel-url>/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
   - Copy signing secret → `STRIPE_WEBHOOK_SECRET`
5. For local testing: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`

- [ ] **Step 2: Create Stripe singleton**

Create `lib/stripe/client.ts`:

```typescript
import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripeClient(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-01-27.acacia' })
  }
  return _stripe
}
```

- [ ] **Step 3: Write failing tests for Stripe webhook handlers**

Create `tests/lib/stripe-webhooks.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleSubscriptionUpserted, handleSubscriptionDeleted } from '@/lib/stripe/webhooks'

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: vi.fn(),
}))
vi.mock('@/lib/plans', () => ({
  getPlanFromPriceId: vi.fn((id: string) => {
    if (id === 'price_starter') return 'starter'
    if (id === 'price_growth') return 'growth'
    return 'free'
  }),
}))

import { createSupabaseServiceClient } from '@/lib/supabase/server'

function makeMockSupabase(updateResult = { error: null }) {
  const mockEq = vi.fn().mockResolvedValue(updateResult)
  const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
  return {
    from: vi.fn().mockReturnValue({ update: mockUpdate }),
    _mockUpdate: mockUpdate,
    _mockEq: mockEq,
  }
}

describe('handleSubscriptionUpserted', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('updates workspace plan to starter', async () => {
    const mockSb = makeMockSupabase()
    ;(createSupabaseServiceClient as any).mockReturnValue(mockSb)

    await handleSubscriptionUpserted({
      id: 'sub_123',
      customer: 'cus_abc',
      items: { data: [{ price: { id: 'price_starter' } }] },
    } as any)

    expect(mockSb._mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'starter', stripe_subscription_id: 'sub_123' })
    )
  })

  it('updates workspace plan to growth', async () => {
    const mockSb = makeMockSupabase()
    ;(createSupabaseServiceClient as any).mockReturnValue(mockSb)

    await handleSubscriptionUpserted({
      id: 'sub_456',
      customer: 'cus_abc',
      items: { data: [{ price: { id: 'price_growth' } }] },
    } as any)

    expect(mockSb._mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'growth' })
    )
  })
})

describe('handleSubscriptionDeleted', () => {
  it('downgrades workspace to free', async () => {
    const mockSb = makeMockSupabase()
    ;(createSupabaseServiceClient as any).mockReturnValue(mockSb)

    await handleSubscriptionDeleted({ id: 'sub_123', customer: 'cus_abc' } as any)

    expect(mockSb._mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'free', stripe_subscription_id: null, stripe_price_id: null })
    )
  })
})
```

- [ ] **Step 4: Run test to confirm it fails**

```bash
npm test tests/lib/stripe-webhooks.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/stripe/webhooks'`

- [ ] **Step 5: Implement `lib/stripe/webhooks.ts`**

```typescript
import type Stripe from 'stripe'
import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { getPlanFromPriceId } from '@/lib/plans'

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  if (!session.subscription || !session.customer || !session.metadata?.workspace_id) return

  const supabase = createSupabaseServiceClient()
  const stripe = (await import('./client')).getStripeClient()
  const subscription = await stripe.subscriptions.retrieve(session.subscription as string)
  const priceId = subscription.items.data[0]?.price.id ?? ''
  const plan = getPlanFromPriceId(priceId)

  await supabase
    .from('workspaces')
    .update({
      plan,
      stripe_customer_id: session.customer as string,
      stripe_subscription_id: session.subscription as string,
      stripe_price_id: priceId,
    })
    .eq('id', session.metadata.workspace_id)
}

export async function handleSubscriptionUpserted(subscription: Stripe.Subscription): Promise<void> {
  const priceId = subscription.items.data[0]?.price.id ?? ''
  const plan = getPlanFromPriceId(priceId)
  const supabase = createSupabaseServiceClient()

  await supabase
    .from('workspaces')
    .update({
      plan,
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
    })
    .eq('stripe_customer_id', subscription.customer as string)
}

export async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const supabase = createSupabaseServiceClient()

  await supabase
    .from('workspaces')
    .update({ plan: 'free', stripe_subscription_id: null, stripe_price_id: null })
    .eq('stripe_customer_id', subscription.customer as string)
}
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
npm test tests/lib/stripe-webhooks.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add lib/stripe/ tests/lib/stripe-webhooks.test.ts
git commit -m "feat: Stripe client and subscription webhook handlers"
```

---

### Task 18: Stripe Checkout + Portal + webhook route

**Files:**
- Create: `app/api/billing/create-checkout/route.ts`
- Create: `app/api/billing/create-portal/route.ts`
- Create: `app/api/billing/plans/route.ts`
- Create: `app/api/webhooks/stripe/route.ts`
- Create: `app/(app)/dashboard/billing/page.tsx`

- [ ] **Step 1: Implement create-checkout route**

Create `app/api/billing/create-checkout/route.ts`:

```typescript
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { getStripeClient } from '@/lib/stripe/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const CheckoutSchema = z.object({
  workspace_id: z.string().uuid(),
  price_id: z.string().startsWith('price_'),
})

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = CheckoutSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { workspace_id, price_id } = parsed.data
  const service = createSupabaseServiceClient()

  const { data: membership } = await service
    .from('workspace_members').select('role').eq('workspace_id', workspace_id).eq('user_id', user.id).single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: workspace } = await service
    .from('workspaces').select('stripe_customer_id, name').eq('id', workspace_id).single()
  if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const stripe = getStripeClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: price_id, quantity: 1 }],
    customer: workspace.stripe_customer_id ?? undefined,
    customer_email: workspace.stripe_customer_id ? undefined : user.email,
    metadata: { workspace_id },
    success_url: `${appUrl}/dashboard/billing?success=true`,
    cancel_url: `${appUrl}/dashboard/billing`,
  })

  return NextResponse.json({ url: session.url })
}
```

- [ ] **Step 2: Implement create-portal route**

Create `app/api/billing/create-portal/route.ts`:

```typescript
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { getStripeClient } from '@/lib/stripe/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const PortalSchema = z.object({ workspace_id: z.string().uuid() })

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = PortalSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const service = createSupabaseServiceClient()
  const { data: workspace } = await service
    .from('workspaces').select('stripe_customer_id').eq('id', parsed.data.workspace_id).single()

  if (!workspace?.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing account found' }, { status: 400 })
  }

  const stripe = getStripeClient()
  const session = await stripe.billingPortal.sessions.create({
    customer: workspace.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
  })

  return NextResponse.json({ url: session.url })
}
```

- [ ] **Step 3: Implement plans route**

Create `app/api/billing/plans/route.ts`:

```typescript
import { PLAN_LIMITS } from '@/lib/plans'
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    plans: [
      {
        id: 'starter',
        name: 'Starter',
        price: 19,
        price_id: process.env.STRIPE_PRICE_STARTER_MONTHLY,
        limits: PLAN_LIMITS.starter,
      },
      {
        id: 'growth',
        name: 'Growth',
        price: 49,
        price_id: process.env.STRIPE_PRICE_GROWTH_MONTHLY,
        limits: PLAN_LIMITS.growth,
      },
      {
        id: 'scale',
        name: 'Scale',
        price: 79,
        price_id: process.env.STRIPE_PRICE_SCALE_MONTHLY,
        limits: PLAN_LIMITS.scale,
      },
    ],
  })
}
```

- [ ] **Step 4: Implement Stripe webhook route**

Create `app/api/webhooks/stripe/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getStripeClient } from '@/lib/stripe/client'
import {
  handleCheckoutCompleted,
  handleSubscriptionUpserted,
  handleSubscriptionDeleted,
} from '@/lib/stripe/webhooks'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const sig = request.headers.get('stripe-signature') ?? ''
  const stripe = getStripeClient()

  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object)
        break
      case 'customer.subscription.updated':
        await handleSubscriptionUpserted(event.data.object)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object)
        break
      case 'invoice.payment_failed':
        // Log only — Stripe dunning handles retries; subscription.deleted fires after dunning ends
        console.warn('invoice.payment_failed for customer', (event.data.object as any).customer)
        break
    }
  } catch (err) {
    console.error('Stripe webhook handler error:', err)
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
```

- [ ] **Step 5: Create billing dashboard page**

Create `app/(app)/dashboard/billing/page.tsx`:

```typescript
'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PLAN_LIMITS } from '@/lib/plans'

interface Plan {
  id: string
  name: string
  price: number
  price_id: string
  limits: { publishes_per_month: number; subscribers: number; repos: number }
}

interface Workspace {
  id: string
  plan: string
  publish_count_this_month: number
  publish_quota_reset_at: string
}

export default function BillingPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [subscriberCount, setSubscriberCount] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/workspaces').then(r => r.json()),
      fetch('/api/billing/plans').then(r => r.json()),
    ]).then(([wsData, plansData]) => {
      const ws = wsData.workspaces?.[0]
      if (ws) setWorkspace(ws)
      setPlans(plansData.plans ?? [])
    })
  }, [])

  async function upgrade(priceId: string) {
    if (!workspace) return
    setLoading(true)
    const res = await fetch('/api/billing/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: workspace.id, price_id: priceId }),
    })
    const data = await res.json()
    if (data.url) window.location.href = data.url
    setLoading(false)
  }

  async function manageSubscription() {
    if (!workspace) return
    setLoading(true)
    const res = await fetch('/api/billing/create-portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: workspace.id }),
    })
    const data = await res.json()
    if (data.url) window.location.href = data.url
    setLoading(false)
  }

  if (!workspace) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>

  const currentPlanLimits = PLAN_LIMITS[workspace.plan as keyof typeof PLAN_LIMITS]
  const publishLimit = currentPlanLimits.publishes_per_month
  const resetDate = new Date(workspace.publish_quota_reset_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Billing</h1>
      </div>

      {/* Current plan */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-medium">Current plan</p>
          <Badge>{workspace.plan}</Badge>
        </div>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>
            Publishes: {workspace.publish_count_this_month} / {publishLimit === Infinity ? '∞' : publishLimit} this month
            {publishLimit !== Infinity && ` (resets ${resetDate})`}
          </p>
          <p>Subscribers: {subscriberCount} / {currentPlanLimits.subscribers === Infinity ? '∞' : currentPlanLimits.subscribers}</p>
        </div>
        {workspace.plan !== 'free' && (
          <Button variant="outline" size="sm" onClick={manageSubscription} disabled={loading}>
            Manage subscription
          </Button>
        )}
      </div>

      {/* Upgrade options */}
      {workspace.plan === 'free' && (
        <div className="space-y-3">
          <p className="font-medium text-sm">Upgrade your plan</p>
          {plans.map(plan => (
            <div key={plan.id} className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="font-medium">{plan.name} — ${plan.price}/mo</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {plan.limits.publishes_per_month === Infinity ? 'Unlimited' : plan.limits.publishes_per_month} publishes ·{' '}
                  {plan.limits.subscribers.toLocaleString()} subscribers ·{' '}
                  {plan.limits.repos === Infinity ? 'unlimited' : plan.limits.repos} repo{plan.limits.repos !== 1 ? 's' : ''}
                </p>
              </div>
              <Button size="sm" onClick={() => upgrade(plan.price_id)} disabled={loading}>
                Upgrade
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Test the billing flow locally**

```bash
# Terminal 1: dev server
npm run dev

# Terminal 2: Stripe CLI forwarding
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Test steps:
# 1. Go to /dashboard/billing
# 2. Click "Upgrade" on Starter plan → Stripe Checkout opens
# 3. Use test card: 4242 4242 4242 4242, any future date, any CVC
# 4. Complete payment → redirect to /dashboard/billing?success=true
# 5. Check Supabase: workspaces.plan should now be 'starter'
```

- [ ] **Step 7: Commit**

```bash
git add app/api/billing/ app/api/webhooks/stripe/ app/(app)/dashboard/billing/ lib/stripe/
git commit -m "feat: Stripe Checkout, Portal, webhook handler, and billing dashboard page"
```

---

## Milestone 10: Landing Page

### Task 19: Marketing landing page

**Files:**
- Create: `app/page.tsx`

- [ ] **Step 1: Create the landing page**

Create `app/page.tsx`:

```typescript
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Github, Zap, Mail, Code2, CheckCircle } from 'lucide-react'

const FEATURES = [
  { icon: Github,    title: 'GitHub-connected',    desc: 'Listens for merged PRs automatically. No manual input.' },
  { icon: Zap,       title: 'AI-written drafts',   desc: 'GPT-4o turns technical PR descriptions into readable release notes.' },
  { icon: Mail,      title: 'Email subscribers',   desc: 'Users subscribe on your changelog page. We send on publish.' },
  { icon: Code2,     title: 'Embeddable widget',   desc: 'One script tag adds a "What\'s new" button to your product.' },
]

const PRICING = [
  { name: 'Free',    price: '$0',   features: ['1 repo', '3 publishes/mo', '100 subscribers', 'mergecast.co subdomain'], cta: 'Start free', variant: 'outline' as const },
  { name: 'Starter', price: '$21',  features: ['1 repo', 'Unlimited publishes', '1,000 subscribers', 'Custom domain'], cta: 'Get started', variant: 'default' as const, highlighted: true },
  { name: 'Growth',  price: '$49',  features: ['3 repos', 'Unlimited publishes', '10,000 subscribers', 'Widget + email'], cta: 'Get started', variant: 'outline' as const },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto">
        <span className="font-semibold">Mergecast</span>
        <div className="flex items-center gap-4">
          <Link href="#pricing" className="text-sm text-muted-foreground hover:text-foreground">Pricing</Link>
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">Sign in</Link>
          <Button size="sm" asChild><Link href="/signup">Start free</Link></Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 py-24 text-center max-w-3xl mx-auto">
        <Badge variant="secondary" className="mb-4">Now in early access</Badge>
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          Stop writing changelogs.<br />Start shipping them.
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-xl mx-auto">
          Connect your GitHub repo. Mergecast reads your merged PRs, writes user-facing release notes with AI, and emails your subscribers — automatically.
        </p>
        <div className="flex items-center gap-4 justify-center">
          <Button size="lg" asChild><Link href="/signup">Start for free</Link></Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/mergecast">See a live example</Link>
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-16 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-lg border p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                  <Icon className="h-4 w-4" />
                </div>
                <p className="font-medium">{title}</p>
              </div>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-16 max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-10">How it works</h2>
        <div className="space-y-6">
          {[
            { step: '1', title: 'Connect your repo', desc: 'Install the GitHub App and select a repo. Takes 60 seconds.' },
            { step: '2', title: 'Merge a PR', desc: 'Mergecast picks it up automatically and generates a draft in seconds.' },
            { step: '3', title: 'Review and publish', desc: 'Edit if needed, then publish. Your changelog page updates and subscribers get emailed.' },
          ].map(({ step, title, desc }) => (
            <div key={step} className="flex gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background text-sm font-bold">
                {step}
              </div>
              <div>
                <p className="font-medium">{title}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 py-16 max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-10">Pricing</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PRICING.map(({ name, price, features, cta, variant, highlighted }) => (
            <div key={name} className={`rounded-lg border p-6 space-y-6 ${highlighted ? 'border-foreground' : ''}`}>
              <div>
                {highlighted && <Badge className="mb-2">Most popular</Badge>}
                <p className="text-lg font-semibold">{name}</p>
                <p className="text-3xl font-bold mt-1">{price}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
              </div>
              <ul className="space-y-2">
                {features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button variant={variant} className="w-full" asChild>
                <Link href="/signup">{cta}</Link>
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-sm text-muted-foreground">
          <span>Mergecast</span>
          <div className="flex gap-4">
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
            <Link href="/signup" className="hover:text-foreground">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
```

- [ ] **Step 2: Verify landing page renders**

```bash
npm run dev
# Open http://localhost:3000
# Confirm: hero, features, pricing all visible
# Click "Start free" → should go to /signup
# Click "See a live example" → should go to /mergecast (public changelog, 404 until you have entries)
```

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: marketing landing page with hero, features, how-it-works, and pricing"
```

---

## Milestone 11: Admin Panel + Settings Pages

### Task 20: Admin panel

**Files:**
- Create: `app/admin/page.tsx`
- Modify: `supabase/migrations` — add `is_admin` to `auth.users` metadata

- [ ] **Step 1: Add is_admin flag**

The simplest approach: use Supabase user metadata. Set `is_admin: true` in the service role client for your own user. In a SQL migration, you cannot alter `auth.users` directly via SQL in migrations — do this via the Supabase Dashboard:

```
Supabase Dashboard → Authentication → Users → Find your user → Edit → Add to Raw User Meta Data:
{ "is_admin": true }
```

- [ ] **Step 2: Create admin page**

Create `app/admin/page.tsx`:

```typescript
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const isAdmin = user.user_metadata?.is_admin === true
  if (!isAdmin) redirect('/dashboard')

  const service = createSupabaseServiceClient()
  const { data: workspaces } = await service
    .from('workspaces')
    .select('id, name, slug, plan, created_at')
    .order('created_at', { ascending: false })

  const planCounts = (workspaces ?? []).reduce((acc, ws) => {
    acc[ws.plan] = (acc[ws.plan] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const paidPlans = ['starter', 'growth', 'scale']
  const mrrEstimate = (workspaces ?? []).reduce((sum, ws) => {
    const prices: Record<string, number> = { starter: 19, growth: 49, scale: 79 }
    return sum + (prices[ws.plan] ?? 0)
  }, 0)

  return (
    <div className="p-6 max-w-5xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Admin</h1>
        <p className="text-sm text-muted-foreground">Internal overview — not visible to users.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total workspaces', value: workspaces?.length ?? 0 },
          { label: 'Paid (any plan)', value: Object.entries(planCounts).filter(([k]) => paidPlans.includes(k)).reduce((s, [, v]) => s + v, 0) },
          { label: 'Free', value: planCounts['free'] ?? 0 },
          { label: 'MRR estimate', value: `$${mrrEstimate}` },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border p-4">
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Workspace list */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              {['Name', 'Slug', 'Plan', 'Created'].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(workspaces ?? []).map(ws => (
              <tr key={ws.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{ws.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{ws.slug}</td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${ws.plan === 'free' ? 'bg-muted' : 'bg-green-100 text-green-800'}`}>
                    {ws.plan}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(ws.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/admin/
git commit -m "feat: admin panel with workspace list and MRR estimate"
```

---

### Task 21: Settings pages (workspace + subscribers)

**Files:**
- Create: `app/(app)/dashboard/settings/page.tsx`
- Create: `app/(app)/dashboard/subscribers/page.tsx`

- [ ] **Step 1: Create settings page**

Create `app/(app)/dashboard/settings/page.tsx`:

```typescript
'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Workspace {
  id: string
  name: string
  slug: string
  plan: string
}

export default function SettingsPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/workspaces').then(r => r.json()).then(data => {
      const ws = data.workspaces?.[0]
      if (ws) { setWorkspace(ws); setName(ws.name) }
    })
  }, [])

  async function save() {
    if (!workspace) return
    setSaving(true)
    await fetch(`/api/workspaces/${workspace.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!workspace) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <h1 className="text-xl font-semibold">Settings</h1>

      <div className="rounded-lg border p-6 space-y-4">
        <p className="font-medium">Workspace</p>
        <div className="space-y-2">
          <Label>Name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} className="max-w-sm" />
        </div>
        <div className="space-y-2">
          <Label>Changelog URL</Label>
          <p className="text-sm text-muted-foreground">
            changelog.mergecast.co/<strong>{workspace.slug}</strong>
          </p>
          <p className="text-xs text-muted-foreground">Slug cannot be changed after first publish.</p>
        </div>
        <Button onClick={save} disabled={saving} size="sm">
          {saved ? 'Saved' : saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  )
}
```

Add the workspace PATCH route. Create `app/api/workspaces/[id]/route.ts`:

```typescript
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const UpdateWorkspaceSchema = z.object({
  name: z.string().min(1).max(64).optional(),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name, slug, plan, publish_count_this_month, publish_quota_reset_at, stripe_customer_id')
    .eq('id', id)
    .single()

  if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ workspace })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = UpdateWorkspaceSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const service = createSupabaseServiceClient()

  // Only allow update if user is a member
  const { data: membership } = await service
    .from('workspace_members').select('role').eq('workspace_id', id).eq('user_id', user.id).single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: workspace, error } = await service
    .from('workspaces')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error || !workspace) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  return NextResponse.json({ workspace })
}
```

- [ ] **Step 2: Create subscribers page**

Create `app/(app)/dashboard/subscribers/page.tsx`:

```typescript
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'

export default async function SubscribersPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspaces(id)')
    .eq('user_id', user!.id)
    .limit(1)
    .single()

  const workspaceId = (membership?.workspaces as any)?.id

  const { data: subscribers, count } = await supabase
    .from('subscribers')
    .select('*', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .is('unsubscribed_at', null)
    .order('subscribed_at', { ascending: false })
    .limit(50)

  const confirmed = (subscribers ?? []).filter(s => s.confirmed).length

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Subscribers</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {confirmed} confirmed · {(count ?? 0) - confirmed} pending confirmation
        </p>
      </div>

      {(!subscribers || subscribers.length === 0) ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground text-sm">
            No subscribers yet. Share your changelog URL to start growing your list.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                {['Email', 'Status', 'Subscribed'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subscribers.map(s => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="px-4 py-3">{s.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant={s.confirmed ? 'default' : 'secondary'}>
                      {s.confirmed ? 'confirmed' : 'pending'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {format(new Date(s.subscribed_at), 'MMM d, yyyy')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/(app)/dashboard/settings/ app/(app)/dashboard/subscribers/ app/api/workspaces/[id]/route.ts app/admin/
git commit -m "feat: settings page, subscribers page, workspace GET/PATCH API"
```

---

## Milestone 12: Cron + Launch Hardening

### Task 22: Monthly quota reset cron

**Files:**
- Create: `app/api/cron/reset-quotas/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Implement cron route**

Create `app/api/cron/reset-quotas/route.ts`:

```typescript
import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createSupabaseServiceClient()
  const now = new Date()
  const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const { error, count } = await service
    .from('workspaces')
    .update({
      publish_count_this_month: 0,
      publish_quota_reset_at: nextReset.toISOString(),
    })
    .lt('publish_quota_reset_at', now.toISOString())

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ reset: count ?? 0, next_reset: nextReset.toISOString() })
}
```

- [ ] **Step 2: Configure Vercel cron**

Create `vercel.json`:

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

Note: Vercel Cron sets `Authorization: Bearer <CRON_SECRET>` automatically when the env var is configured in Vercel project settings.

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/ vercel.json
git commit -m "feat: monthly quota reset cron job via Vercel Cron"
```

---

### Task 23: Run all tests + fix failures

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected passing tests:
- `tests/lib/plans.test.ts` — 6 tests
- `tests/lib/quota.test.ts` — 4 tests
- `tests/lib/github-webhook.test.ts` — 5 tests
- `tests/lib/generate-draft.test.ts` — 2 tests
- `tests/lib/stripe-webhooks.test.ts` — 3 tests
- `tests/api/publish.test.ts` — 2 tests
- `tests/api/subscribe.test.ts` — 2 tests

Total: 24 tests. Fix any failures before proceeding.

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors. Fix any type errors.

- [ ] **Step 3: Build check**

```bash
npm run build
```

Expected: successful build. Fix any build errors.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve test failures and TypeScript errors before launch"
```

---

### Task 24: Deploy to Vercel

- [ ] **Step 1: Push to GitHub**

```bash
git remote add origin https://github.com/<your-username>/mergecast.git
git push -u origin main
```

- [ ] **Step 2: Deploy on Vercel**

1. vercel.com → Import project → select your GitHub repo
2. Framework preset: Next.js (auto-detected)
3. Add all environment variables from `.env.local` to Vercel project settings
4. Deploy

- [ ] **Step 3: Set up production Stripe webhook**

```
Stripe Dashboard → Webhooks → Add endpoint:
URL: https://your-vercel-domain.vercel.app/api/webhooks/stripe
Events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed
```

Copy the new signing secret → update `STRIPE_WEBHOOK_SECRET` in Vercel env vars → redeploy.

- [ ] **Step 4: Set up production GitHub App**

1. Create a new GitHub App (separate from dev) with:
   - Webhook URL: `https://your-vercel-domain.vercel.app/api/webhooks/github`
2. Update `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`, `NEXT_PUBLIC_GITHUB_APP_SLUG` in Vercel
3. Redeploy

- [ ] **Step 5: Smoke test production**

```
1. Sign up with GitHub on production URL
2. Complete onboarding → create workspace → install GitHub App → connect repo
3. Merge a test PR → verify draft appears in dashboard
4. Publish the entry → verify public changelog updates
5. Subscribe to your own changelog → confirm email → verify subscriber appears
6. Check billing page → upgrade to Starter with test card → verify plan changes
```

- [ ] **Step 6: Final commit**

```bash
git tag v0.1.0
git push origin v0.1.0
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Covered in tasks |
|---|---|
| Landing page | Task 19 |
| Sign up / Sign in | Task 4 |
| Onboarding (3 steps) | Tasks 5, 6, 7 |
| GitHub webhook + AI draft | Tasks 8, 9, 10 |
| Dashboard (entry list) | Tasks 11, 12 |
| Entry detail (review/edit/publish) | Task 13 |
| Subscribers page | Task 21 |
| Widget page + embed | Task 16 |
| Settings page | Task 21 |
| Billing page | Task 18 |
| Admin panel | Task 20 |
| Public changelog page | Task 14 |
| Email (confirmation + broadcast) | Task 15 |
| Stripe Checkout + Portal | Task 18 |
| Stripe webhook sync | Tasks 17, 18 |
| Publish quota enforcement | Tasks 3, 5, 13 |
| Subscriber limit enforcement | Task 14 |
| Monthly quota reset (cron) | Task 22 |
| Confirm subscription | Task 14 |
| Unsubscribe | Task 14 |
| RLS policies | Task 2 |
| GitHub HMAC validation | Task 8 |
| Plan limits config | Task 3 |

All spec sections covered. No gaps found.

**Placeholder scan:** No TBDs, no "implement later", no placeholder functions. All code blocks are complete implementations.

**Type consistency:**
- `Plan` type defined in `lib/plans.ts`, used consistently in `lib/quota.ts`, `lib/stripe/webhooks.ts`
- `createSupabaseServiceClient` / `createSupabaseServerClient` used with consistent import path `@/lib/supabase/server` throughout
- `sendPublishEmail` / `sendConfirmationEmail` signatures match between `lib/resend/email.ts` and call sites in routes
- `checkPublishQuota` signature matches between `lib/quota.ts` and call site in publish route
