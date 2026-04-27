import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[reset-quotas] CRON_SECRET env var is not set')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const authHeader = request.headers.get('authorization') ?? ''
  if (!safeCompare(authHeader, `Bearer ${cronSecret}`)) {
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
