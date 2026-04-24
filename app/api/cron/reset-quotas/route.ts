import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createSupabaseServiceClient()
  const now = new Date()
  const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const { error, count } = await service
    .from('workspaces')
    .update({
      publish_count_this_month: 0,
      publish_quota_reset_at: nextReset.toISOString(),
    })
    .lt('publish_quota_reset_at', now.toISOString())

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ reset: count ?? 0, next_reset: nextReset.toISOString() })
}
