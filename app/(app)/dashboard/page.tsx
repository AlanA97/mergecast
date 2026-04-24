import { createSupabaseServerClient } from '@/lib/supabase/server'
import { EntryCard } from '@/components/dashboard/entry-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'
import { ExternalLink, AlertTriangle } from 'lucide-react'
import { redirect } from 'next/navigation'

async function getWorkspaceForUser(userId: string) {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('workspace_members')
    .select('workspaces(*)')
    .eq('user_id', userId)
    .limit(1)
    .single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data?.workspaces as any
}

async function getEntries(workspaceId: string, status?: string) {
  const supabase = await createSupabaseServerClient()
  let query = supabase
    .from('changelog_entries')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (status) query = query.eq('status', status)
  const { data } = await query
  return data ?? []
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const workspace = await getWorkspaceForUser(user!.id)
  if (!workspace) {
    redirect('/onboarding')
  }
  const { tab } = await searchParams
  const activeTab = tab ?? 'all'

  const [all, drafts, published] = await Promise.all([
    getEntries(workspace.id),
    getEntries(workspace.id, 'draft'),
    getEntries(workspace.id, 'published'),
  ])

  const entries =
    activeTab === 'draft' ? drafts : activeTab === 'published' ? published : all

  // Approaching-limit banner logic
  const isFree = workspace.plan === 'free'
  const publishCount: number = (workspace as any).publish_count_this_month ?? 0
  const FREE_LIMIT = 3
  const showYellowBanner = isFree && publishCount === FREE_LIMIT - 1  // 2/3 used
  const showRedBanner = isFree && publishCount >= FREE_LIMIT           // 3/3 used

  return (
    <div className="p-6 max-w-3xl">
      {/* Approaching-limit banners */}
      {showRedBanner && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Monthly publish limit reached.</span>
          </div>
          <Link href="/dashboard/billing" className="font-medium text-destructive underline underline-offset-2">
            Upgrade to publish →
          </Link>
        </div>
      )}
      {showYellowBanner && !showRedBanner && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-yellow-500/50 bg-yellow-500/10 px-4 py-3 text-sm">
          <span className="text-yellow-700 dark:text-yellow-400">
            1 publish left this month on the free plan.
          </span>
          <Link href="/dashboard/billing" className="font-medium text-yellow-700 dark:text-yellow-400 underline underline-offset-2">
            Upgrade to remove limits →
          </Link>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Entries</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Merge a PR to generate your next draft automatically.
          </p>
        </div>
        <Link
          href={`/${workspace.slug}`}
          target="_blank"
          className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[0.8rem] font-medium transition-colors hover:bg-muted"
        >
          <ExternalLink className="h-3 w-3" />
          View changelog
        </Link>
      </div>
      <Tabs defaultValue={activeTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="all">All ({all.length})</TabsTrigger>
          <TabsTrigger value="draft">Drafts ({drafts.length})</TabsTrigger>
          <TabsTrigger value="published">Published ({published.length})</TabsTrigger>
        </TabsList>
        <TabsContent value={activeTab}>
          {entries.length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center">
              <p className="text-muted-foreground text-sm">
                {activeTab === 'draft'
                  ? 'No drafts. Merge a PR to get started.'
                  : activeTab === 'published'
                    ? 'Nothing published yet.'
                    : 'No entries yet. Connect a repo and merge a PR.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map(entry => (
                <EntryCard key={entry.id} entry={entry} workspaceId={workspace.id} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
