import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ChangelogEntry } from '@/components/public/changelog-entry'
import { SubscribeForm } from '@/components/public/subscribe-form'
import type { Metadata } from 'next'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const service = createSupabaseServiceClient()
  const { data: workspace } = await service
    .from('workspaces')
    .select('name')
    .eq('slug', slug)
    .single()
  return {
    title: workspace ? `${workspace.name} Changelog` : 'Changelog',
    alternates: {
      types: {
        'application/rss+xml': `/${slug}/rss.xml`,
      },
    },
  }
}

export default async function PublicChangelogPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const service = createSupabaseServiceClient()

  const { data: workspace } = await service
    .from('workspaces')
    .select('id, name, logo_url, slug, plan')
    .eq('slug', slug)
    .single()
  if (!workspace) notFound()

  const { data: settings } = await service
    .from('changelog_settings')
    .select('page_title, page_description, show_powered_by')
    .eq('workspace_id', workspace.id)
    .single()

  const { data: entries } = await service
    .from('changelog_entries')
    .select('id, title, final_content, published_at, view_count')
    .eq('workspace_id', workspace.id)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(50)

  // Fire-and-forget: increment view counts for all visible entries
  // Do NOT await — this must not block page render
  if (entries && entries.length > 0) {
    void Promise.resolve(
      service.rpc('increment_entry_views', { entry_ids: entries.map(e => e.id) })
    ).catch(() => {
      // intentionally ignored — view count is best-effort
    })
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <header className="mb-10 space-y-3">
        {workspace.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={workspace.logo_url} alt={workspace.name} className="h-8 w-8 rounded" />
        )}
        <h1 className="text-2xl font-bold">
          {settings?.page_title ?? `${workspace.name} Changelog`}
        </h1>
        {settings?.page_description && (
          <p className="text-muted-foreground">{settings.page_description}</p>
        )}
        <SubscribeForm workspaceId={workspace.id} />
      </header>

      {!entries || entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">No updates yet.</p>
      ) : (
        <div className="space-y-8">
          {entries.map(entry => (
            <ChangelogEntry key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {/* Footer */}
      <footer className="mt-12 flex items-center justify-between text-xs text-muted-foreground">
        <a
          href={`/${workspace.slug}/rss.xml`}
          className="flex items-center gap-1 hover:text-foreground transition-colors"
          title="RSS feed"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19.01 7.38 20 6.18 20C4.98 20 4 19.01 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z"/>
          </svg>
          RSS
        </a>
        {['free', 'starter'].includes(workspace.plan ?? 'free') && settings?.show_powered_by !== false && (
          <span>
            Powered by{' '}
            <a href="https://mergecast.co" className="underline">
              Mergecast
            </a>
          </span>
        )}
      </footer>
    </div>
  )
}
