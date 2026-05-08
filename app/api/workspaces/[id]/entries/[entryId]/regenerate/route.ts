import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { generateChangelogDraft, generateReleaseNotesDraft } from '@/lib/openai/generate-draft'
import { getInstallationOctokit } from '@/lib/github/app'
import { getPreviousTag, getPRsBetweenTags } from '@/lib/github/tags'
import { shouldIgnorePR } from '@/lib/github/ignore-rules'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ id: string; entryId: string }> }

export async function POST(_req: Request, { params }: Params) {
  const { id: workspaceId, entryId } = await params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()

  const { data: membership } = await service
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: entry } = await service
    .from('changelog_entries')
    .select('pr_title, pr_body, workspace_id, tag_name, repo_id')
    .eq('id', entryId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let draft: { title: string; body: string }

  if (entry.tag_name) {
    // Tag-based entry: re-fetch the PRs from GitHub and regenerate release notes
    const { data: repo } = await service
      .from('repos')
      .select('full_name, github_installation_id')
      .eq('id', entry.repo_id)
      .single()

    if (!repo) return NextResponse.json({ error: 'Repo not found' }, { status: 404 })

    const parts = repo.full_name.split('/')
    const owner = parts[0]
    const repoName = parts[1]
    if (!owner || !repoName) {
      return NextResponse.json({ error: 'Invalid repo name' }, { status: 500 })
    }

    try {
      const octokit = await getInstallationOctokit(repo.github_installation_id)
      const previousTag = await getPreviousTag(octokit, owner, repoName, entry.tag_name)
      // Use current time as upper bound — regenerate is user-initiated so no delivery delay concern
      const prsRaw = await getPRsBetweenTags(
        octokit, owner, repoName, previousTag, entry.tag_name, new Date().toISOString()
      )

      // Apply workspace ignore rules
      const { data: ignoreRules } = await service
        .from('pr_ignore_rules')
        .select('rule_type, pattern')
        .eq('workspace_id', workspaceId)

      const prs = ignoreRules
        ? prsRaw.filter(pr => !shouldIgnorePR(pr.prTitle, pr.labels, ignoreRules))
        : prsRaw

      if (prs.length === 0) {
        draft = { title: entry.tag_name, body: '' }
      } else {
        draft = await generateReleaseNotesDraft({
          tagName: entry.tag_name,
          prs: prs.map(p => ({ prTitle: p.prTitle, prBody: p.prBody })),
        })
        if (!draft.title) draft.title = entry.tag_name
      }
    } catch (err) {
      console.error('[regenerate] tag release notes error:', err)
      return NextResponse.json({ error: 'Failed to generate release notes' }, { status: 500 })
    }
  } else {
    // Standard PR-based entry
    try {
      draft = await generateChangelogDraft({
        prTitle: entry.pr_title ?? '',
        prBody: entry.pr_body ?? '',
      })
    } catch (err) {
      console.error('[regenerate] OpenAI error:', err)
      return NextResponse.json({ error: 'Failed to generate draft' }, { status: 500 })
    }
  }

  const { data: updated, error: updateError } = await service
    .from('changelog_entries')
    .update({
      ai_draft: draft.body,
      title: draft.title || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', entryId)
    .select()
    .single()

  if (updateError || !updated) {
    return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 })
  }

  return NextResponse.json({ entry: updated })
}
