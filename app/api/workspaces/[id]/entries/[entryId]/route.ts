import { createSupabaseServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

type Params = { params: Promise<{ id: string; entryId: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id: workspaceId, entryId } = await params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: entry } = await supabase
    .from('changelog_entries')
    .select('*')
    .eq('id', entryId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ entry })
}

const UpdateEntrySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  final_content: z.string().optional(),
  status: z.enum(['archived', 'ignored', 'draft']).optional(),
})

export async function PATCH(request: Request, { params }: Params) {
  const { id: workspaceId, entryId } = await params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = UpdateEntrySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { data: entry, error } = await supabase
    .from('changelog_entries')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', entryId)
    .eq('workspace_id', workspaceId)
    .select()
    .single()

  if (error || !entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ entry })
}
