import { NextResponse } from 'next/server'
import { validateGitHubWebhookSignature, parsePullRequestEvent } from '@/lib/github/webhook'
import { shouldIgnorePR } from '@/lib/github/ignore-rules'
import { generateChangelogDraft, generateReleaseNotesDraft } from '@/lib/openai/generate-draft'
import { getInstallationOctokit } from '@/lib/github/app'
import { getPreviousTag, getPRsBetweenTags } from '@/lib/github/tags'
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

  if (event === 'create') {
    return handleTagCreate(rawBody, signature)
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
    return NextResponse.json({ ok: true, skipped: 'tag_mode' })
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
// create (tag push) handler
// ---------------------------------------------------------------------------

// GitHub create event payload shape (relevant fields only)
interface CreatePayload {
  ref: string
  ref_type: string
  repository: { id: number; full_name: string }
  // created_at is not in the webhook payload — we derive timing from the tag object
}

async function handleTagCreate(rawBody: string, signature: string): Promise<NextResponse> {
  let payload: CreatePayload
  try {
    payload = JSON.parse(rawBody) as CreatePayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Only process tag creation (not branch creation)
  if (payload.ref_type !== 'tag') {
    return NextResponse.json({ ok: true })
  }

  const tagName = payload.ref
  const githubRepoId = payload.repository?.id

  const service = createSupabaseServiceClient()

  // Only process repos in tag-based mode
  const { data: repo } = await service
    .from('repos')
    .select('id, workspace_id, webhook_secret, is_active, tag_based_mode, full_name, github_installation_id')
    .eq('github_repo_id', githubRepoId)
    .single()

  if (!repo || !repo.is_active || !repo.tag_based_mode) {
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

  const [owner, repoName] = repo.full_name.split('/')

  // Fetch PRs between previous tag and this one, then generate combined draft
  let draft = { title: tagName, body: '' }
  let empty = false

  try {
    const octokit = await getInstallationOctokit(repo.github_installation_id)

    // Use current time as an upper bound since webhook fires right after tag creation
    const headTagDate = new Date().toISOString()

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
    pr_url: `https://github.com/${repo.full_name}/releases/tag/${tagName}`,
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

