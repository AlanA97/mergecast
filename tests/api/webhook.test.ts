import { describe, it, expect, vi, beforeEach } from 'vitest'

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
  generateReleaseNotesDraft: vi.fn(),
}))

vi.mock('@/lib/github/app', () => ({
  getInstallationOctokit: vi.fn(),
}))

vi.mock('@/lib/github/tags', () => ({
  TAG_NAME_REGEX: /^[a-zA-Z0-9][a-zA-Z0-9._\-/]{0,199}$/,
  getPreviousTag: vi.fn().mockResolvedValue('v0.9.0'),
  getPRsBetweenTags: vi.fn().mockResolvedValue([
    { prNumber: 1, prTitle: 'Add feature', prBody: 'desc', prUrl: '', prAuthor: 'bob', prMergedAt: new Date().toISOString(), labels: [] },
  ]),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: vi.fn(),
}))

import { POST } from '@/app/api/webhooks/github/route'
import { generateChangelogDraft, generateReleaseNotesDraft } from '@/lib/openai/generate-draft'
import { getPRsBetweenTags } from '@/lib/github/tags'
import { createSupabaseServiceClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const BASE_PR_REPO = {
  id: 'repo-1',
  workspace_id: 'ws-1',
  webhook_secret: 'secret',
  is_active: true,
  tag_based_mode: false,
}

const BASE_TAG_REPO = {
  ...BASE_PR_REPO,
  tag_based_mode: true,
  full_name: 'org/repo',
  github_installation_id: 123,
}

function makeServiceMock({
  repo = BASE_PR_REPO as object | null,
  existing = null as object | null,
  insertError = null as { code: string; message: string } | null,
  ignoreRules = [] as object[],
} = {}) {
  const repoSingle = vi.fn().mockResolvedValue({ data: repo })
  const existingSingle = vi.fn().mockResolvedValue({ data: existing })

  ;(createSupabaseServiceClient as ReturnType<typeof vi.fn>).mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === 'repos') {
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: repoSingle }
      }
      if (table === 'pr_ignore_rules') {
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: ignoreRules }) }
      }
      if (table === 'changelog_entries') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: existingSingle,
          insert: vi.fn().mockResolvedValue({ error: insertError }),
        }
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
    }),
  })
}

const RELEASE_PAYLOAD = JSON.stringify({
  action: 'published',
  release: {
    tag_name: 'v1.0.0',
    published_at: new Date('2024-01-15T00:00:00Z').toISOString(),
    prerelease: false,
    draft: false,
  },
  repository: { id: 1, full_name: 'org/repo' },
})

// ---------------------------------------------------------------------------
// pull_request event tests
// ---------------------------------------------------------------------------

describe('GitHub webhook — pull_request event', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 200 when AI draft generation throws', async () => {
    makeServiceMock()
    ;(generateChangelogDraft as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('OpenAI timeout'))
    const res = await POST(makeRequest(JSON.stringify({})))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('returns 200 with duplicate flag when insert hits unique conflict', async () => {
    makeServiceMock({ insertError: { code: '23505', message: 'unique violation' } })
    ;(generateChangelogDraft as ReturnType<typeof vi.fn>).mockResolvedValue({ title: 'Fix bug', body: 'draft' })
    const res = await POST(makeRequest(JSON.stringify({})))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.duplicate).toBe(true)
  })

  it('returns 500 when insert fails for non-conflict reason', async () => {
    makeServiceMock({ insertError: { code: '42501', message: 'permission denied' } })
    ;(generateChangelogDraft as ReturnType<typeof vi.fn>).mockResolvedValue({ title: 'Fix bug', body: 'draft' })
    const res = await POST(makeRequest(JSON.stringify({})))
    expect(res.status).toBe(500)
  })

  it('silently skips when repo is in tag_based_mode', async () => {
    makeServiceMock({ repo: { ...BASE_PR_REPO, tag_based_mode: true } })
    ;(generateChangelogDraft as ReturnType<typeof vi.fn>).mockResolvedValue({ title: 'X', body: 'Y' })
    const res = await POST(makeRequest(JSON.stringify({})))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    // Must NOT expose mode state
    expect(body.skipped).toBeUndefined()
    expect(generateChangelogDraft).not.toHaveBeenCalled()
  })

  it('returns 200 when repo is not found (no enumeration leak)', async () => {
    makeServiceMock({ repo: null })
    const res = await POST(makeRequest(JSON.stringify({})))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })
})

