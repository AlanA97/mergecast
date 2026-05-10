import { describe, it, expect, vi } from 'vitest'
import { getPreviousTag, getPRsBetweenTags, TAG_NAME_REGEX } from '@/lib/github/tags'
import type { Octokit } from '@octokit/rest'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePR(overrides: Partial<{
  number: number; title: string; body: string | null; html_url: string
  user: { login: string } | null; merged_at: string | null
  labels: Array<{ name?: string }>
}> = {}) {
  return {
    number: overrides.number ?? 1,
    title: overrides.title ?? 'Fix bug',
    body: overrides.body ?? 'description',
    html_url: overrides.html_url ?? 'https://github.com/org/repo/pull/1',
    user: overrides.user ?? { login: 'alice' },
    merged_at: overrides.merged_at !== undefined ? overrides.merged_at : new Date('2024-01-10T10:00:00Z').toISOString(),
    labels: overrides.labels ?? [],
  }
}

function makeOctokit(overrides: {
  tags?: Array<Array<{ name: string }>>  // pages of tags
  compare?: { commits: Array<{ sha: string }> }
  prsForCommit?: Record<string, ReturnType<typeof makePR>[]>
  pulls?: Array<ReturnType<typeof makePR>[]>  // pages of pulls
  ref?: { object: { sha: string; type: string } }
  tag?: { tagger: { date: string } }
  commit?: { commit: { committer: { date: string } | null } }
} = {}): Octokit {
  return {
    rest: {
      repos: {
        listTags: vi.fn().mockImplementation(({ page }: { page: number }) => {
          const pages = overrides.tags ?? [[]]
          const data = pages[page - 1] ?? []
          return Promise.resolve({ data })
        }),
        compareCommitsWithBasehead: vi.fn().mockResolvedValue({
          data: overrides.compare ?? { commits: [] }
        }),
        listPullRequestsAssociatedWithCommit: vi.fn().mockImplementation(
          ({ commit_sha }: { commit_sha: string }) => {
            const prs = overrides.prsForCommit?.[commit_sha] ?? []
            return Promise.resolve({ data: prs })
          }
        ),
        getCommit: vi.fn().mockResolvedValue({ data: overrides.commit ?? { commit: { committer: { date: '2024-01-10T12:00:00Z' } } } }),
      },
      pulls: {
        list: vi.fn().mockImplementation(({ page }: { page: number }) => {
          const pages = overrides.pulls ?? [[]]
          const data = pages[page - 1] ?? []
          return Promise.resolve({ data })
        }),
      },
      git: {
        getRef: vi.fn().mockResolvedValue({ data: overrides.ref ?? { object: { sha: 'abc', type: 'commit' } } }),
        getTag: vi.fn().mockResolvedValue({ data: overrides.tag ?? { tagger: { date: '2024-01-10T12:00:00Z' } } }),
      },
    },
  } as unknown as Octokit
}

// ---------------------------------------------------------------------------
// TAG_NAME_REGEX
// ---------------------------------------------------------------------------

