# Code Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all Critical, High, and Medium issues identified in the code review: race conditions, security gaps, null crashes, and type safety.

**Architecture:** Nine focused tasks, each touching one concern. Tasks 1–3 are foundational (install dep, add types, DB migration) and must land before Tasks 4–9. Tasks 4–9 are independent of each other.

**Tech Stack:** Next.js 16 App Router, Supabase (PostgreSQL + RLS), TypeScript strict, Vitest, date-fns (to be installed), Resend.

---

## Files Modified

| File                                                   | Change                                                             |
|--------------------------------------------------------|--------------------------------------------------------------------|
| `package.json`                                         | Add `date-fns` dependency                                          |
| `lib/types.ts`                                         | Create — shared Workspace + Entry interfaces                       |
| `lib/quota.ts`                                         | Atomic reset via `.lt()` filter                                    |
| `app/api/webhooks/github/route.ts`                     | try/catch for AI draft, check insert error, handle unique conflict |
| `app/(app)/dashboard/page.tsx`                         | Null guard → redirect to `/onboarding`                             |
| `app/admin/page.tsx`                                   | `app_metadata` check, `date-fns` formatting                        |
| `lib/resend/email.ts`                                  | Guard null sendRecord, add inter-batch delay                       |
| `app/(app)/dashboard/settings/page.tsx`                | Error state on `addRule` failure                                   |
| `next.config.ts`                                       | Security headers                                                   |
| `supabase/migrations/005_security_and_idempotency.sql` | Create — RLS fix, UNIQUE constraint, better index                  |
| `tests/lib/quota.test.ts`                              | Test for atomic reset condition                                    |
| `tests/api/webhook.test.ts`                            | Create — duplicate PR handling                                     |

---

## Task 1: Install date-fns and define shared types

**Files:**
- Modify: `package.json`
- Create: `lib/types.ts`
- Modify: `app/admin/page.tsx:72` (toLocaleDateString → format)

- [ ] **Step 1: Install date-fns**

```bash
cd /Users/alanalic/Projects/mergecast && npm install date-fns
```

Expected: `added 1 package` (or similar), no errors.

- [ ] **Step 2: Create `lib/types.ts` with shared interfaces**

```typescript
export interface Workspace {
  id: string
  slug: string
  name: string
  plan: string
  publish_count_this_month: number
  publish_quota_reset_at: string
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  stripe_price_id?: string | null
  created_at: string
  updated_at: string
}

export interface Entry {
  id: string
  workspace_id: string
  repo_id?: string | null
  pr_number?: number | null
  pr_title?: string | null
  pr_body?: string | null
  pr_url?: string | null
  pr_merged_at?: string | null
  pr_author?: string | null
  ai_draft?: string | null
  title?: string | null
  final_content?: string | null
  status: string
  published_at?: string | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 3: Fix `toLocaleDateString()` in `app/admin/page.tsx`**

Replace:
```typescript
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
```

With:
```typescript
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'
```

Then replace the table cell:
```tsx
<td className="px-4 py-3 text-muted-foreground">
  {new Date(ws.created_at).toLocaleDateString()}
</td>
```

With:
```tsx
<td className="px-4 py-3 text-muted-foreground">
  {format(new Date(ws.created_at), 'MMM d, yyyy')}
</td>
```

- [ ] **Step 4: Run tests to confirm nothing broke**

```bash
npm test
```

Expected: 122 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json lib/types.ts app/admin/page.tsx
git commit -m "feat: add date-fns, shared Workspace/Entry types, fix toLocaleDateString"
```

---

## Task 2: Database migration — security and idempotency

**Files:**
- Create: `supabase/migrations/005_security_and_idempotency.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 005_security_and_idempotency.sql

-- 1. Lock down workspace_members mutations.
--    INSERT/UPDATE/DELETE are done exclusively via service role (bypasses RLS),
--    so denying them via client key prevents a member from adding themselves to
--    foreign workspaces.
CREATE POLICY "workspace_members_no_insert" ON workspace_members
  FOR INSERT WITH CHECK (false);

CREATE POLICY "workspace_members_no_update" ON workspace_members
  FOR UPDATE USING (false);

-- Members can leave their own workspace (self-delete only).
CREATE POLICY "workspace_members_self_delete" ON workspace_members
  FOR DELETE USING (user_id = auth.uid());

-- 2. Unique constraint on (repo_id, pr_number) so that even if two webhook
--    deliveries race past the idempotency SELECT, only one INSERT wins.
--    Partial index excludes manually created entries (pr_number IS NULL).
CREATE UNIQUE INDEX idx_entries_repo_pr_unique
  ON changelog_entries (repo_id, pr_number)
  WHERE pr_number IS NOT NULL;

-- 3. Replace the partial index on published_at with a composite that includes
--    status, giving the query planner a single index for the common filter
--    (workspace_id, status = 'published', ORDER BY published_at DESC).
DROP INDEX IF EXISTS idx_entries_published_at;
CREATE INDEX idx_entries_workspace_published
  ON changelog_entries (workspace_id, published_at DESC)
  WHERE status = 'published';
```

