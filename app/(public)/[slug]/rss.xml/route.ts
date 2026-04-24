import { createSupabaseServiceClient } from '@/lib/supabase/server'

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const service = createSupabaseServiceClient()

  const { data: workspace } = await service
    .from('workspaces')
    .select('id, name')
    .eq('slug', slug)
    .single()

  if (!workspace) {
    return new Response('Not found', { status: 404 })
  }

  const { data: entries } = await service
    .from('changelog_entries')
    .select('id, title, final_content, published_at')
    .eq('workspace_id', workspace.id)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(50)

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mergecast.co'
  const channelUrl = `${baseUrl}/${slug}`

  const items = (entries ?? []).map(entry => `
    <item>
      <title>${escapeXml(entry.title ?? 'Update')}</title>
      <link>${channelUrl}#${entry.id}</link>
      <guid isPermaLink="false">${entry.id}</guid>
      <pubDate>${new Date(entry.published_at).toUTCString()}</pubDate>
      <description><![CDATA[${entry.final_content ?? ''}]]></description>
    </item>`).join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(workspace.name)} Changelog</title>
    <link>${channelUrl}</link>
    <description>Latest updates from ${escapeXml(workspace.name)}</description>
    <language>en</language>${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
