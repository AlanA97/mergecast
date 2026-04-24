import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const UpdateChangelogSettingsSchema = z.object({
  show_powered_by: z.boolean().optional(),
  page_title: z.string().max(128).optional(),
  page_description: z.string().max(256).optional(),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const { data: settings } = await service
    .from('changelog_settings')
    .select('*')
    .eq('workspace_id', id)
    .single()

  if (!settings) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ settings })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = UpdateChangelogSettingsSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const service = createSupabaseServiceClient()

  // Verify membership
  const { data: membership } = await service
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', id)
    .eq('user_id', user.id)
    .single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: settings, error } = await service
    .from('changelog_settings')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('workspace_id', id)
    .select()
    .single()

  if (error || !settings) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  return NextResponse.json({ settings })
}
