import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { deleteWebhookForRepo, updateWebhookEventsForRepo } from '@/lib/github/app'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const patchSchema = z.object({ tag_based_mode: z.boolean() })

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; repoId: string }> }
) {
  const { id: workspaceId, repoId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const service = createSupabaseServiceClient()

  const { data: membership } = await service
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  // Repo configuration changes require owner or admin role
  if (membership.role === 'member') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: repo } = await service
    .from('repos')
    .select('id, full_name, github_installation_id, webhook_id, tag_based_mode')
    .eq('id', repoId)
    .eq('workspace_id', workspaceId)
    .single()
  if (!repo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { tag_based_mode } = parsed.data

  // No-op if value is already correct
  if (repo.tag_based_mode === tag_based_mode) {
    return NextResponse.json({ repo })
  }

  // Update DB first
  const { data: updated, error: updateError } = await service
    .from('repos')
    .update({ tag_based_mode })
    .eq('id', repoId)
    .select()
    .single()
  if (updateError || !updated) {
    return NextResponse.json({ error: 'Failed to update repo' }, { status: 500 })
  }

  // Sync GitHub webhook events — if this fails, roll back the DB change
  if (repo.webhook_id) {
    const parts = repo.full_name.split('/')
    const owner = parts[0]
    const repoName = parts[1]
    if (!owner || !repoName) {
      return NextResponse.json({ error: 'Invalid repo full_name' }, { status: 500 })
    }
    const events = tag_based_mode ? ['pull_request', 'create'] : ['pull_request']
    try {
      await updateWebhookEventsForRepo(
        repo.github_installation_id,
        owner,
        repoName,
        repo.webhook_id,
        events
      )
    } catch {
      // Roll back so DB and GitHub webhook stay in sync
      await service.from('repos').update({ tag_based_mode: repo.tag_based_mode }).eq('id', repoId)
      return NextResponse.json(
        { error: 'Failed to update GitHub webhook — please try again' },
        { status: 502 }
      )
    }
  }

  return NextResponse.json({ repo: updated })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; repoId: string }> }
) {
  const { id: workspaceId, repoId } = await params
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

  const { data: repo } = await service
    .from('repos')
    .select('id, full_name, github_installation_id, webhook_id')
    .eq('id', repoId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!repo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Best-effort: remove the GitHub webhook so the repo stops sending events
  if (repo.webhook_id) {
    const [owner, repoName] = repo.full_name.split('/')
    try {
      await deleteWebhookForRepo(repo.github_installation_id, owner, repoName, repo.webhook_id)
    } catch {
      // Non-fatal — webhook may already be gone (uninstalled app, deleted repo, etc.)
    }
  }

  await service.from('repos').update({ is_active: false }).eq('id', repoId)

  return new NextResponse(null, { status: 204 })
}
