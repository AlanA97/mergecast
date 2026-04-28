# Mergecast v1.1 — Defensibility Sprint Implementation Plan

> **Status: ✅ Completed** — All tasks implemented and merged to `main`.  
> Note: `003_view_count_and_ignore_rules.sql` referenced here was absorbed into the consolidated baseline migrations.  
> The canonical schema is now: `001_schema.sql`, `002_functions.sql`, `003_rls.sql`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six targeted improvements that fix product completeness gaps and create genuine retention and distribution mechanisms: PR ignore rules, entry view analytics, RSS feed, "Powered by Mergecast" settings toggle, approaching-limit conversion banner, and a widget-first landing page rewrite.

**Architecture:** All features build on the existing Next.js 16 App Router + Supabase stack. One new database migration adds `view_count` to `changelog_entries` and creates the `pr_ignore_rules` table. Pure business logic (ignore rule matching) is extracted into a unit-testable lib module. API routes follow the existing pattern: zod validation + membership check + service client. All tests use Vitest.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + service client), Vitest, Tailwind CSS, date-fns, zod

---

## File Map

**Create:**
- `supabase/migrations/003_view_count_and_ignore_rules.sql`
- `lib/github/ignore-rules.ts` — pure matching logic, no DB access
- `app/api/workspaces/[id]/ignore-rules/route.ts` — GET + POST
- `app/api/workspaces/[id]/ignore-rules/[ruleId]/route.ts` — DELETE
- `app/api/workspaces/[id]/changelog-settings/route.ts` — GET + PATCH
- `app/(public)/[slug]/rss.xml/route.ts` — RSS 2.0 feed
- `tests/lib/github/ignore-rules.test.ts`
- `tests/api/ignore-rules.test.ts`
- `tests/api/rss.test.ts`

**Modify:**
- `lib/github/webhook.ts` — add `labels` to `ParsedPullRequest`
- `tests/lib/github/webhook.test.ts` — update snapshot + add label test
- `app/api/webhooks/github/route.ts` — check ignore rules before creating draft
- `app/api/workspaces/route.ts` — seed default ignore rules on workspace creation
- `app/(public)/[slug]/page.tsx` — fire non-blocking view count RPC, add RSS link in metadata
- `app/(app)/dashboard/page.tsx` — approaching-limit banner
- `components/dashboard/entry-card.tsx` — show view count
- `components/dashboard/entry-editor.tsx` — show view count in right panel
- `app/(app)/dashboard/settings/page.tsx` — ignore rules UI + show_powered_by toggle
- `app/page.tsx` — widget-first hero rewrite

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/003_view_count_and_ignore_rules.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/003_view_count_and_ignore_rules.sql`:

```sql
-- Add view tracking to changelog entries
ALTER TABLE changelog_entries ADD COLUMN view_count INT NOT NULL DEFAULT 0;

-- Bulk-increment helper (called fire-and-forget from SSR pages)
CREATE OR REPLACE FUNCTION increment_entry_views(entry_ids UUID[])
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE changelog_entries
  SET view_count = view_count + 1
  WHERE id = ANY(entry_ids);
$$;

-- PR noise filter rules (per workspace)
CREATE TABLE pr_ignore_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  rule_type     TEXT NOT NULL CHECK (rule_type IN ('title_prefix', 'title_contains', 'label')),
  pattern       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, rule_type, pattern)
);

ALTER TABLE pr_ignore_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members can manage ignore rules"
  ON pr_ignore_rules
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ))
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));
```

- [ ] **Step 2: Apply migration to local Supabase**

```bash
npx supabase db push
# or if using the dashboard: paste the SQL into the SQL editor and run
```

Expected: no errors. If Supabase isn't running locally, apply via the Supabase Dashboard SQL editor instead.

- [ ] **Step 3: Verify TypeScript still compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors (new column picked up as optional in Supabase types on next type generation; `select('*')` queries will include it automatically).

---

## Task 2: Add `labels` to PR event parser

**Files:**
- Modify: `lib/github/webhook.ts`
- Modify: `tests/lib/github/webhook.test.ts`

- [ ] **Step 1: Update `ParsedPullRequest` interface and parser**

In `lib/github/webhook.ts`, replace the interface and parser:

```typescript
export interface ParsedPullRequest {
  prNumber: number
  prTitle: string
  prBody: string
  prUrl: string
  prAuthor: string
  prMergedAt: string
  repoId: number
  repoFullName: string
  labels: string[]          // ← new: GitHub label names on the PR
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsePullRequestEvent(payload: any): ParsedPullRequest | null {
  if (payload.action !== 'closed') return null
  if (!payload.pull_request?.merged) return null

  return {
    prNumber: payload.pull_request.number,
    prTitle: payload.pull_request.title ?? '',
    prBody: payload.pull_request.body ?? '',
    prUrl: payload.pull_request.html_url,
    prAuthor: payload.pull_request.user?.login ?? '',
    prMergedAt: payload.pull_request.merged_at,
    repoId: payload.repository.id,
    repoFullName: payload.repository.full_name,
    labels: (payload.pull_request.labels ?? []).map((l: any) => l.name as string),
  }
}
```

- [ ] **Step 2: Update the existing parsed-PR snapshot test**

In `tests/lib/github/webhook.test.ts`, update the `toEqual` assertion in `'returns parsed PR data for a merged PR'` to include `labels: []` (the existing test payload has no labels array):

```typescript
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
      labels: [],
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
    labels: [],
  })
})
```

Add a second case testing label extraction:

```typescript
it('extracts label names from the PR payload', () => {
  const payload = {
    action: 'closed',
    pull_request: {
      merged: true,
      number: 5,
      title: 'chore: bump deps',
      body: '',
      html_url: 'https://github.com/o/r/pull/5',
      user: { login: 'bot' },
      merged_at: '2026-04-22T10:00:00Z',
      labels: [{ name: 'dependencies' }, { name: 'automated' }],
    },
    repository: { id: 1, full_name: 'o/r' },
  }
  const result = parsePullRequestEvent(payload)
  expect(result?.labels).toEqual(['dependencies', 'automated'])
})
```

- [ ] **Step 3: Run webhook tests**

```bash
npx vitest run tests/lib/github/webhook.test.ts
```

Expected: all tests pass (including the two updated/new ones).

---

## Task 3: Ignore rule matching logic (TDD)

**Files:**
- Create: `tests/lib/github/ignore-rules.test.ts`
- Create: `lib/github/ignore-rules.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/lib/github/ignore-rules.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { shouldIgnorePR } from '@/lib/github/ignore-rules'

