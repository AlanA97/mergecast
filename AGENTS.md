<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Commands

```bash
bun dev              # Start dev server (port 3000)
bun run build        # Build (auto-runs build:widget first via prebuild hook)
bun run build:widget # Bundle widget → public/widget/widget.js (esbuild IIFE)
bun run test         # Run Vitest tests once
bun run test:watch   # Vitest in watch mode
bun run lint         # ESLint
```

## Architecture

```
app/                  # Next.js App Router — (auth), (app)/dashboard, (public)/[slug], api/, admin/
components/           # ui/ (shadcn), dashboard/, public/
lib/                  # Integrations: supabase/, github/, openai/, stripe/, resend/, plans.ts, quota.ts
widget/               # Vanilla JS embeddable changelog drawer (esbuild → public/widget/widget.js)
tests/                # Vitest — mirrors lib/ and api/ structure
supabase/migrations/  # 4 SQL migration files (001_schema, 002_functions, 003_rls, 004_repos_webhook_id)
```

Key integrations (all in `lib/`): **Supabase** (auth + DB + RLS), **OpenAI GPT-4o** (AI drafts), **Stripe** (billing), **GitHub App** (webhook → draft), **Resend** (double opt-in email).

## Gotchas

- **Widget prebuild**: `bun run build` runs `build:widget` first; editing widget source requires `bun run build:widget` to see changes.
- **GITHUB_APP_PRIVATE_KEY**: Must be base64-encoded PEM — decoded at runtime.
- **Supabase clients**: Use `createSupabaseServerClient()` (cookie auth) for normal ops; `createSupabaseServiceClient()` (service role) for admin ops only — never expose service role key to client.
- **Middleware**: `middleware.ts` (not proxy.ts) runs session refresh and auth redirects. Its matcher excludes widget, API webhooks, and cron routes to avoid breaking unauthenticated access.
- **Cron auth**: `GET /api/cron/reset-quotas` — Vercel Cron sends `Authorization: Bearer {CRON_SECRET}`; the route checks this header. Method is GET, not POST.
- **Plan quotas**: Published entries per month are hard-enforced in `lib/quota.ts`; reset via Vercel cron on the 1st.
- **Email subscriptions**: Double opt-in — subscribers are `confirmed = false` until they click the confirmation link.

## Testing

Vitest with jsdom. Tests in `tests/lib/` (unit) and `tests/api/` (route handler integration). Run `bun run test` before pushing.
