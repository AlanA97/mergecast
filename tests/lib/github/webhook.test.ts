import { describe, it, expect } from 'vitest'
import { validateGitHubWebhookSignature, parsePullRequestEvent } from '@/lib/github/webhook'

const SECRET = 'test-secret-abc'

async function makeSignedRequest(body: string, secret: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  const hex = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
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
    const payload = {
      action: 'closed',
      pull_request: { merged: false, title: 'test', number: 1, body: '', html_url: '', user: { login: 'user' }, merged_at: null },
      repository: { id: 123, full_name: 'owner/repo' },
    }
    expect(parsePullRequestEvent(payload)).toBeNull()
  })

  it('returns null for non-closed actions', () => {
    const payload = {
      action: 'opened',
      pull_request: { merged: false, title: 'test', number: 1, body: '', html_url: '', user: { login: 'user' }, merged_at: null },
      repository: { id: 123, full_name: 'owner/repo' },
    }
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

  it('returns empty labels array when labels key is absent from payload', () => {
    const payload = {
      action: 'closed',
      pull_request: {
        merged: true,
        number: 10,
        title: 'Fix bug',
        body: '',
        html_url: 'https://github.com/o/r/pull/10',
        user: { login: 'dev' },
        merged_at: '2026-04-22T10:00:00Z',
        // no labels property at all
      },
      repository: { id: 1, full_name: 'o/r' },
    }
    const result = parsePullRequestEvent(payload)
    expect(result?.labels).toEqual([])
  })

  it('returns a PR that would match an ignore rule — shouldIgnorePR handles the skip', () => {
    // This verifies that parsePullRequestEvent correctly surfaces titles and labels
    // so the webhook handler can feed them into shouldIgnorePR for filtering.
    const payload = {
      action: 'closed',
      pull_request: {
        merged: true,
        number: 20,
        title: 'chore: update lockfile',
        body: '',
        html_url: 'https://github.com/o/r/pull/20',
        user: { login: 'renovate' },
        merged_at: '2026-04-22T10:00:00Z',
        labels: [{ name: 'dependencies' }],
      },
      repository: { id: 1, full_name: 'o/r' },
    }
    const result = parsePullRequestEvent(payload)
    expect(result?.prTitle).toBe('chore: update lockfile')
    expect(result?.labels).toEqual(['dependencies'])
    // A rule like { rule_type: 'title_prefix', pattern: 'chore:' } would match this PR.
    // That filtering is tested in tests/lib/github/ignore-rules.test.ts.
  })

  it('filters out labels with null or missing name', () => {
    const payload = {
      action: 'closed',
      pull_request: {
        merged: true,
        number: 11,
        title: 'Fix bug',
        body: '',
        html_url: 'https://github.com/o/r/pull/11',
        user: { login: 'dev' },
        merged_at: '2026-04-22T10:00:00Z',
        labels: [{ name: 'valid' }, { name: null }, {}],
      },
      repository: { id: 1, full_name: 'o/r' },
    }
    const result = parsePullRequestEvent(payload)
    expect(result?.labels).toEqual(['valid'])
  })
})
