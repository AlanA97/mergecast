import { readFileSync } from 'fs'
import { join } from 'path'
import { createSupabaseServiceClient } from '@/lib/supabase/server'

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

  const widgetPath = join(process.cwd(), 'public/widget/widget.js')
  let widgetJs: string
  try {
    widgetJs = readFileSync(widgetPath, 'utf-8')
  } catch {
    return new Response('/* widget not built */', {
      headers: { 'Content-Type': 'application/javascript' },
    })
  }

  if (!workspace) {
    return new Response('/* workspace not found */', {
      headers: { 'Content-Type': 'application/javascript' },
    })
  }

  return new Response(widgetJs, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  })
}
