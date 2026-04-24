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
  insertError = null,
}: {
  repo?: object | null
  existing?: object | null
  insertError?: { code: string; message: string } | null
} = {}) {
  const repoSingle = vi.fn().mockResolvedValue({ data: repo })
  const existingSingle = vi.fn().mockResolvedValue({ data: existing })

  ;(createSupabaseServiceClient as any).mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === 'repos') {
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: repoSingle }
      }
      if (table === 'pr_ignore_rules') {
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [] }) }
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
