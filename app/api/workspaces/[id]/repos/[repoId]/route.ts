import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { deleteWebhookForRepo } from '@/lib/github/app'
import { NextResponse } from 'next/server'

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