// ---------------------------------------------------------------------------
// release event (published) tests
// ---------------------------------------------------------------------------

describe('GitHub webhook — release event (published)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('ignores release events with action != published (e.g. created draft)', async () => {
    makeServiceMock({ repo: BASE_TAG_REPO })
    const payload = JSON.stringify({ action: 'created', release: { tag_name: 'v1.0.0', published_at: null, prerelease: false, draft: true }, repository: { id: 1 } })
    const res = await POST(makeRequest(payload, 'release'))
    expect(res.status).toBe(200)
    expect(getPRsBetweenTags).not.toHaveBeenCalled()
  })

  it('ignores release events for repos not in tag_based_mode', async () => {
    makeServiceMock({ repo: BASE_PR_REPO }) // tag_based_mode: false
    const res = await POST(makeRequest(RELEASE_PAYLOAD, 'release'))
    expect(res.status).toBe(200)
    expect(getPRsBetweenTags).not.toHaveBeenCalled()
  })

  it('rejects invalid tag names (XSS vector)', async () => {
    makeServiceMock({ repo: BASE_TAG_REPO })
    const payload = JSON.stringify({ action: 'published', release: { tag_name: '<script>alert(1)</script>', published_at: new Date().toISOString(), prerelease: false, draft: false }, repository: { id: 1 } })
    const res = await POST(makeRequest(payload, 'release'))
    expect(res.status).toBe(200)
    expect(getPRsBetweenTags).not.toHaveBeenCalled()
  })

  it('returns duplicate when tag entry already exists', async () => {
    makeServiceMock({ repo: BASE_TAG_REPO, existing: { id: 'entry-1' } })
    const res = await POST(makeRequest(RELEASE_PAYLOAD, 'release'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.duplicate).toBe(true)
    expect(getPRsBetweenTags).not.toHaveBeenCalled()
  })

  it('happy path: fetches PRs, generates release notes, inserts entry', async () => {
    makeServiceMock({ repo: BASE_TAG_REPO })
    ;(generateReleaseNotesDraft as ReturnType<typeof vi.fn>).mockResolvedValue({
      title: 'v1.0.0 — First release',
      body: '- Added login\n- Added dashboard',
    })
    const res = await POST(makeRequest(RELEASE_PAYLOAD, 'release'))
    expect(res.status).toBe(200)
    expect(getPRsBetweenTags).toHaveBeenCalled()
    expect(generateReleaseNotesDraft).toHaveBeenCalled()
    expect(await res.json()).toMatchObject({ ok: true })
  })

  it('creates entry with empty body when no PRs between tags', async () => {
    makeServiceMock({ repo: BASE_TAG_REPO })
    ;(getPRsBetweenTags as ReturnType<typeof vi.fn>).mockResolvedValue([])
    const res = await POST(makeRequest(RELEASE_PAYLOAD, 'release'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.empty).toBe(true)
    expect(generateReleaseNotesDraft).not.toHaveBeenCalled()
  })

  it('creates entry with placeholder when draft generation throws', async () => {
    makeServiceMock({ repo: BASE_TAG_REPO })
    ;(generateReleaseNotesDraft as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('OpenAI error'))
    const res = await POST(makeRequest(RELEASE_PAYLOAD, 'release'))
    // Should still return 200 — entry created with fallback text
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })

  it('returns 200 when repo is not found in tag mode (no enumeration leak)', async () => {
    makeServiceMock({ repo: null })
    const res = await POST(makeRequest(RELEASE_PAYLOAD, 'release'))
    expect(res.status).toBe(200)
  })
})
