import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { format, subMonths } from 'date-fns'
import { PLAN_LIMITS, type Plan } from '@/lib/plans'

export interface AnalyticsData {
  kpis: {
    // "impressions" not "views" - the public changelog page increments ALL visible
    // entries on every page load, so this counts appearances in page loads, not reads.
    total_impressions: number
    active_subscribers: number
    published_entries: number
    publish_count_this_month: number
    publish_quota: number // -1 = unlimited (Infinity cannot serialize to JSON)
  }
  subscriber_growth: { month: string; new_subscribers: number }[]
  publishing_cadence: { month: string; count: number }[]
  top_entries: { id: string; title: string; published_at: string; impressions: number }[]
  email_history: { sent_at: string; recipient_count: number; status: string; entry_title: string }[]
}

function last6MonthBuckets(): string[] {
  return Array.from({ length: 6 }, (_, i) =>
    format(subMonths(new Date(), 5 - i), 'MMM yyyy')
  )
}

export async function getWorkspaceAnalytics(workspaceId: string): Promise<AnalyticsData> {
  const service = createSupabaseServiceClient()
  const sixMonthsAgo = subMonths(new Date(), 6).toISOString()

  const [
    wsResult,
    // Aggregate query: total impressions + published count in one round-trip.
    // Uses PostgREST aggregate functions (Supabase JS v2 / PostgREST 11+).
    // Returns a single row like { total_impressions: 42, published_entries: 7 }.
    aggResult,
    // Active subscriber count via count-only query (no rows fetched).
    subCountResult,
    // Only confirmed subscribers from the last 6 months for the growth chart.
    subGrowthResult,
    // Published entries from the last 6 months for the cadence chart.
    cadenceResult,
    // Top 10 entries by impressions, fetched directly with ORDER + LIMIT.
    topEntriesResult,
    // Last 10 email sends, ordered by sent_at with nulls last.
    emailResult,
  ] = await Promise.all([
    service
      .from('workspaces')
      .select('plan, publish_count_this_month')
      .eq('id', workspaceId)
      .single(),
    service
      .from('changelog_entries')
      .select('total_impressions:view_count.sum(), published_entries:id.count()')
      .eq('workspace_id', workspaceId)
      .eq('status', 'published'),
    service
      .from('subscribers')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('confirmed', true)
      .is('unsubscribed_at', null),
    service
      .from('subscribers')
      .select('confirmed_at')
      .eq('workspace_id', workspaceId)
      .eq('confirmed', true)
      .is('unsubscribed_at', null)
      .gte('confirmed_at', sixMonthsAgo),
    service
      .from('changelog_entries')
      .select('published_at')
      .eq('workspace_id', workspaceId)
      .eq('status', 'published')
      .gte('published_at', sixMonthsAgo),
    service
      .from('changelog_entries')
      .select('id, title, published_at, view_count')
      .eq('workspace_id', workspaceId)
      .eq('status', 'published')
      .order('view_count', { ascending: false })
      .limit(10),
    service
      .from('email_sends')
      .select('sent_at, recipient_count, status, entry_id, created_at')
      .eq('workspace_id', workspaceId)
      .order('sent_at', { ascending: false, nullsFirst: false })
      .limit(10),
  ])

  const ws = wsResult.data

  // Aggregate row — PostgREST returns an array even for aggregate-only queries
  const agg = (aggResult.data?.[0] ?? {}) as {
    total_impressions: number | null
    published_entries: number | null
  }
  const total_impressions = Number(agg.total_impressions ?? 0)
  const published_entries = Number(agg.published_entries ?? 0)

  const active_subscribers = subCountResult.count ?? 0
  const publish_count_this_month = ws?.publish_count_this_month ?? 0
  const rawQuota = PLAN_LIMITS[(ws?.plan ?? 'free') as Plan].publishes_per_month
  const publish_quota = rawQuota === Infinity ? -1 : rawQuota

  // 6-month subscriber growth
  const confirmedSubs = subGrowthResult.data ?? []
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

  // 6-month publishing cadence
  const cadenceEntries = cadenceResult.data ?? []
  const cadenceMap = new Map(buckets.map(b => [b, 0]))
  for (const e of cadenceEntries) {
    if (e.published_at) {
      const key = format(new Date(e.published_at), 'MMM yyyy')
      if (cadenceMap.has(key)) cadenceMap.set(key, (cadenceMap.get(key) ?? 0) + 1)
    }
  }
  const publishing_cadence = buckets.map(month => ({
    month,
    count: cadenceMap.get(month) ?? 0,
  }))

  // Top 10 entries (already sorted + limited by DB query)
  const top_entries = (topEntriesResult.data ?? []).map(e => ({
    id: e.id,
    title: e.title ?? '(untitled)',
    published_at: e.published_at!,
    impressions: e.view_count ?? 0,
  }))

  // Email history with entry titles resolved in a single follow-up query
  const emailSends = emailResult.data ?? []
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
      total_impressions,
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