describe('shouldIgnorePR', () => {
  it('returns false when there are no rules', () => {
    expect(shouldIgnorePR('Add dark mode', [], [])).toBe(false)
  })

  it('matches title_prefix (case-insensitive)', () => {
    const rules = [{ rule_type: 'title_prefix', pattern: 'chore:' }]
    expect(shouldIgnorePR('chore: bump deps', [], rules)).toBe(true)
    expect(shouldIgnorePR('Chore: bump deps', [], rules)).toBe(true)
    expect(shouldIgnorePR('Add feature', [], rules)).toBe(false)
  })

  it('matches title_contains (case-insensitive)', () => {
    const rules = [{ rule_type: 'title_contains', pattern: 'dependabot' }]
    expect(shouldIgnorePR('Dependabot updates lodash', [], rules)).toBe(true)
    expect(shouldIgnorePR('update dependencies', [], rules)).toBe(false)
  })

  it('matches label (exact, case-sensitive)', () => {
    const rules = [{ rule_type: 'label', pattern: 'no-changelog' }]
    expect(shouldIgnorePR('Fix bug', ['no-changelog', 'bug'], rules)).toBe(true)
    expect(shouldIgnorePR('Fix bug', ['bug'], rules)).toBe(false)
  })

  it('returns false for unknown rule_type (never matches)', () => {
    const rules = [{ rule_type: 'unknown_type', pattern: 'anything' }]
    expect(shouldIgnorePR('anything', [], rules)).toBe(false)
  })

  it('returns true if any rule matches (OR logic)', () => {
    const rules = [
      { rule_type: 'title_prefix', pattern: 'ci:' },
      { rule_type: 'title_prefix', pattern: 'docs:' },
    ]
    expect(shouldIgnorePR('docs: update readme', [], rules)).toBe(true)
    expect(shouldIgnorePR('feat: new feature', [], rules)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to confirm failure**

```bash
npx vitest run tests/lib/github/ignore-rules.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/github/ignore-rules'`

- [ ] **Step 3: Implement the matching function**

Create `lib/github/ignore-rules.ts`:

```typescript
export interface IgnoreRule {
  rule_type: string
  pattern: string
}

/**
 * Returns true if the PR should be silently ignored (no draft created).
 * Case-insensitive for title rules; exact match for label rules.
 */
export function shouldIgnorePR(
  prTitle: string,
  labels: string[],
  rules: IgnoreRule[]
): boolean {
  const title = prTitle.toLowerCase()
  return rules.some(rule => {
    const pattern = rule.pattern.toLowerCase()
    switch (rule.rule_type) {
      case 'title_prefix':
        return title.startsWith(pattern)
      case 'title_contains':
        return title.includes(pattern)
      case 'label':
        // Labels are case-sensitive in GitHub
        return labels.includes(rule.pattern)
      default:
        return false
    }
  })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/lib/github/ignore-rules.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/github/ignore-rules.ts lib/github/webhook.ts tests/lib/github/
git commit -m "feat: add labels to ParsedPullRequest and PR ignore rule matching logic"
```

---

## Task 4: Ignore rules API routes

**Files:**
- Create: `app/api/workspaces/[id]/ignore-rules/route.ts`
- Create: `app/api/workspaces/[id]/ignore-rules/[ruleId]/route.ts`
- Create: `tests/api/ignore-rules.test.ts`

- [ ] **Step 1: Write failing API tests**

Create `tests/api/ignore-rules.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
const mockRules = [
  { id: 'rule-1', workspace_id: 'ws-1', rule_type: 'title_prefix', pattern: 'chore:', created_at: '2026-01-01' },
]

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}))

import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { GET, POST } from '@/app/api/workspaces/[id]/ignore-rules/route'
import { DELETE } from '@/app/api/workspaces/[id]/ignore-rules/[ruleId]/route'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}
function makeRuleParams(id: string, ruleId: string) {
  return { params: Promise.resolve({ id, ruleId }) }
}

describe('GET /api/workspaces/[id]/ignore-rules', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as any)
    const res = await GET(new Request('http://localhost'), makeParams('ws-1'))
    expect(res.status).toBe(401)
  })

  it('returns rules for the workspace', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    } as any)
    vi.mocked(createSupabaseServiceClient).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: mockRules }),
          }),
        }),
      }),
    } as any)
    const res = await GET(new Request('http://localhost'), makeParams('ws-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rules).toHaveLength(1)
  })
})

describe('POST /api/workspaces/[id]/ignore-rules', () => {
  it('returns 400 for invalid rule_type', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    } as any)
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule_type: 'invalid', pattern: 'chore:' }),
    })
    const res = await POST(req, makeParams('ws-1'))
    expect(res.status).toBe(400)
  })

  it('creates a rule and returns 201', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    } as any)
    const newRule = { id: 'rule-new', workspace_id: 'ws-1', rule_type: 'title_prefix', pattern: 'fix:', created_at: '2026-01-01' }
    vi.mocked(createSupabaseServiceClient).mockReturnValue({
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { role: 'owner' } }) }) }) }),
        insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: newRule, error: null }) }) }),
      }),
    } as any)
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule_type: 'title_prefix', pattern: 'fix:' }),
    })
    const res = await POST(req, makeParams('ws-1'))
    expect(res.status).toBe(201)
  })
})

describe('DELETE /api/workspaces/[id]/ignore-rules/[ruleId]', () => {
  it('returns 204 on success', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    } as any)
    vi.mocked(createSupabaseServiceClient).mockReturnValue({
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { role: 'owner' } }) }) }) }),
        delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
      }),
    } as any)
    const res = await DELETE(new Request('http://localhost'), makeRuleParams('ws-1', 'rule-1'))
    expect(res.status).toBe(204)
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
npx vitest run tests/api/ignore-rules.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Create the collection route**

Create `app/api/workspaces/[id]/ignore-rules/route.ts`:

```typescript
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const VALID_RULE_TYPES = ['title_prefix', 'title_contains', 'label'] as const

const CreateRuleSchema = z.object({
  rule_type: z.enum(VALID_RULE_TYPES),
  pattern: z.string().min(1).max(128),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const { data: rules } = await service
    .from('pr_ignore_rules')
    .select('id, rule_type, pattern, created_at')
    .eq('workspace_id', id)
    .order('created_at', { ascending: true })

  return NextResponse.json({ rules: rules ?? [] })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = CreateRuleSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const service = createSupabaseServiceClient()

  // Verify membership
  const { data: membership } = await service
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', id)
    .eq('user_id', user.id)
    .single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: rule, error } = await service
    .from('pr_ignore_rules')
    .insert({ workspace_id: id, ...parsed.data })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'RULE_ALREADY_EXISTS' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 })
  }

  return NextResponse.json({ rule }, { status: 201 })
}
```

- [ ] **Step 4: Create the item route**

Create `app/api/workspaces/[id]/ignore-rules/[ruleId]/route.ts`:

```typescript
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
) {
  const { id, ruleId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()

  // Verify membership
  const { data: membership } = await service
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', id)
    .eq('user_id', user.id)
    .single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await service
    .from('pr_ignore_rules')
    .delete()
    .eq('id', ruleId)
    .eq('workspace_id', id)

  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/api/ignore-rules.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add app/api/workspaces/[id]/ignore-rules/ tests/api/ignore-rules.test.ts
git commit -m "feat: ignore rules API (GET/POST/DELETE)"
```

---

## Task 5: Seed default ignore rules on workspace creation

**Files:**
- Modify: `app/api/workspaces/route.ts`

- [ ] **Step 1: Add default rules to the workspace POST handler**

In `app/api/workspaces/route.ts`, extend the `Promise.all` that creates default settings (currently lines 63-66) to also insert the default ignore rules:

```typescript
const DEFAULT_IGNORE_RULES = [
  { rule_type: 'title_prefix', pattern: 'chore:' },
  { rule_type: 'title_prefix', pattern: 'docs:' },
  { rule_type: 'title_prefix', pattern: 'ci:' },
  { rule_type: 'title_prefix', pattern: 'test:' },
  { rule_type: 'title_contains', pattern: 'bump deps' },
  { rule_type: 'title_contains', pattern: 'dependabot' },
]

// Replace the existing Promise.all block:
await Promise.all([
  service.from('widget_settings').insert({ workspace_id: workspace.id }),
  service.from('changelog_settings').insert({ workspace_id: workspace.id }),
  service.from('pr_ignore_rules').insert(
    DEFAULT_IGNORE_RULES.map(r => ({ workspace_id: workspace.id, ...r }))
  ),
])
```

Place the `DEFAULT_IGNORE_RULES` constant at the top of the file (after imports, before the schema).

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/workspaces/route.ts
git commit -m "feat: seed default PR ignore rules on workspace creation"
```

---

## Task 6: Enforce ignore rules in the GitHub webhook

**Files:**
- Modify: `app/api/webhooks/github/route.ts`

- [ ] **Step 1: Add ignore rule check after idempotency guard**

In `app/api/webhooks/github/route.ts`, import `shouldIgnorePR` and add the check after the duplicate check (after line 65 in the current file, before the `generateChangelogDraft` call):

```typescript
import { NextResponse } from 'next/server'
import { validateGitHubWebhookSignature, parsePullRequestEvent } from '@/lib/github/webhook'
import { shouldIgnorePR } from '@/lib/github/ignore-rules'
import { generateChangelogDraft } from '@/lib/openai/generate-draft'
import { createSupabaseServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256') ?? ''
  const event = request.headers.get('x-github-event') ?? ''

  if (event !== 'pull_request') {
    return NextResponse.json({ ok: true })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const pr = parsePullRequestEvent(payload)
  if (!pr) {
    return NextResponse.json({ ok: true })
  }

  const service = createSupabaseServiceClient()

  const { data: repo } = await service
    .from('repos')
    .select('id, workspace_id, webhook_secret, is_active')
    .eq('github_repo_id', pr.repoId)
    .single()

  if (!repo) {
    return NextResponse.json({ ok: true })
  }

  if (!repo.is_active) {
    return NextResponse.json({ ok: true })
  }

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

  // Check ignore rules — fail open (if DB unreachable, create the draft anyway)
  const { data: ignoreRules } = await service
    .from('pr_ignore_rules')
    .select('rule_type, pattern')
    .eq('workspace_id', repo.workspace_id)

  if (ignoreRules && shouldIgnorePR(pr.prTitle, pr.labels, ignoreRules)) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const draft = await generateChangelogDraft({
    prTitle: pr.prTitle,
    prBody: pr.prBody,
  })

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

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add app/api/webhooks/github/route.ts
git commit -m "feat: enforce PR ignore rules in GitHub webhook handler"
```

---

## Task 7: RSS feed

**Files:**
- Create: `app/(public)/[slug]/rss.xml/route.ts`
- Create: `tests/api/rss.test.ts`
- Modify: `app/(public)/[slug]/page.tsx` (metadata only)

- [ ] **Step 1: Write failing RSS tests**

Create `tests/api/rss.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: vi.fn(),
}))

import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { GET } from '@/app/(public)/[slug]/rss.xml/route'

const mockWorkspace = { id: 'ws-1', name: 'Acme' }
const mockEntries = [
  {
    id: 'e1',
    title: 'New feature',
    final_content: 'We shipped X.',
    published_at: '2026-04-01T10:00:00Z',
  },
  {
    id: 'e2',
    title: 'Fix <bug> & stuff',
    final_content: 'Fixed the "thing".',
    published_at: '2026-03-01T10:00:00Z',
  },
]

function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) }
}

describe('GET /[slug]/rss.xml', () => {
  it('returns 404 for unknown slug', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue({
      from: () => ({
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null }) }) }),
      }),
    } as any)
    const res = await GET(new Request('http://localhost'), makeParams('unknown'))
    expect(res.status).toBe(404)
  })

  it('returns valid RSS with correct Content-Type', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'workspaces') return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: mockWorkspace }) }) }),
        }
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: mockEntries }) }) }) }),
          }),
        }
      },
    } as any)
    const res = await GET(new Request('http://localhost'), makeParams('acme'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('application/rss+xml')
    const body = await res.text()
    expect(body).toContain('<rss version="2.0">')
    expect(body).toContain('<title>New feature</title>')
  })

  it('escapes XML special characters in titles and content', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'workspaces') return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: mockWorkspace }) }) }),
        }
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: mockEntries }) }) }) }),
          }),
        }
      },
    } as any)
    const res = await GET(new Request('http://localhost'), makeParams('acme'))
    const body = await res.text()
    // Title with < > & should be escaped
    expect(body).toContain('Fix &lt;bug&gt; &amp; stuff')
  })

  it('returns valid RSS with empty channel when no entries', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'workspaces') return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: mockWorkspace }) }) }),
        }
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [] }) }) }) }),
          }),
        }
      },
    } as any)
    const res = await GET(new Request('http://localhost'), makeParams('acme'))
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('<channel>')
    expect(body).not.toContain('<item>')
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
npx vitest run tests/api/rss.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the RSS route**

Create `app/(public)/[slug]/rss.xml/route.ts`:

```typescript
import { createSupabaseServiceClient } from '@/lib/supabase/server'

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const service = createSupabaseServiceClient()

  const { data: workspace } = await service
    .from('workspaces')
    .select('id, name')
    .eq('slug', slug)
    .single()

  if (!workspace) {
    return new Response('Not found', { status: 404 })
  }

  const { data: entries } = await service
    .from('changelog_entries')
    .select('id, title, final_content, published_at')
    .eq('workspace_id', workspace.id)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(50)

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mergecast.co'
  const channelUrl = `${baseUrl}/${slug}`

  const items = (entries ?? []).map(entry => `
    <item>
      <title>${escapeXml(entry.title ?? 'Update')}</title>
      <link>${channelUrl}#${entry.id}</link>
      <guid isPermaLink="false">${entry.id}</guid>
      <pubDate>${new Date(entry.published_at).toUTCString()}</pubDate>
      <description><![CDATA[${entry.final_content ?? ''}]]></description>
    </item>`).join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(workspace.name)} Changelog</title>
    <link>${channelUrl}</link>
    <description>Latest updates from ${escapeXml(workspace.name)}</description>
    <language>en</language>${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
```

- [ ] **Step 4: Add RSS `<link>` to public changelog metadata**

In `app/(public)/[slug]/page.tsx`, update the `generateMetadata` function to include the RSS alternate link:

```typescript
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const service = createSupabaseServiceClient()
  const { data: workspace } = await service
    .from('workspaces')
    .select('name')
    .eq('slug', slug)
    .single()
  return {
    title: workspace ? `${workspace.name} Changelog` : 'Changelog',
    alternates: {
      types: {
        'application/rss+xml': `/${slug}/rss.xml`,
      },
    },
  }
}
```

Also add a small RSS icon link in the public page footer (at the bottom of the JSX, after the subscribe form area). Find the footer section and update it:

```tsx
{/* Footer */}
<footer className="mt-12 flex items-center justify-between text-xs text-muted-foreground">
  <a
    href={`/${workspace.slug}/rss.xml`}
    className="flex items-center gap-1 hover:text-foreground transition-colors"
    title="RSS feed"
  >
    {/* RSS icon SVG */}
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19.01 7.38 20 6.18 20C4.98 20 4 19.01 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z"/>
    </svg>
    RSS
  </a>
  {settings?.show_powered_by !== false && (
    <span>
      Powered by{' '}
      <a href="https://mergecast.co" className="underline">
        Mergecast
      </a>
    </span>
  )}
</footer>
```

Remove the old standalone footer (lines 77-84 in the original file — the `{settings?.show_powered_by !== false && (...)}` block) since it's now merged into the new footer.

- [ ] **Step 5: Run RSS tests**

```bash
npx vitest run tests/api/rss.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add "app/(public)/[slug]/rss.xml/" "app/(public)/[slug]/page.tsx" tests/api/rss.test.ts
git commit -m "feat: RSS feed and metadata link on public changelog"
```

---

## Task 8: View count increment on public page

**Files:**
- Modify: `app/(public)/[slug]/page.tsx`

- [ ] **Step 1: Add non-blocking view count increment**

In `app/(public)/[slug]/page.tsx`, after the entries query (after the `.limit(50)` call), add the fire-and-forget increment. The service client import is already present. Add this immediately after fetching entries:

```typescript
const { data: entries } = await service
  .from('changelog_entries')
  .select('id, title, final_content, published_at, view_count')  // ← add view_count
  .eq('workspace_id', workspace.id)
  .eq('status', 'published')
  .order('published_at', { ascending: false })
  .limit(50)

// Fire-and-forget: increment view counts for all visible entries
// Do NOT await — this must not block page render
if (entries && entries.length > 0) {
  service.rpc('increment_entry_views', {
    entry_ids: entries.map(e => e.id),
  })
}
```

Note: `view_count` is now selected so it's available for the `ChangelogEntry` component if needed in the future. The public page itself doesn't display it.

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/[slug]/page.tsx"
git commit -m "feat: fire-and-forget view count increment on public changelog page"
```

---

## Task 9: View count display on dashboard

**Files:**
- Modify: `components/dashboard/entry-card.tsx`
- Modify: `components/dashboard/entry-editor.tsx`

- [ ] **Step 1: Add view_count to EntryCard**

In `components/dashboard/entry-card.tsx`, update the interface and JSX:

```typescript
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Eye } from 'lucide-react'
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
    view_count: number         // ← new
  }
  workspaceId: string
}

export function EntryCard({ entry }: EntryCardProps) {
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
        <div className="flex items-center gap-3 ml-4 shrink-0">
          {entry.status === 'published' && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Eye className="h-3 w-3" />
              {entry.view_count}
            </span>
          )}
          <Badge variant={STATUS_VARIANT[entry.status] ?? 'secondary'}>
            {entry.status}
          </Badge>
        </div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Add view_count to EntryEditor right panel**

In `components/dashboard/entry-editor.tsx`, update the `EntryEditorProps` interface and the right panel metadata section:

Add `view_count: number` to the `entry` object in the `EntryEditorProps` interface:

```typescript
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
    published_at: string | null   // ← add this if not present
    view_count: number             // ← new
  }
  workspaceId: string
  subscriberCount: number
}
```

In the right panel, update the "Source PR" card to show view count and publish date when published:

```tsx
<div className="rounded-lg border p-4 space-y-3 text-sm">
  <p className="font-medium">Source PR</p>
  {entry.pr_url && (
    <a
      href={entry.pr_url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
    >
      <ExternalLink className="h-3 w-3" />
      {entry.pr_title} #{entry.pr_number}
    </a>
  )}
  {entry.pr_author && (
    <p className="text-muted-foreground">by @{entry.pr_author}</p>
  )}
  <Badge>{entry.status}</Badge>
  {entry.status === 'published' && (
    <p className="text-muted-foreground flex items-center gap-1">
      <Eye className="h-3 w-3" />
      {entry.view_count} view{entry.view_count !== 1 ? 's' : ''}
      {entry.published_at && (
        <span className="ml-1">
          · Published {new Date(entry.published_at).toLocaleDateString()}
        </span>
      )}
    </p>
  )}
</div>
```

Add `Eye` to the lucide-react imports at the top of `entry-editor.tsx`:
```typescript
import { ExternalLink, RefreshCw, Eye } from 'lucide-react'
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors. Note: `entry.published_at` is already fetched via `select('*')` in the entry detail page, so it's present at runtime even if not listed in the interface previously.

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/entry-card.tsx components/dashboard/entry-editor.tsx
git commit -m "feat: show view counts on entry cards and entry detail panel"
```

---

## Task 10: Changelog settings API

**Files:**
- Create: `app/api/workspaces/[id]/changelog-settings/route.ts`

- [ ] **Step 1: Create the changelog settings route**

Create `app/api/workspaces/[id]/changelog-settings/route.ts`:

```typescript
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const UpdateChangelogSettingsSchema = z.object({
  show_powered_by: z.boolean().optional(),
  page_title: z.string().max(128).optional(),
  page_description: z.string().max(256).optional(),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const { data: settings } = await service
    .from('changelog_settings')
    .select('*')
    .eq('workspace_id', id)
    .single()

  if (!settings) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ settings })
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
  const parsed = UpdateChangelogSettingsSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const service = createSupabaseServiceClient()

  // Verify membership
  const { data: membership } = await service
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', id)
    .eq('user_id', user.id)
    .single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: settings, error } = await service
    .from('changelog_settings')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('workspace_id', id)
    .select()
    .single()

  if (error || !settings) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  return NextResponse.json({ settings })
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add "app/api/workspaces/[id]/changelog-settings/"
git commit -m "feat: changelog settings GET/PATCH API"
```

---

## Task 11: Settings page — "Powered by Mergecast" toggle + ignore rules

**Files:**
- Modify: `app/(app)/dashboard/settings/page.tsx`

- [ ] **Step 1: Rewrite the settings page**

The current settings page only has workspace name + slug. Replace the full file content with a version that adds the ignore rules section and the powered-by toggle. The page is already `'use client'`.

Replace `app/(app)/dashboard/settings/page.tsx` with:

```typescript
'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { X } from 'lucide-react'

