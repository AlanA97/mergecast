import { createSupabaseServerClient } from '@/lib/supabase/server'
import { PLAN_LIMITS } from '@/lib/plans'
import { NextResponse } from 'next/server'

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 19,
    priceId: process.env.STRIPE_PRICE_STARTER_MONTHLY,
    limits: PLAN_LIMITS.starter,
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 49,
    priceId: process.env.STRIPE_PRICE_GROWTH_MONTHLY,
    limits: PLAN_LIMITS.growth,
  },
  {
    id: 'scale',
    name: 'Scale',
    price: 79,
    priceId: process.env.STRIPE_PRICE_SCALE_MONTHLY,
    limits: PLAN_LIMITS.scale,
  },
]

export async function GET() {
  // Auth required — price IDs are internal config, not meant to be public
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json({ plans: PLANS })
}
