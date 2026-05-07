import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { EntryEditor } from '@/components/dashboard/entry-editor'
import { notFound } from 'next/navigation'

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: entryId } = await params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const service = createSupabaseServiceClient()
  const { data: membership } = await service
    .from('workspace_members')
    .select('workspaces(id, slug)')
    .eq('user_id', user!.id)
    .limit(1)
    .single()

  if (!membership) notFound()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workspace = membership.workspaces as any

  const { data: entry } = await service
    .from('changelog_entries')
    .select('*')
    .eq('id', entryId)
    .eq('workspace_id', workspace.id)
    .single()

  if (!entry) notFound()

  const { count: subscriberCount } = await service
    .from('subscribers')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspace.id)
    .eq('confirmed', true)
    .is('unsubscribed_at', null)

  return (
    <EntryEditor
      entry={entry}
      workspaceId={workspace.id}
      subscriberCount={subscriberCount ?? 0}
    />
  )
}
