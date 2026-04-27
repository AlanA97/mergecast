import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { checkPublishQuota } from '@/lib/quota'
import { sendPublishEmail } from '@/lib/resend/email'
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

  const { data: workspace } = await service
    .from('workspaces')
    .select('id, plan, publish_count_this_month, publish_quota_reset_at, slug, name')
    .eq('id', workspaceId)
    .single()
  if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: membership } = await service
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quota = await checkPublishQuota(workspace as any, workspaceId)
  if (!quota.allowed) {
    return NextResponse.json({ error: quota.reason }, { status: 403 })
  }

  const { data: entry } = await service
    .from('changelog_entries')
    .select('*')
    .eq('id', entryId)
    .eq('workspace_id', workspaceId)
    .single()
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (entry.status === 'published') {
    return NextResponse.json({ error: 'Already published' }, { status: 409 })
  }

  const publishedAt = new Date().toISOString()

  const { data: published, error: updateError } = await service
    .from('changelog_entries')
    .update({ status: 'published', published_at: publishedAt, updated_at: publishedAt })
    .eq('id', entryId)
    .select()
    .single()
  if (updateError) return NextResponse.json({ error: 'Failed to publish' }, { status: 500 })

  // Atomic increment via RPC — avoids read-modify-write race under concurrent publishes
  await service.rpc('increment_publish_count', { p_workspace_id: workspaceId })

  // Fire-and-forget email send
  sendPublishEmail({
    workspaceId,
    workspaceName: (workspace as any).name,
    workspaceSlug: (workspace as any).slug,
    entry: published,
  }).catch(console.error)

  return NextResponse.json({ entry: published })
}
