import type { MetadataRoute } from 'next'
import { createSupabaseServiceClient } from '@/lib/supabase/server'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mergecast.co'

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: appUrl, lastModified: new Date(), changeFrequency: 'monthly', priority: 1 },
    { url: `${appUrl}/privacy`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${appUrl}/terms`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
  ]

  // Include public changelog pages for each workspace that has at least one
  // published entry so we only index changelogs that have real content.
  try {
    const service = createSupabaseServiceClient()
    const { data: workspaces } = await service
      .from('workspaces')
      .select('slug, updated_at')
      .order('updated_at', { ascending: false })

    const changelogRoutes: MetadataRoute.Sitemap = (workspaces ?? []).map(ws => ({
      url: `${appUrl}/${ws.slug}`,
      lastModified: new Date(ws.updated_at),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }))

    return [...staticRoutes, ...changelogRoutes]
  } catch {
    // If the DB is unavailable at build time, fall back to static routes only.
    return staticRoutes
  }
}
