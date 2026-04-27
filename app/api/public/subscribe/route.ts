import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { sendConfirmationEmail } from '@/lib/resend/email'
import { PLAN_LIMITS } from '@/lib/plans'
import { createRateLimiter } from '@/lib/rate-limit'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const SubscribeSchema = z.object({
  workspace_id: z.uuid(),
  email: z.email(),
})

// 5 subscription attempts per IP per minute
const limiter = createRateLimiter({ windowMs: 60_000, max: 5 })

export async function POST(request: Request) {
  const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
  if (!limiter.check(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const body = await request.json()
  const parsed = SubscribeSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { workspace_id, email } = parsed.data
  const service = createSupabaseServiceClient()

  const { data: workspace } = await service
    .from('workspaces')
    .select('plan, name, slug')
    .eq('id', workspace_id)
    .single() as { data: { plan: string; name: string; slug: string } | null }
  if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { count } = await service
    .from('subscribers')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspace_id)
    .eq('confirmed', true)
    .is('unsubscribed_at', null)

  const limit = PLAN_LIMITS[workspace.plan as keyof typeof PLAN_LIMITS].subscribers
  if ((count ?? 0) >= limit) {
    return NextResponse.json({ error: 'SUBSCRIBER_LIMIT_REACHED' }, { status: 403 })
  }

  const { data: existing } = await service
    .from('subscribers')
    .select('id, confirmed, confirmation_token')
    .eq('workspace_id', workspace_id)
    .eq('email', email)
    .single()

  if (existing) {
    if (!existing.confirmed) {
      await sendConfirmationEmail({
        email,
        workspaceName: workspace.name,
        workspaceSlug: workspace.slug,
        token: existing.confirmation_token!,
      })
    }
    return NextResponse.json({ ok: true })
  }

  const { data: subscriber } = await service
    .from('subscribers')
    .insert({ workspace_id, email })
    .select()
    .single()

  if (subscriber) {
    await sendConfirmationEmail({
      email,
      workspaceName: workspace.name,
      workspaceSlug: workspace.slug,
      token: subscriber.confirmation_token!,
    })
  }

  return NextResponse.json({ ok: true })
}
