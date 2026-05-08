import type { Octokit } from '@octokit/rest'

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
  // We fetch up to 100 at a time and look for currentTagName, then return
  // the next one.  For repos with >100 tags we paginate one extra page.
  for (let page = 1; page <= 2; page++) {
    const { data: tags } = await octokit.rest.repos.listTags({
      owner,
      repo,
      per_page: 100,
      page,
    })
    if (tags.length === 0) break
    const idx = tags.findIndex(t => t.name === currentTagName)
    if (idx !== -1) {
      // The tag immediately after in the list (higher index = older)
      const prev = tags[idx + 1]
      return prev?.name ?? null
    }
  }
  return null
}

/**
 * Returns all merged PRs that fall between `baseTag` (exclusive) and `headTag`
 * (inclusive).  When `baseTag` is null (first tag ever) it returns all PRs
 * merged on or before `headTagDate`.
 *
 * Strategy for the normal case:
 *   1. compareCommitsWithBasehead to get commits in range (≤ 250 commits; known
 *      limitation for very large releases — acceptable for v1).
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

  if (baseTag === null) {
    // First tag: collect all PRs merged up to headTagDate
    let page = 1
    while (true) {
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
      // If the oldest PR on this page was already merged before headTagDate,
      // earlier pages will only have even older PRs — stop.
      if (!anyInRange || list.length < 100) break
      page++
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
