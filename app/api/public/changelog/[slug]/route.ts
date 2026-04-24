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
    .select('id, name, logo_url, slug')
    .eq('slug', slug)
    .single()

  if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: entries } = await service
    .from('changelog_entries')
    .select('id, title, final_content, published_at')
    .eq('workspace_id', workspace.id)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(50)

  return NextResponse.json(
    { workspace, entries: entries ?? [] },
    { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' } }
  )
}
