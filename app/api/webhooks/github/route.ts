import { NextResponse } from 'next/server'
import { validateGitHubWebhookSignature, parsePullRequestEvent } from '@/lib/github/webhook'
import { shouldIgnorePR } from '@/lib/github/ignore-rules'
import { generateChangelogDraft } from '@/lib/openai/generate-draft'
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
    // Return 200 (same as "repo not found") to avoid leaking whether a repo ID is connected.
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
