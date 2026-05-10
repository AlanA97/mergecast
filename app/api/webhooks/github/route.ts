import { NextResponse } from 'next/server'
import { validateGitHubWebhookSignature, parsePullRequestEvent } from '@/lib/github/webhook'
import { shouldIgnorePR } from '@/lib/github/ignore-rules'
import { generateChangelogDraft, generateReleaseNotesDraft } from '@/lib/openai/generate-draft'
import { getInstallationOctokit } from '@/lib/github/app'
import { getPreviousTag, getPRsBetweenTags, TAG_NAME_REGEX } from '@/lib/github/tags'
import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { createRateLimiter } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// Limit per-IP to 120 webhook deliveries per minute (well above any real repo's PR rate).
// This prevents repo-ID enumeration by brute-forcing the endpoint.
const limiter = createRateLimiter({ windowMs: 60_000, max: 120 })

export async function POST(request: Request) {
  const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
  if (!limiter.check(ip)) {
    return NextResponse.json({ ok: true }, { status: 429 })
  }

  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256') ?? ''
  const event = request.headers.get('x-github-event') ?? ''

  if (event === 'pull_request') {
    return handlePullRequest(rawBody, signature)
  }

  if (event === 'release') {
    return handleRelease(rawBody, signature)
  }

  return NextResponse.json({ ok: true })
}

// ---------------------------------------------------------------------------
// pull_request handler
// ---------------------------------------------------------------------------

async function handlePullRequest(rawBody: string, signature: string): Promise<NextResponse> {
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
    .select('id, workspace_id, webhook_secret, is_active, tag_based_mode')
    .eq('github_repo_id', pr.repoId)
    .single()

  if (!repo || !repo.is_active) {
    // Constant-time dummy HMAC comparison to prevent repo ID enumeration via timing
    await validateGitHubWebhookSignature(rawBody, signature, 'dummy-constant-time-secret')
    return NextResponse.json({ ok: true })
  }

  const valid = await validateGitHubWebhookSignature(rawBody, signature, repo.webhook_secret)
  if (!valid) {
    // Return 200 (same as "repo not found") to avoid leaking whether a repo ID is connected.
    return NextResponse.json({ ok: true })
  }

  // In tag-based mode, individual PR merges are intentionally skipped.
  // The tag push will aggregate them instead.
  if (repo.tag_based_mode) {
    return NextResponse.json({ ok: true })
  }

  // Idempotency pre-check (optimization: avoids calling OpenAI for duplicates)
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

// ---------------------------------------------------------------------------
// release (published) handler
// ---------------------------------------------------------------------------

// GitHub release event payload shape (relevant fields only)
interface ReleasePayload {
  action: string
  release: {
    tag_name: string
    published_at: string | null
    prerelease: boolean
    draft: boolean
  }
  repository: { id: number; full_name: string }
}

async function handleRelease(rawBody: string, signature: string): Promise<NextResponse> {
  let payload: ReleasePayload
  try {
    payload = JSON.parse(rawBody) as ReleasePayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Only process published releases — ignore created (draft), edited, deleted, etc.
  if (payload.action !== 'published') {
    return NextResponse.json({ ok: true })
  }

  const tagName = payload.release?.tag_name
  const githubRepoId = payload.repository?.id

  // Validate tag name against allowlist before writing anything to the DB or
  // constructing URLs. Rejects names with whitespace, angle brackets, or other
  // characters that could cause XSS or prompt injection downstream.
  if (!tagName || !TAG_NAME_REGEX.test(tagName)) {
    return NextResponse.json({ ok: true })
  }

  const service = createSupabaseServiceClient()

  // Only process repos in tag-based mode
  const { data: repo } = await service
    .from('repos')
    .select('id, workspace_id, webhook_secret, is_active, tag_based_mode, full_name, github_installation_id')
    .eq('github_repo_id', githubRepoId)
    .single()

  if (!repo || !repo.is_active || !repo.tag_based_mode) {
    // Constant-time dummy HMAC comparison to prevent repo ID enumeration via timing
    await validateGitHubWebhookSignature(rawBody, signature, 'dummy-constant-time-secret')
    return NextResponse.json({ ok: true })
  }

  const valid = await validateGitHubWebhookSignature(rawBody, signature, repo.webhook_secret)
  if (!valid) {
    return NextResponse.json({ ok: true })
  }

  // Idempotency: one entry per tag per repo
  const { data: existing } = await service
    .from('changelog_entries')
    .select('id')
    .eq('repo_id', repo.id)
    .eq('tag_name', tagName)
    .single()

  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  // Validate full_name format before splitting
  const parts = repo.full_name.split('/')
  const owner = parts[0]
  const repoName = parts[1]
  if (!owner || !repoName) {
    return NextResponse.json({ error: 'Invalid repo full_name' }, { status: 500 })
  }

  // Fetch PRs between previous tag and this one, then generate combined draft
  let draft = { title: tagName, body: '' }
  let empty = false

  try {
    const octokit = await getInstallationOctokit(repo.github_installation_id)

    // Use the release's published_at as the upper-bound for PR attribution.
    // Validate before use: an invalid date string produces NaN, which silently
    // bypasses the merged_at filter in getPRsBetweenTags and admits all PRs.
    const rawPublishedAt = payload.release.published_at
    const parsedMs = rawPublishedAt ? new Date(rawPublishedAt).getTime() : NaN
    const headTagDate = Number.isFinite(parsedMs)
      ? rawPublishedAt!
      : new Date().toISOString()

    const previousTag = await getPreviousTag(octokit, owner, repoName, tagName)
    let prs = await getPRsBetweenTags(octokit, owner, repoName, previousTag, tagName, headTagDate)

    // Apply workspace ignore rules to each PR
    const { data: ignoreRules } = await service
      .from('pr_ignore_rules')
      .select('rule_type, pattern')
      .eq('workspace_id', repo.workspace_id)

    if (ignoreRules) {
      prs = prs.filter(pr => !shouldIgnorePR(pr.prTitle, pr.labels, ignoreRules))
    }

    if (prs.length === 0) {
      empty = true
    } else {
      draft = await generateReleaseNotesDraft({
        tagName,
        prs: prs.map(p => ({ prTitle: p.prTitle, prBody: p.prBody })),
      })
      // If AI returns empty (infra-only release), keep tagName as title
      if (!draft.title) draft.title = tagName
    }
  } catch {
    // Non-fatal — create entry with placeholder so user can regenerate
    draft = {
      title: tagName,
      body: 'Draft generation failed — please click Regenerate to try again.',
    }
  }

  const { error: insertError } = await service.from('changelog_entries').insert({
    workspace_id: repo.workspace_id,
    repo_id: repo.id,
    pr_number: null,
    tag_name: tagName,
    pr_title: tagName,
    pr_body: null,
    pr_url: `https://github.com/${repo.full_name}/releases/tag/${encodeURIComponent(tagName)}`,
    pr_author: null,
    pr_merged_at: null,
    ai_draft: draft.body,
    title: draft.title,
    final_content: draft.body,
    status: 'draft',
  })

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ ok: true, duplicate: true })
    }
    return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, ...(empty ? { empty: true } : {}) })
}

