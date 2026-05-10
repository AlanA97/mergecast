import type { Octokit } from '@octokit/rest'

/**
 * Allowlist for tag names stored in the DB and used to construct GitHub URLs.
 * Permits semver, date-based, and slash-namespaced tags (e.g. v1.0.0, release/2024-01).
 * Rejects anything containing shell metacharacters, whitespace, or angle brackets
 * that could cause XSS if rendered unescaped or prompt injection if sent to OpenAI.
 */
export const TAG_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._\-/]{0,199}$/

export interface TagPR {
  prNumber: number
  prTitle: string
  prBody: string
  prUrl: string
  prAuthor: string
  prMergedAt: string
  labels: string[]
}

/**
 * Returns the tag pushed immediately before `currentTagName` in the repo's
 * tag list (newest-first order), or null if it is the first tag ever.
 */
export async function getPreviousTag(
  octokit: Octokit,
  owner: string,
  repo: string,
  currentTagName: string
): Promise<string | null> {
  // GitHub returns tags newest-first (by tagger date / push order).
  // Paginate until we find currentTagName (up to MAX_TAG_PAGES × 100 = 1 000 tags).
  const MAX_TAG_PAGES = 10
  let lastTagOnPreviousPage: string | null = null

  for (let page = 1; page <= MAX_TAG_PAGES; page++) {
    const { data: tags } = await octokit.rest.repos.listTags({
      owner,
      repo,
      per_page: 100,
      page,
    })
    if (tags.length === 0) break

    const idx = tags.findIndex(t => t.name === currentTagName)
    if (idx !== -1) {
      if (idx + 1 < tags.length) return tags[idx + 1].name
      // currentTagName is the last entry on this page - the previous tag was
      // the first entry on the *previous* page (captured in lastTagOnPreviousPage).
      // But since tags are newest-first, the "previous" chronological tag is
      // actually the next item in the list (older tag). If it's the last entry
      // on this page, we need the first entry of the next page.
      const { data: nextPage } = await octokit.rest.repos.listTags({
        owner, repo, per_page: 1, page: page + 1,
      })
      return nextPage[0]?.name ?? null
    }

    lastTagOnPreviousPage = tags[tags.length - 1].name
    if (tags.length < 100) break // last page reached without finding current tag
  }
  // Not found within pagination limit - treat as first tag (conservative fallback)
  void lastTagOnPreviousPage
  return null
}

/**
 * Returns all merged PRs that fall between `baseTag` (exclusive) and `headTag`
 * (inclusive).  When `baseTag` is null (first tag ever) it returns all PRs
 * merged on or before `headTagDate`.
 *
 * Strategy for the normal case:
 *   1. compareCommitsWithBasehead to get commits in range (≤ 250 commits; known
 *      limitation for very large releases, acceptable for v1).
 *   2. For each commit SHA, call listPullRequestsAssociatedWithCommit.
 *   3. Deduplicate by PR number; filter to merged_at ≤ headTagDate.
 *
 * Strategy when baseTag is null:
 *   List closed PRs sorted by updated desc and keep those merged ≤ headTagDate.
 */
export async function getPRsBetweenTags(
  octokit: Octokit,
  owner: string,
  repo: string,
  baseTag: string | null,
  headTag: string,
  headTagDate: string
): Promise<TagPR[]> {
  const headTs = new Date(headTagDate).getTime()
  const seen = new Set<number>()
  const prs: TagPR[] = []

  function addPR(pr: {
    number: number
    title: string
    body: string | null
    html_url: string
    user: { login: string } | null
    merged_at: string | null
    labels: Array<{ name?: string }>
  }) {
    if (!pr.merged_at) return
    if (new Date(pr.merged_at).getTime() > headTs) return
    if (seen.has(pr.number)) return
    seen.add(pr.number)
    prs.push({
      prNumber: pr.number,
      prTitle: pr.title,
      prBody: pr.body ?? '',
      prUrl: pr.html_url,
      prAuthor: pr.user?.login ?? '',
      prMergedAt: pr.merged_at,
      labels: pr.labels.map(l => l.name ?? '').filter(Boolean),
    })
  }

  // Maximum PRs to include in a single release entry (OpenAI token safety + UX)
  const MAX_PRS = 100
  const MAX_PR_PAGES = 10

  if (baseTag === null) {
    // First tag: collect PRs merged up to headTagDate, bounded by MAX_PR_PAGES
    for (let page = 1; page <= MAX_PR_PAGES && seen.size < MAX_PRS; page++) {
      const { data: list } = await octokit.rest.pulls.list({
        owner,
        repo,
        state: 'closed',
        sort: 'updated',
        direction: 'desc',
        per_page: 100,
        page,
      })
      if (list.length === 0) break
      let anyInRange = false
      for (const pr of list) {
        if (pr.merged_at && new Date(pr.merged_at).getTime() <= headTs) {
          anyInRange = true
          addPR(pr)
        }
      }
      // If none on this page fall within the window, earlier pages won't either
      if (!anyInRange || list.length < 100) break
    }
  } else {
    // Normal case: compare baseTag...headTag
    const { data: comparison } = await octokit.rest.repos.compareCommitsWithBasehead({
      owner,
      repo,
      basehead: `${baseTag}...${headTag}`,
      per_page: 250,
    })

    for (const commit of comparison.commits) {
      const { data: associated } = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
        owner,
        repo,
        commit_sha: commit.sha,
      })
      for (const pr of associated) {
        addPR(pr as Parameters<typeof addPR>[0])
      }
    }
  }

  // Sort by merge date ascending (oldest first) for the AI prompt
  return prs.sort((a, b) => new Date(a.prMergedAt).getTime() - new Date(b.prMergedAt).getTime())
}
