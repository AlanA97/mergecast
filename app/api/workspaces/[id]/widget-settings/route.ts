import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const UpdateWidgetSettingsSchema = z.object({
  position: z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']).optional(),
  theme: z.enum(['light', 'dark']).optional(),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  button_label: z.string().min(1).max(32).optional(),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workspaceId } = await params
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

  const { data: settings } = await service
    .from('widget_settings')
    .select('*')
    .eq('workspace_id', workspaceId)
    .single()

  if (!settings) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ settings })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workspaceId } = await params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = UpdateWidgetSettingsSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const service = createSupabaseServiceClient()

  const { data: membership } = await service
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: settings, error } = await service
    .from('widget_settings')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .select()
    .single()

  if (error || !settings) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  return NextResponse.json({ settings })
}
