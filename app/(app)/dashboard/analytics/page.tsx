import { redirect } from 'next/navigation'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import { Card, CardHeader, CardDescription, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AnalyticsCharts } from '@/components/dashboard/analytics-charts'
import { getWorkspaceAnalytics } from '@/lib/analytics'

export default async function AnalyticsPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const service = createSupabaseServiceClient()
  const { data: membership } = await service
    .from('workspace_members')
    .select('workspaces(id)')
    .eq('user_id', user!.id)
    .limit(1)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workspaceId = (membership?.workspaces as any)?.id as string | undefined
  if (!workspaceId) redirect('/dashboard')

  const analytics = await getWorkspaceAnalytics(workspaceId)
  const { kpis, subscriber_growth, publishing_cadence, top_entries, email_history } = analytics

  const quotaDisplay = kpis.publish_quota === -1 ? '∞' : String(kpis.publish_quota)

  return (
    <div className="p-4 md:p-6 max-w-5xl space-y-6">
      <h1 className="text-xl font-semibold">Analytics</h1>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription
              title="Every page load of your public changelog increments all visible entries. This counts appearances, not individual reads."
            >
              Impressions
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {kpis.total_impressions.toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active subscribers</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {kpis.active_subscribers.toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Published entries</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {kpis.published_entries.toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Publishes this month</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {kpis.publish_count_this_month} / {quotaDisplay}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Charts */}
      <AnalyticsCharts
        subscriberGrowth={subscriber_growth}
        publishingCadence={publishing_cadence}
      />

      {/* Top entries by impressions */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Top entries by impressions</h2>
        {top_entries.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-sm text-muted-foreground">No published entries yet.</p>
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Title</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">Published</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Impressions</th>
                </tr>
              </thead>
              <tbody>
                {top_entries.map((entry, i) => (
                  <tr key={entry.id} className={i < top_entries.length - 1 ? 'border-b' : ''}>
                    <td className="px-4 py-2.5 font-medium truncate max-w-xs">{entry.title}</td>
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                      {format(new Date(entry.published_at), 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {entry.impressions.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Email delivery history */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Recent email sends</h2>
        {email_history.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-sm text-muted-foreground">No emails sent yet.</p>
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Entry</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">Sent</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Recipients</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {email_history.map((send, i) => (
                  <tr key={`${send.sent_at}-${i}`} className={i < email_history.length - 1 ? 'border-b' : ''}>
                    <td className="px-4 py-2.5 font-medium truncate max-w-xs">{send.entry_title}</td>
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                      {send.sent_at ? format(new Date(send.sent_at), 'MMM d, yyyy') : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {send.recipient_count.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Badge
                        variant={
                          send.status === 'sent'
                            ? 'default'
                            : send.status === 'failed'
                              ? 'destructive'
                              : 'secondary'
                        }
                      >
                        {send.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
