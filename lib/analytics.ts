import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { format, subMonths } from 'date-fns'
import { PLAN_LIMITS, type Plan } from '@/lib/plans'

export interface AnalyticsData {
  kpis: {
    total_views: number
    active_subscribers: number
    published_entries: number
    publish_count_this_month: number
    publish_quota: number // -1 = unlimited (Infinity cannot serialize to JSON)
  }
  subscriber_growth: { month: string; new_subscribers: number }[]
  publishing_cadence: { month: string; count: number }[]
  top_entries: { id: string; title: string; published_at: string; view_count: number }[]
  email_history: { sent_at: string; recipient_count: number; status: string; entry_title: string }[]
}

function last6MonthBuckets(): string[] {
  return Array.from({ length: 6 }, (_, i) =>
    format(subMonths(new Date(), 5 - i), 'MMM yyyy')
  )
}

export async function getWorkspaceAnalytics(workspaceId: string): Promise<AnalyticsData> {
  const service = createSupabaseServiceClient()

  const [wsResult, entriesResult, subsResult, emailResult] = await Promise.all([
    service
      .from('workspaces')
      .select('plan, publish_count_this_month')
      .eq('id', workspaceId)
      .single(),
    service
      .from('changelog_entries')
      .select('id, title, status, view_count, published_at')
      .eq('workspace_id', workspaceId)
      .limit(2000),
    service
      .from('subscribers')
      .select('confirmed_at')
      .eq('workspace_id', workspaceId)
      .eq('confirmed', true)
      .is('unsubscribed_at', null),
    service
      .from('email_sends')
      .select('sent_at, recipient_count, status, entry_id, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const ws = wsResult.data
  const entries = entriesResult.data ?? []
  const confirmedSubs = subsResult.data ?? []
  const emailSends = emailResult.data ?? []

  // KPIs
  const published = entries.filter(e => e.status === 'published')
  const total_views = published.reduce((sum, e) => sum + (e.view_count ?? 0), 0)
  const active_subscribers = confirmedSubs.length
  const published_entries = published.length
  const publish_count_this_month = ws?.publish_count_this_month ?? 0
  const rawQuota = PLAN_LIMITS[(ws?.plan ?? 'free') as Plan].publishes_per_month
  const publish_quota = rawQuota === Infinity ? -1 : rawQuota

  // 6-month subscriber growth (group confirmed_at by month)
  const buckets = last6MonthBuckets()
  const growthMap = new Map(buckets.map(b => [b, 0]))
  for (const row of confirmedSubs) {
    if (row.confirmed_at) {
      const key = format(new Date(row.confirmed_at), 'MMM yyyy')
      if (growthMap.has(key)) growthMap.set(key, (growthMap.get(key) ?? 0) + 1)
    }
  }
  const subscriber_growth = buckets.map(month => ({
    month,
    new_subscribers: growthMap.get(month) ?? 0,
  }))

  // 6-month publishing cadence (group published_at by month)
  const cadenceMap = new Map(buckets.map(b => [b, 0]))
  for (const e of published) {
    if (e.published_at) {
      const key = format(new Date(e.published_at), 'MMM yyyy')
      if (cadenceMap.has(key)) cadenceMap.set(key, (cadenceMap.get(key) ?? 0) + 1)
    }
  }
  const publishing_cadence = buckets.map(month => ({
    month,
    count: cadenceMap.get(month) ?? 0,
  }))

  // Top 10 published entries by view count
  const top_entries = [...published]
    .sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0))
    .slice(0, 10)
    .map(e => ({
      id: e.id,
      title: e.title ?? '(untitled)',
      published_at: e.published_at!,
      view_count: e.view_count ?? 0,
    }))

  // Email history: resolve entry titles in a single follow-up query
  const entryIds = emailSends.map(s => s.entry_id).filter(Boolean) as string[]
  const entryTitles = new Map<string, string>()
  if (entryIds.length > 0) {
    const { data: titleRows } = await service
      .from('changelog_entries')
      .select('id, title')
      .in('id', entryIds)
    for (const row of titleRows ?? []) entryTitles.set(row.id, row.title ?? '(untitled)')
  }
  const email_history = emailSends.map(s => ({
    sent_at: s.sent_at ?? s.created_at,
    recipient_count: s.recipient_count ?? 0,
    status: s.status,
    entry_title: s.entry_id
      ? (entryTitles.get(s.entry_id) ?? '(deleted entry)')
      : '(deleted entry)',
  }))

  return {
    kpis: {
      total_views,
      active_subscribers,
      published_entries,
      publish_count_this_month,
      publish_quota,
    },
    subscriber_growth,
    publishing_cadence,
    top_entries,
    email_history,
  }
}