- [ ] **Step 2: Apply migration in Supabase dashboard**

Open the Supabase SQL editor for your project and run `supabase/migrations/005_security_and_idempotency.sql`.

Expected: no errors. Verify in Supabase Table Editor → Indexes that `idx_entries_repo_pr_unique` and `idx_entries_workspace_published` exist.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/005_security_and_idempotency.sql
git commit -m "feat: add workspace_members RLS restrictions, entry idempotency index, better published index"
```

---

## Task 3: Fix quota race condition (atomic reset)

**Files:**
- Modify: `lib/quota.ts:22-35`
- Modify: `tests/lib/quota.test.ts`

**Problem:** Two simultaneous requests both see `publish_quota_reset_at < now()`, both issue UPDATE, both reset the counter. The second reset overwrites any increments made by the first request's publish.

**Fix:** Add `.lt('publish_quota_reset_at', new Date().toISOString())` to the UPDATE so PostgreSQL only touches a row if it still needs resetting. The second concurrent request finds no matching row and skips silently.

- [ ] **Step 1: Write the failing test**

Add to `tests/lib/quota.test.ts` after the existing `resets count` test:

```typescript
it('atomic reset: second concurrent reset is a no-op', async () => {
  // Simulate the supabase chain correctly returning 0 rows matched (already reset)
  const mockEq2 = vi.fn().mockResolvedValue({ error: null })
  const mockLt = vi.fn().mockReturnValue({ eq: mockEq2 })
  const mockEq1 = vi.fn().mockReturnValue({ lt: mockLt })
  const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 })
  ;(createSupabaseServiceClient as any).mockReturnValue({
    from: () => ({ update: mockUpdate }),
  })
  const ws = makeWorkspace('free', 3, new Date(Date.now() - 1000))
  const result = await checkPublishQuota(ws as any, 'ws-id-abc')
  expect(result.allowed).toBe(true)
  // Crucially: the lt filter must be called with the reset_at value
  expect(mockLt).toHaveBeenCalledWith(
    'publish_quota_reset_at',
    expect.any(String)
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test tests/lib/quota.test.ts
```

Expected: FAIL — `mockLt` is not called because the current code doesn't use `.lt()`.

- [ ] **Step 3: Fix `lib/quota.ts` — add `.lt()` to the reset UPDATE**

Replace the update block (lines 28–34):

```typescript
      await supabase
        .from('workspaces')
        .update({
          publish_count_this_month: 0,
          publish_quota_reset_at: nextReset.toISOString(),
        })
        .eq('id', workspaceId)
        .lt('publish_quota_reset_at', new Date().toISOString())
```

Full updated `lib/quota.ts`:

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

  // Lazy reset: if reset_at is in the past, reset the counter.
  // The .lt() filter makes this atomic — if two requests race here, only the
  // first UPDATE finds a row where reset_at < now(); the second is a no-op.
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
        .lt('publish_quota_reset_at', new Date().toISOString())
    }
    return { allowed: true }
  }

  if (workspace.publish_count_this_month >= limit) {
    return { allowed: false, reason: 'QUOTA_EXCEEDED' }
  }

  return { allowed: true }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test tests/lib/quota.test.ts
```

Expected: 5 passed (4 original + 1 new).

- [ ] **Step 5: Commit**

```bash
git add lib/quota.ts tests/lib/quota.test.ts
git commit -m "fix: atomic quota reset using .lt() filter to prevent double-reset race"
```

---

## Task 4: Fix GitHub webhook — TOCTOU + unhandled rejection + unchecked insert

**Files:**
- Modify: `app/api/webhooks/github/route.ts`
- Create: `tests/api/webhook.test.ts`

**Problems:**
1. `generateChangelogDraft` is awaited without try/catch → uncaught throw → 500 → GitHub retries forever
2. The insert result is never checked; a DB failure silently returns 200
3. Two simultaneous webhooks for the same PR can both pass the idempotency check and both insert (Task 2 adds the UNIQUE constraint as a DB-level safety net; this task makes the app handle the conflict gracefully)

- [ ] **Step 1: Write failing tests**

Create `tests/api/webhook.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Minimal mocks — we test the handler logic, not the Supabase/GitHub internals
vi.mock('@/lib/github/webhook', () => ({
  validateGitHubWebhookSignature: vi.fn().mockResolvedValue(true),
  parsePullRequestEvent: vi.fn().mockReturnValue({
    repoId: 1,
    prNumber: 42,
    prTitle: 'Fix bug',
    prBody: 'body',
    prUrl: 'https://github.com/org/repo/pull/42',
    prAuthor: 'alice',
    prMergedAt: new Date().toISOString(),
    labels: [],
  }),
}))

vi.mock('@/lib/github/ignore-rules', () => ({
  shouldIgnorePR: vi.fn().mockReturnValue(false),
}))

vi.mock('@/lib/openai/generate-draft', () => ({
  generateChangelogDraft: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: vi.fn(),
}))

import { POST } from '@/app/api/webhooks/github/route'
import { generateChangelogDraft } from '@/lib/openai/generate-draft'
import { createSupabaseServiceClient } from '@/lib/supabase/server'

function makeRequest(body: string, event = 'pull_request') {
  return new Request('http://localhost/api/webhooks/github', {
    method: 'POST',
    body,
    headers: {
      'x-github-event': event,
      'x-hub-signature-256': 'sha256=abc',
    },
  })
}

function makeServiceMock({
  repo = { id: 'repo-1', workspace_id: 'ws-1', webhook_secret: 'secret', is_active: true },
  existing = null,
  ignoreRules = [],
  insertError = null,
}: {
  repo?: object | null
  existing?: object | null
  ignoreRules?: object[]
  insertError?: { code: string; message: string } | null
} = {}) {
  const single = vi.fn()
    .mockResolvedValueOnce({ data: repo })         // repos lookup
    .mockResolvedValueOnce({ data: existing })     // idempotency check
  const fromMock = vi.fn((table: string) => {
    if (table === 'pr_ignore_rules') {
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: ignoreRules }) }
    }
    if (table === 'changelog_entries' && !existing) {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single,
        insert: vi.fn().mockResolvedValue({ error: insertError }),
      }
    }
    return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single }
  })
  ;(createSupabaseServiceClient as any).mockReturnValue({ from: fromMock })
}

describe('GitHub webhook handler', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 200 when AI draft generation throws', async () => {
    makeServiceMock()
    ;(generateChangelogDraft as any).mockRejectedValue(new Error('OpenAI timeout'))
    const res = await POST(makeRequest(JSON.stringify({})))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('returns 200 with duplicate flag when insert hits unique conflict', async () => {
    makeServiceMock({ insertError: { code: '23505', message: 'unique violation' } })
    ;(generateChangelogDraft as any).mockResolvedValue({ title: 'Fix bug', body: 'draft' })
    const res = await POST(makeRequest(JSON.stringify({})))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.duplicate).toBe(true)
  })

  it('returns 500 when insert fails for non-conflict reason', async () => {
    makeServiceMock({ insertError: { code: '42501', message: 'permission denied' } })
    ;(generateChangelogDraft as any).mockResolvedValue({ title: 'Fix bug', body: 'draft' })
    const res = await POST(makeRequest(JSON.stringify({})))
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test tests/api/webhook.test.ts
```

Expected: 3 FAIL — handler currently doesn't catch AI errors or check insert results.

- [ ] **Step 3: Fix `app/api/webhooks/github/route.ts`**

Replace the file contents:

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

  // Idempotency pre-check (optimisation: avoids calling OpenAI for duplicates)
  const { data: existing } = await service
    .from('changelog_entries')
    .select('id')
    .eq('repo_id', repo.id)
    .eq('pr_number', pr.prNumber)
    .single()

  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  const { data: ignoreRules } = await service
    .from('pr_ignore_rules')
    .select('rule_type, pattern')
    .eq('workspace_id', repo.workspace_id)

  if (ignoreRules && shouldIgnorePR(pr.prTitle, pr.labels, ignoreRules)) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  // AI draft generation — failures are non-fatal; we create the entry without a draft
  let draft = { title: pr.prTitle, body: '' }
  try {
    draft = await generateChangelogDraft({ prTitle: pr.prTitle, prBody: pr.prBody })
  } catch {
    // OpenAI unavailable — entry is created with empty draft; user can regenerate
  }

  const { error: insertError } = await service.from('changelog_entries').insert({
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

  if (insertError) {
    // Unique violation means a concurrent webhook already created this entry
    if (insertError.code === '23505') {
      return NextResponse.json({ ok: true, duplicate: true })
    }
    return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run tests**

```bash
npm test tests/api/webhook.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Run full suite**

```bash
npm test
```

Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add app/api/webhooks/github/route.ts tests/api/webhook.test.ts
git commit -m "fix: webhook — catch AI draft errors, check insert result, handle unique conflict"
```

---

## Task 5: Fix dashboard null crash

**Files:**
- Modify: `app/(app)/dashboard/page.tsx:41`

**Problem:** `getWorkspaceForUser` returns `data?.workspaces as any`, which is `undefined` if the user has no workspace. Line 46 then calls `workspace.id` and crashes.

- [ ] **Step 1: Fix `app/(app)/dashboard/page.tsx`**

Replace lines 41–48:

```typescript
  const workspace = await getWorkspaceForUser(user!.id)
  const { tab } = await searchParams
  const activeTab = tab ?? 'all'

  const [all, drafts, published] = await Promise.all([
    getEntries(workspace.id),
    getEntries(workspace.id, 'draft'),
    getEntries(workspace.id, 'published'),
  ])
```

With:

```typescript
  const workspace = await getWorkspaceForUser(user!.id)

  if (!workspace) {
    redirect('/onboarding')
  }

  const { tab } = await searchParams
  const activeTab = tab ?? 'all'

  const [all, drafts, published] = await Promise.all([
    getEntries(workspace.id),
    getEntries(workspace.id, 'draft'),
    getEntries(workspace.id, 'published'),
  ])
```

Also add the `redirect` import at the top of the file if not already present:

```typescript
import { redirect } from 'next/navigation'
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all passing.

- [ ] **Step 3: Commit**

```bash
git add app/(app)/dashboard/page.tsx
git commit -m "fix: redirect to /onboarding when user has no workspace (null crash)"
```

---

## Task 6: Fix admin — use app_metadata for admin check

**Files:**
- Modify: `app/admin/page.tsx:9`

**Problem:** `user.user_metadata` is writable by the client via Supabase Auth's `updateUser()`. Any user can set `is_admin: true` on themselves and access the admin page. `app_metadata` is only writable via the service role admin API.

- [ ] **Step 1: Fix the admin check in `app/admin/page.tsx`**

Replace line 9:

```typescript
  const isAdmin = user.user_metadata?.is_admin === true
```

With:

```typescript
  const isAdmin = user.app_metadata?.is_admin === true
```

**Note for setting up admins:** Use the Supabase service role admin API (never the client key):
```typescript
// Run once, server-side only:
await supabaseAdmin.auth.admin.updateUserById(userId, {
  app_metadata: { is_admin: true }
})
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all passing.

- [ ] **Step 3: Commit**

```bash
git add app/admin/page.tsx
git commit -m "fix: use app_metadata for admin check — user_metadata is client-writable"
```

---

## Task 7: Fix email batch — guard null sendRecord, add inter-batch delay

**Files:**
- Modify: `lib/resend/email.ts:53–98`

**Problems:**
1. If the `email_sends` INSERT fails, `sendRecord` is null. The `try/catch` silently sends emails with no audit record and no error logged.
2. No delay between 100-email batches — at Scale tier (50 K subscribers = 500 batches) this fires all batches simultaneously and will hit Resend's rate limit.

- [ ] **Step 1: Fix `lib/resend/email.ts` — guard null record, add inter-batch delay**

Replace the `sendPublishEmail` function body from the `const { data: sendRecord }` line onwards:

```typescript
  const { data: sendRecord, error: sendRecordError } = await service
    .from('email_sends')
    .insert({
      workspace_id: input.workspaceId,
      entry_id: input.entry.id,
      recipient_count: subscribers.length,
      status: 'pending',
    })
    .select()
    .single()

  if (sendRecordError || !sendRecord) {
    // Audit record failed to create — log and continue sending anyway
    console.error('email_sends insert failed:', sendRecordError)
  }

  try {
    const BATCH_SIZE = 100
    for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
      // 200 ms between batches keeps us inside Resend's rate limits at all tiers
      if (i > 0) await new Promise(resolve => setTimeout(resolve, 200))
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
      await service
        .from('email_sends')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', sendRecord.id)
    }
  } catch (err) {
    if (sendRecord) {
      await service
        .from('email_sends')
        .update({ status: 'failed', error_message: String(err) })
        .eq('id', sendRecord.id)
    }
    throw err
  }
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all passing.

- [ ] **Step 3: Commit**

```bash
git add lib/resend/email.ts
git commit -m "fix: guard null email_sends record, add 200ms inter-batch delay for rate limiting"
```

---

## Task 8: Fix settings — addRule error feedback + parseInt NaN

**Files:**
- Modify: `app/(app)/dashboard/settings/page.tsx:79–93`
- Modify: `app/api/workspaces/[id]/entries/route.ts:17–18`

- [ ] **Step 1: Fix parseInt NaN in `app/api/workspaces/[id]/entries/route.ts`**

Replace line 18:

```typescript
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50)
```

With:

```typescript
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20') || 20, 50)
```

`|| 20` replaces `NaN` (when the param is non-numeric) with the default.

- [ ] **Step 2: Fix `addRule` error feedback in `app/(app)/dashboard/settings/page.tsx`**

Add an error state after the existing state declarations (after line 40):

```typescript
  const [addRuleError, setAddRuleError] = useState<string | null>(null)
```

Replace the `addRule` function (lines 79–93):

```typescript
  async function addRule() {
    if (!workspace || !newRulePattern.trim()) return
    setAddingRule(true)
    setAddRuleError(null)
    const res = await fetch(`/api/workspaces/${workspace.id}/ignore-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule_type: newRuleType, pattern: newRulePattern.trim() }),
    })
    if (res.ok) {
      const data = await res.json()
      setRules(prev => [...prev, data.rule])
      setNewRulePattern('')
    } else {
      setAddRuleError('Failed to add rule. Please try again.')
    }
    setAddingRule(false)
  }
```

Add the error message in the JSX, directly below the "Add rule form" `<div className="flex gap-2">` block (after the closing `</div>` of the flex row):

```tsx
        {addRuleError && (
          <p className="text-xs text-destructive">{addRuleError}</p>
        )}
```

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: all passing.

- [ ] **Step 4: Commit**

```bash
git add app/api/workspaces/[id]/entries/route.ts app/(app)/dashboard/settings/page.tsx
git commit -m "fix: parseInt NaN default in entries route, addRule error feedback in settings"
```

---

## Task 9: Add security headers

**Files:**
- Modify: `next.config.ts`

**Note:** A full nonce-based CSP is a larger standalone task. These headers address clickjacking, MIME-sniffing, and referrer leakage with zero risk of breaking the app.

- [ ] **Step 1: Update `next.config.ts`**

```typescript
import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all passing.

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "fix: add X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy headers"
```

---

## Self-Review

**Spec coverage:**
- ✅ Race condition in quota reset (Task 3)
- ✅ TOCTOU in webhook (Task 4 + Task 2 migration)
- ✅ Null crash in dashboard (Task 5)
- ✅ Non-transactional email / null sendRecord (Task 7)
- ✅ Admin metadata check (Task 6)
- ✅ RLS workspace_members gap (Task 2)
- ✅ Unhandled rejection in webhook (Task 4)
- ✅ Insert result unchecked in webhook (Task 4)
- ✅ parseInt NaN (Task 8)
- ✅ Batch email rate limiting (Task 7)
- ✅ Missing composite index (Task 2)
- ✅ addRule no error feedback (Task 8)
- ✅ toLocaleDateString (Task 1)
- ✅ Security headers (Task 9)
- ✅ date-fns install (Task 1)
- ⚠️ Subscribers pagination — intentionally deferred (UI-only, low severity, separate task)
- ⚠️ Rate limiting on subscribe endpoint — deferred (needs infra, separate task)
- ⚠️ Full nonce-based CSP — deferred (large standalone task, noted in Task 9)
- ⚠️ `as any` casts replaced only where touched; `lib/types.ts` created for future use

**No placeholders found.**
