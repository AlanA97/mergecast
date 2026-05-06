import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const service = createSupabaseServiceClient()

  const { data: workspace } = await service
    .from('workspaces')
    .select('id')
    .eq('slug', slug)
    .single()

  if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: settings } = await service
    .from('widget_settings')
    .select('position, theme, accent_color, button_label')
    .eq('workspace_id', workspace.id)
    .single()

  // Fall back to defaults if no row yet (shouldn't happen — created with workspace)
  return NextResponse.json({
    settings: settings ?? {
      position: 'bottom-right',
      theme: 'light',
      accent_color: '#000000',
      button_label: "What's new",
    },
  })
}
