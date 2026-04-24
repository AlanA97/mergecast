export type Plan = 'free' | 'starter' | 'growth' | 'scale'

export const PLAN_LIMITS: Record<Plan, { publishes_per_month: number; subscribers: number; repos: number }> = {
  free:    { publishes_per_month: 3,        subscribers: 100,   repos: 1        },
  starter: { publishes_per_month: Infinity, subscribers: 1000,  repos: 1        },
  growth:  { publishes_per_month: Infinity, subscribers: 10000, repos: 3        },
  scale:   { publishes_per_month: Infinity, subscribers: 50000, repos: Infinity },
}

export function getPlanFromPriceId(priceId: string): Plan {
  if (priceId === process.env.STRIPE_PRICE_STARTER_MONTHLY) return 'starter'
  if (priceId === process.env.STRIPE_PRICE_GROWTH_MONTHLY)  return 'growth'
  if (priceId === process.env.STRIPE_PRICE_SCALE_MONTHLY)   return 'scale'
  return 'free'
}
