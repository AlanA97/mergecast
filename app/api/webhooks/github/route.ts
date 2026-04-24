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

  // Only process pull_request events
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
    // Not a merged PR — silently acknowledge
    return NextResponse.json({ ok: true })
  }

  const service = createSupabaseServiceClient()

  // Look up the repo record by github_repo_id
  const { data: repo } = await service
    .from('repos')
    .select('id, workspace_id, webhook_secret, is_active')
    .eq('github_repo_id', pr.repoId)
    .single()

  if (!repo) {
    // Unknown repo — acknowledge to prevent GitHub retries
    return NextResponse.json({ ok: true })
  }

  if (!repo.is_active) {
    return NextResponse.json({ ok: true })
  }

  // Validate HMAC with per-repo secret
  const valid = await validateGitHubWebhookSignature(rawBody, signature, repo.webhook_secret)
  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Idempotency: skip if entry for this PR already exists
  const { data: existing } = await service
    .from('changelog_entries')
    .select('id')
    .eq('repo_id', repo.id)
    .eq('pr_number', pr.prNumber)
    .single()

  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  // Check ignore rules — fail open (if DB unreachable, create the draft anyway)
  const { data: ignoreRules } = await service
    .from('pr_ignore_rules')
    .select('rule_type, pattern')
    .eq('workspace_id', repo.workspace_id)

  if (ignoreRules && shouldIgnorePR(pr.prTitle, pr.labels, ignoreRules)) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  // Generate AI draft
  const draft = await generateChangelogDraft({
    prTitle: pr.prTitle,
    prBody: pr.prBody,
  })

  // Create the draft changelog entry
  await service.from('changelog_entries').insert({
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

  return NextResponse.json({ ok: true })
}
