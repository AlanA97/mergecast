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
    price: 39,
    priceId: process.env.STRIPE_PRICE_GROWTH_MONTHLY,
    limits: PLAN_LIMITS.growth,
  },
  {
    id: 'scale',
    name: 'Scale',
    price: 69,
    priceId: process.env.STRIPE_PRICE_SCALE_MONTHLY,
    limits: PLAN_LIMITS.scale,
  },
]

export async function GET() {
  return NextResponse.json({ plans: PLANS })
}
