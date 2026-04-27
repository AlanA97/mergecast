import { describe, it, expect } from 'vitest'
import { PLAN_LIMITS, getPlanFromPriceId } from '@/lib/plans'

describe('PLAN_LIMITS', () => {
  it('free tier allows 3 publishes per month', () => {
    expect(PLAN_LIMITS.free.publishes_per_month).toBe(3)
  })

  it('starter tier has unlimited publishes', () => {
    expect(PLAN_LIMITS.starter.publishes_per_month).toBe(Infinity)
  })

  it('free tier caps subscribers at 100', () => {
    expect(PLAN_LIMITS.free.subscribers).toBe(100)
  })

  it('free tier allows 1 repo', () => {
    expect(PLAN_LIMITS.free.repos).toBe(1)
  })

  it('growth tier allows 3 repos', () => {
    expect(PLAN_LIMITS.growth.repos).toBe(3)
  })

  it('scale tier allows unlimited repos', () => {
    expect(PLAN_LIMITS.scale.repos).toBe(Infinity)
  })
})

describe('getPlanFromPriceId', () => {
  it('returns starter for starter price id', () => {
    process.env.STRIPE_PRICE_STARTER_MONTHLY = 'price_starter'
    expect(getPlanFromPriceId('price_starter')).toBe('starter')
  })

  it('returns growth for growth price id', () => {
    process.env.STRIPE_PRICE_GROWTH_MONTHLY = 'price_growth'
    expect(getPlanFromPriceId('price_growth')).toBe('growth')
  })

  it('returns scale for scale price id', () => {
    process.env.STRIPE_PRICE_SCALE_MONTHLY = 'price_scale'
    expect(getPlanFromPriceId('price_scale')).toBe('scale')
  })

  it('throws for unknown price id', () => {
    expect(() => getPlanFromPriceId('price_unknown')).toThrow('Unknown Stripe price ID: price_unknown')
  })
})