describe('TAG_NAME_REGEX', () => {
  it('accepts semver tags', () => {
    expect(TAG_NAME_REGEX.test('v1.0.0')).toBe(true)
    expect(TAG_NAME_REGEX.test('1.2.3')).toBe(true)
    expect(TAG_NAME_REGEX.test('v10.20.30-rc.1')).toBe(true)
  })

  it('accepts slash-namespaced tags', () => {
    expect(TAG_NAME_REGEX.test('release/2024-01')).toBe(true)
  })

  it('rejects tags starting with a dot', () => {
    expect(TAG_NAME_REGEX.test('.hidden')).toBe(false)
  })

  it('rejects angle brackets (XSS vector)', () => {
    expect(TAG_NAME_REGEX.test('<script>alert(1)</script>')).toBe(false)
  })

  it('rejects whitespace', () => {
    expect(TAG_NAME_REGEX.test('v1 0 0')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(TAG_NAME_REGEX.test('')).toBe(false)
  })

  it('rejects tags longer than 200 characters', () => {
    expect(TAG_NAME_REGEX.test('v' + 'a'.repeat(201))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// getPreviousTag
// ---------------------------------------------------------------------------

describe('getPreviousTag', () => {
  it('returns null when there is only one tag', async () => {
    const octokit = makeOctokit({ tags: [[{ name: 'v1.0.0' }]] })
    const result = await getPreviousTag(octokit, 'org', 'repo', 'v1.0.0')
    expect(result).toBeNull()
  })

  it('returns the tag immediately before the current one', async () => {
    const octokit = makeOctokit({
      tags: [[{ name: 'v1.2.0' }, { name: 'v1.1.0' }, { name: 'v1.0.0' }]],
    })
    const result = await getPreviousTag(octokit, 'org', 'repo', 'v1.2.0')
    expect(result).toBe('v1.1.0')
  })

  it('returns null when the tag is not found within pagination limit', async () => {
    // Tag list returns empty after page 1, and current tag is not on page 1
    const octokit = makeOctokit({ tags: [[{ name: 'v2.0.0' }], []] })
    const result = await getPreviousTag(octokit, 'org', 'repo', 'v1.0.0')
    expect(result).toBeNull()
  })

  it('finds the tag on the second page', async () => {
    // Page 1: 100 newer tags; page 2 contains the current tag and its predecessor
    const page1 = Array.from({ length: 100 }, (_, i) => ({ name: `v${100 - i}.0.0` }))
    const page2 = [{ name: 'v0.2.0' }, { name: 'v0.1.0' }]
    const octokit = makeOctokit({ tags: [page1, page2] })
    const result = await getPreviousTag(octokit, 'org', 'repo', 'v0.2.0')
    expect(result).toBe('v0.1.0')
  })
})

// ---------------------------------------------------------------------------
// getPRsBetweenTags - normal case (baseTag provided)
// ---------------------------------------------------------------------------

describe('getPRsBetweenTags - with baseTag', () => {
  const HEAD_DATE = new Date('2024-01-15T00:00:00Z').toISOString()

  it('returns PRs associated with commits in the range', async () => {
    const pr = makePR({ number: 42, title: 'Add feature', merged_at: '2024-01-10T10:00:00Z' })
    const octokit = makeOctokit({
      compare: { commits: [{ sha: 'sha-a' }, { sha: 'sha-b' }] },
      prsForCommit: { 'sha-a': [pr], 'sha-b': [] },
    })
    const prs = await getPRsBetweenTags(octokit, 'org', 'repo', 'v1.0.0', 'v1.1.0', HEAD_DATE)
    expect(prs).toHaveLength(1)
    expect(prs[0].prNumber).toBe(42)
    expect(prs[0].prTitle).toBe('Add feature')
  })

  it('deduplicates PRs associated with multiple commits', async () => {
    const pr = makePR({ number: 10, merged_at: '2024-01-10T10:00:00Z' })
    const octokit = makeOctokit({
      compare: { commits: [{ sha: 'sha-a' }, { sha: 'sha-b' }] },
      prsForCommit: { 'sha-a': [pr], 'sha-b': [pr] },
    })
    const prs = await getPRsBetweenTags(octokit, 'org', 'repo', 'v1.0.0', 'v1.1.0', HEAD_DATE)
    expect(prs).toHaveLength(1)
  })

  it('excludes PRs merged after headTagDate', async () => {
    const future = makePR({ number: 99, merged_at: '2024-01-20T00:00:00Z' })
    const octokit = makeOctokit({
      compare: { commits: [{ sha: 'sha-a' }] },
      prsForCommit: { 'sha-a': [future] },
    })
    const prs = await getPRsBetweenTags(octokit, 'org', 'repo', 'v1.0.0', 'v1.1.0', HEAD_DATE)
    expect(prs).toHaveLength(0)
  })

  it('excludes unmerged PRs', async () => {
    const unmerged = makePR({ number: 5, merged_at: null })
    const octokit = makeOctokit({
      compare: { commits: [{ sha: 'sha-a' }] },
      prsForCommit: { 'sha-a': [unmerged] },
    })
    const prs = await getPRsBetweenTags(octokit, 'org', 'repo', 'v1.0.0', 'v1.1.0', HEAD_DATE)
    expect(prs).toHaveLength(0)
  })

  it('returns empty array when no commits in range', async () => {
    const octokit = makeOctokit({ compare: { commits: [] } })
    const prs = await getPRsBetweenTags(octokit, 'org', 'repo', 'v1.0.0', 'v1.1.0', HEAD_DATE)
    expect(prs).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// getPRsBetweenTags - first tag (baseTag = null)
// ---------------------------------------------------------------------------

describe('getPRsBetweenTags - no baseTag (first tag)', () => {
  const HEAD_DATE = new Date('2024-01-15T00:00:00Z').toISOString()

  it('collects all PRs merged before headTagDate', async () => {
    const pr = makePR({ number: 1, merged_at: '2024-01-10T10:00:00Z' })
    const octokit = makeOctokit({ pulls: [[pr]] })
    const prs = await getPRsBetweenTags(octokit, 'org', 'repo', null, 'v1.0.0', HEAD_DATE)
    expect(prs).toHaveLength(1)
    expect(prs[0].prNumber).toBe(1)
  })

  it('excludes PRs merged after headTagDate', async () => {
    const future = makePR({ number: 9, merged_at: '2024-01-20T00:00:00Z' })
    const octokit = makeOctokit({ pulls: [[future]] })
    const prs = await getPRsBetweenTags(octokit, 'org', 'repo', null, 'v1.0.0', HEAD_DATE)
    expect(prs).toHaveLength(0)
  })

  it('stops pagination when a page has no matching PRs', async () => {
    const future = makePR({ number: 1, merged_at: '2024-02-01T00:00:00Z' })
    const listSpy = vi.fn().mockResolvedValue({ data: [future] })
    const octokit = {
      rest: {
        repos: {
          listTags: vi.fn(), compareCommitsWithBasehead: vi.fn(),
          listPullRequestsAssociatedWithCommit: vi.fn(), getCommit: vi.fn(),
        },
        pulls: { list: listSpy },
        git: { getRef: vi.fn(), getTag: vi.fn() },
      },
    } as unknown as Octokit
    await getPRsBetweenTags(octokit, 'org', 'repo', null, 'v1.0.0', HEAD_DATE)
    // Should stop after first page with no in-range PRs
    expect(listSpy).toHaveBeenCalledTimes(1)
  })
})
