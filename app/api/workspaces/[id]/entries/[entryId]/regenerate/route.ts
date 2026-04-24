import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { generateChangelogDraft } from '@/lib/openai/generate-draft'
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
  const { data: entry } = await service
    .from('changelog_entries')
    .select('pr_title, pr_body, workspace_id')
    .eq('id', entryId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const draft = await generateChangelogDraft({
    prTitle: entry.pr_title ?? '',
    prBody: entry.pr_body ?? '',
  })

  const { data: updated } = await service
    .from('changelog_entries')
    .update({ ai_draft: draft.body, updated_at: new Date().toISOString() })
    .eq('id', entryId)
    .select()
    .single()

  return NextResponse.json({ entry: updated })
}