interface Workspace {
  id: string
  name: string
  slug: string
  plan: string
}

interface IgnoreRule {
  id: string
  rule_type: string
  pattern: string
}

interface ChangelogSettings {
  show_powered_by: boolean
}

const RULE_TYPE_LABELS: Record<string, string> = {
  title_prefix: 'Title starts with',
  title_contains: 'Title contains',
  label: 'Has label',
}

export default function SettingsPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [rules, setRules] = useState<IgnoreRule[]>([])
  const [newRuleType, setNewRuleType] = useState<string>('title_prefix')
  const [newRulePattern, setNewRulePattern] = useState('')
  const [addingRule, setAddingRule] = useState(false)

  const [changelogSettings, setChangelogSettings] = useState<ChangelogSettings | null>(null)
  const [savingBadge, setSavingBadge] = useState(false)

  useEffect(() => {
    fetch('/api/workspaces')
      .then(r => r.json())
      .then(data => {
        const ws = data.workspaces?.[0]
        if (!ws) return
        setWorkspace(ws)
        setName(ws.name)
        // Load ignore rules
        fetch(`/api/workspaces/${ws.id}/ignore-rules`)
          .then(r => r.json())
          .then(d => setRules(d.rules ?? []))
        // Load changelog settings
        fetch(`/api/workspaces/${ws.id}/changelog-settings`)
          .then(r => r.json())
          .then(d => setChangelogSettings(d.settings ?? null))
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

  async function addRule() {
    if (!workspace || !newRulePattern.trim()) return
    setAddingRule(true)
    const res = await fetch(`/api/workspaces/${workspace.id}/ignore-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule_type: newRuleType, pattern: newRulePattern.trim() }),
    })
    if (res.ok) {
      const data = await res.json()
      setRules(prev => [...prev, data.rule])
      setNewRulePattern('')
    }
    setAddingRule(false)
  }

  async function deleteRule(ruleId: string) {
    if (!workspace) return
    await fetch(`/api/workspaces/${workspace.id}/ignore-rules/${ruleId}`, { method: 'DELETE' })
    setRules(prev => prev.filter(r => r.id !== ruleId))
  }

  async function togglePoweredBy() {
    if (!workspace || !changelogSettings) return
    const isPaidPlan = ['growth', 'scale'].includes(workspace.plan)
    if (!isPaidPlan) return // locked for free/starter
    setSavingBadge(true)
    const newValue = !changelogSettings.show_powered_by
    await fetch(`/api/workspaces/${workspace.id}/changelog-settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ show_powered_by: newValue }),
    })
    setChangelogSettings(prev => prev ? { ...prev, show_powered_by: newValue } : prev)
    setSavingBadge(false)
  }

  if (!workspace) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>

  const canToggleBadge = ['growth', 'scale'].includes(workspace.plan)

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <h1 className="text-xl font-semibold">Settings</h1>

      {/* Workspace */}
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

      {/* Powered by Mergecast toggle */}
      {changelogSettings !== null && (
        <div className="rounded-lg border p-6 space-y-3">
          <p className="font-medium">Changelog Page</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">"Powered by Mergecast" badge</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {canToggleBadge
                  ? 'Shown on your public changelog. Toggle to hide.'
                  : 'Upgrade to Growth to remove the badge.'}
              </p>
            </div>
            <button
              onClick={togglePoweredBy}
              disabled={!canToggleBadge || savingBadge}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                changelogSettings.show_powered_by ? 'bg-foreground' : 'bg-muted'
              } ${!canToggleBadge ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
              role="switch"
              aria-checked={changelogSettings.show_powered_by}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  changelogSettings.show_powered_by ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {!canToggleBadge && (
            <p className="text-xs text-muted-foreground">
              <a href="/dashboard/billing" className="underline">Upgrade to Growth</a> to remove the badge.
            </p>
          )}
        </div>
      )}

      {/* PR Ignore Rules */}
      <div className="rounded-lg border p-6 space-y-4">
        <div>
          <p className="font-medium">PR ignore rules</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            PRs matching any rule are silently skipped — no draft is created.
          </p>
        </div>

        {rules.length > 0 && (
          <div className="space-y-2">
            {rules.map(rule => (
              <div key={rule.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>
                  <span className="text-muted-foreground">{RULE_TYPE_LABELS[rule.rule_type] ?? rule.rule_type}: </span>
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">{rule.pattern}</code>
                </span>
                <button
                  onClick={() => deleteRule(rule.id)}
                  className="text-muted-foreground hover:text-destructive ml-2"
                  aria-label="Remove rule"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add rule form */}
        <div className="flex gap-2">
          <select
            value={newRuleType}
            onChange={e => setNewRuleType(e.target.value)}
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            <option value="title_prefix">Title starts with</option>
            <option value="title_contains">Title contains</option>
            <option value="label">Has label</option>
          </select>
          <Input
            value={newRulePattern}
            onChange={e => setNewRulePattern(e.target.value)}
            placeholder="e.g. chore:"
            className="flex-1 h-9"
            onKeyDown={e => { if (e.key === 'Enter') addRule() }}
          />
          <Button size="sm" onClick={addRule} disabled={addingRule || !newRulePattern.trim()}>
            Add
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/dashboard/settings/page.tsx" "app/api/workspaces/[id]/changelog-settings/"
git commit -m "feat: ignore rules UI and powered-by toggle in settings page"
```

---

## Task 12: Approaching-limit conversion banner

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Add the banner to the dashboard page**

The dashboard page already fetches the workspace object via `getWorkspaceForUser`. The Supabase `select('workspaces(*)')` returns all columns including `plan`, `publish_count_this_month`, and `publish_quota_reset_at`.

Update `app/(app)/dashboard/page.tsx` to add the banner between the header and the Tabs:

```typescript
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { EntryCard } from '@/components/dashboard/entry-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'
import { ExternalLink, AlertTriangle } from 'lucide-react'

async function getWorkspaceForUser(userId: string) {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('workspace_members')
    .select('workspaces(*)')
    .eq('user_id', userId)
    .limit(1)
    .single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const workspace = await getWorkspaceForUser(user!.id)
  const { tab } = await searchParams
  const activeTab = tab ?? 'all'

  const [all, drafts, published] = await Promise.all([
    getEntries(workspace.id),
    getEntries(workspace.id, 'draft'),
    getEntries(workspace.id, 'published'),
  ])

  const entries =
    activeTab === 'draft' ? drafts : activeTab === 'published' ? published : all

  // Approaching-limit banner logic
  const isFree = workspace.plan === 'free'
  const publishCount: number = workspace.publish_count_this_month ?? 0
  const FREE_LIMIT = 3
  const showYellowBanner = isFree && publishCount === FREE_LIMIT - 1  // 2/3 used
  const showRedBanner = isFree && publishCount >= FREE_LIMIT           // 3/3 used

  return (
    <div className="p-6 max-w-3xl">
      {/* Approaching-limit banners */}
      {showRedBanner && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Monthly publish limit reached.</span>
          </div>
          <Link href="/dashboard/billing" className="font-medium text-destructive underline underline-offset-2">
            Upgrade to publish →
          </Link>
        </div>
      )}
      {showYellowBanner && !showRedBanner && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-yellow-500/50 bg-yellow-500/10 px-4 py-3 text-sm">
          <span className="text-yellow-700 dark:text-yellow-400">
            1 publish left this month on the free plan.
          </span>
          <Link href="/dashboard/billing" className="font-medium text-yellow-700 dark:text-yellow-400 underline underline-offset-2">
            Upgrade to remove limits →
          </Link>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Entries</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Merge a PR to generate your next draft automatically.
          </p>
        </div>
        <Link
          href={`/${workspace.slug}`}
          target="_blank"
          className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[0.8rem] font-medium transition-colors hover:bg-muted"
        >
          <ExternalLink className="h-3 w-3" />
          View changelog
        </Link>
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
                {activeTab === 'draft'
                  ? 'No drafts. Merge a PR to get started.'
                  : activeTab === 'published'
                    ? 'Nothing published yet.'
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

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/dashboard/page.tsx"
git commit -m "feat: approaching-limit conversion banner on dashboard"
```

---

## Task 13: Widget-first landing page rewrite

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Rewrite the landing page with widget-first hero**

Replace the full content of `app/page.tsx`:

```typescript
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { GitBranch, Zap, Mail, Code2, CheckCircle } from 'lucide-react'

// Features ordered by defensibility: widget first (unique), then the rest
const FEATURES = [
  { icon: Code2,     title: 'Embeddable widget',  desc: "One script tag adds a \"What's new\" drawer to your product. Stays in sync with every publish." },
  { icon: GitBranch, title: 'GitHub-connected',   desc: 'Listens for merged PRs automatically. No manual input, no copy-paste.' },
  { icon: Zap,       title: 'AI-written drafts',  desc: 'GPT-4o turns technical PR descriptions into readable release notes in seconds.' },
  { icon: Mail,      title: 'Email subscribers',  desc: 'Users subscribe on your changelog page. Every publish triggers a broadcast automatically.' },
]

const PRICING = [
  {
    name: 'Free',
    price: '$0',
    features: ['1 repo', '3 publishes/mo', '100 subscribers', 'mergecast.co subdomain'],
    cta: 'Start free',
    highlighted: false,
  },
  {
    name: 'Starter',
    price: '$19',
    features: ['1 repo', 'Unlimited publishes', '1,000 subscribers', 'Custom domain'],
    cta: 'Get started',
    highlighted: true,
  },
  {
    name: 'Growth',
    price: '$49',
    features: ['3 repos', 'Unlimited publishes', '10,000 subscribers', 'Remove Mergecast badge'],
    cta: 'Get started',
    highlighted: false,
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto">
        <span className="font-semibold">Mergecast</span>
        <div className="flex items-center gap-4">
          <Link href="#pricing" className="text-sm text-muted-foreground hover:text-foreground">
            Pricing
          </Link>
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 transition-opacity"
          >
            Start free
          </Link>
        </div>
      </nav>

      {/* Hero — widget-first */}
      <section className="px-6 py-20 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          {/* Copy */}
          <div className="space-y-6">
            <Badge variant="secondary">Now in early access</Badge>
            <h1 className="text-4xl font-bold tracking-tight leading-tight">
              The &ldquo;What&rsquo;s new&rdquo; button<br />your users actually read.
            </h1>
            <p className="text-lg text-muted-foreground">
              One script tag adds a changelog widget to your product. Mergecast writes the updates
              from your GitHub PRs automatically, then emails your subscribers when you publish.
            </p>
            <div className="flex items-center gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:opacity-90 transition-opacity"
              >
                Start for free
              </Link>
              <Link
                href="/mergecast"
                className="inline-flex items-center justify-center rounded-md border border-input px-5 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
              >
                See a live example
              </Link>
            </div>
          </div>

          {/* Widget mockup */}
          <div className="relative flex items-end justify-end">
            {/* Fake browser chrome */}
            <div className="w-full rounded-xl border bg-muted/30 overflow-hidden shadow-lg">
              <div className="flex items-center gap-1.5 px-4 py-3 border-b bg-muted/50">
                <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <div className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
                <div className="mx-3 h-5 flex-1 rounded bg-background/60 text-xs text-muted-foreground flex items-center px-2">
                  your-app.com
                </div>
              </div>
              <div className="relative h-48 bg-background p-4">
                {/* Fake app content */}
                <div className="space-y-2 opacity-30">
                  <div className="h-3 w-3/4 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                  <div className="h-3 w-2/3 rounded bg-muted" />
                </div>

                {/* Widget drawer (open state) */}
                <div className="absolute bottom-2 right-2 w-52 rounded-lg border bg-background shadow-lg overflow-hidden">
                  <div className="px-3 py-2 border-b bg-muted/30">
                    <p className="text-xs font-semibold">What&rsquo;s new</p>
                  </div>
                  <div className="divide-y">
                    {[
                      { title: 'Dark mode is here', date: 'Apr 22' },
                      { title: 'Faster search', date: 'Apr 15' },
                      { title: 'API v2 launched', date: 'Apr 8' },
                    ].map(item => (
                      <div key={item.title} className="px-3 py-2">
                        <p className="text-xs font-medium">{item.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{item.date}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Widget trigger button */}
                <div className="absolute bottom-2 right-2 translate-y-[-148px]">
                  {/* Button shown below the open drawer to imply it triggered it */}
                </div>
              </div>
            </div>

            {/* Floating button label */}
            <div className="absolute -bottom-3 right-4 inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-md">
              <Code2 className="h-3 w-3" />
              One &lt;script&gt; tag
            </div>
          </div>
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
            { step: '1', title: 'Paste one script tag',  desc: 'Add Mergecast to your product. The widget appears instantly — no config needed.' },
            { step: '2', title: 'Connect your repo',     desc: 'Install the GitHub App. Mergecast starts watching for merged PRs.' },
            { step: '3', title: 'Merge → Review → Publish', desc: 'AI drafts the release note. You review, edit if needed, and publish. Widget updates, subscribers get emailed.' },
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
          {PRICING.map(({ name, price, features, cta, highlighted }) => (
            <div
              key={name}
              className={`rounded-lg border p-6 space-y-6 ${highlighted ? 'border-foreground' : ''}`}
            >
              <div>
                {highlighted && <Badge className="mb-2">Most popular</Badge>}
                <p className="text-lg font-semibold">{name}</p>
                <p className="text-3xl font-bold mt-1">
                  {price}
                  <span className="text-sm font-normal text-muted-foreground">/mo</span>
                </p>
              </div>
              <ul className="space-y-2">
                {features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className={`flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors w-full ${
                  highlighted
                    ? 'bg-foreground text-background hover:opacity-90'
                    : 'border border-input hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                {cta}
              </Link>
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

- [ ] **Step 2: TypeScript check + full test suite**

```bash
npx tsc --noEmit && npm test
```

Expected: 0 TypeScript errors, all tests pass.

- [ ] **Step 3: Production build**

```bash
npm run build
```

Expected: successful build, no errors.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: widget-first landing page hero and reordered features"
```

---

## Self-Review

**Spec coverage check:**

| Spec section                              | Task                                              |
|-------------------------------------------|---------------------------------------------------|
| "Powered by Mergecast" badge              | Task 11 (toggle) + public page already renders it |
| Entry view analytics (shallow)            | Tasks 8, 9                                        |
| PR ignore rules                           | Tasks 3, 4, 5, 6, 11                              |
| RSS feed                                  | Task 7                                            |
| Widget-first landing page                 | Task 13                                           |
| Approaching-limit banner                  | Task 12                                           |
| `increment_entry_views` Postgres function | Task 1                                            |
| `pr_ignore_rules` table + RLS             | Task 1                                            |
| Default rules on workspace creation       | Task 5                                            |
| Changelog settings API                    | Task 10                                           |
| Labels in ParsedPullRequest               | Task 2                                            |

All spec sections covered. ✅

**Placeholder scan:** All code blocks are complete implementations. No TBDs. ✅

**Type consistency:**
- `shouldIgnorePR` defined in Task 3 as `(prTitle: string, labels: string[], rules: IgnoreRule[]) => boolean`. Used in Task 6 as `shouldIgnorePR(pr.prTitle, pr.labels, ignoreRules)` — `pr.labels` is `string[]` per Task 2. ✅
- `ParsedPullRequest.labels: string[]` added in Task 2, consumed in Task 6. ✅
- `EntryCard` interface gains `view_count: number` in Task 9. The `getEntries` query uses `select('*')` which includes all columns after the Task 1 migration. ✅
- `EntryEditor` interface gains `view_count: number` and `published_at: string | null`. The entry detail page uses `select('*')` so both are present at runtime. ✅
- `Eye` icon imported from `lucide-react` in both `entry-card.tsx` and `entry-editor.tsx` — verified it exists in lucide-react@1.8.0 (same approach as other icons used in codebase). ✅
- `AlertTriangle` imported in `dashboard/page.tsx` — present in lucide-react@1.8.0. ✅
