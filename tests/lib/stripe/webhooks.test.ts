import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleSubscriptionUpserted, handleSubscriptionDeleted } from '@/lib/stripe/webhooks'

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: vi.fn(),
}))
vi.mock('@/lib/plans', () => ({
  getPlanFromPriceId: vi.fn((id: string) => {
    if (id === 'price_starter') return 'starter'
    if (id === 'price_growth') return 'growth'
    return 'free'
  }),
}))

import { createSupabaseServiceClient } from '@/lib/supabase/server'

function makeMockSupabase(updateResult = { error: null }) {
  const mockEq = vi.fn().mockResolvedValue(updateResult)
  const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
  return {
    from: vi.fn().mockReturnValue({ update: mockUpdate }),
    _mockUpdate: mockUpdate,
    _mockEq: mockEq,
  }
}

describe('handleSubscriptionUpserted', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates workspace plan to starter', async () => {
    const mockSb = makeMockSupabase()
    ;(createSupabaseServiceClient as any).mockReturnValue(mockSb)

    await handleSubscriptionUpserted({
      id: 'sub_123',
      customer: 'cus_abc',
      items: { data: [{ price: { id: 'price_starter' } }] },
    } as any)

    expect(mockSb._mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'starter', stripe_subscription_id: 'sub_123' })
    )
  })

  it('updates workspace plan to growth', async () => {
    const mockSb = makeMockSupabase()
    ;(createSupabaseServiceClient as any).mockReturnValue(mockSb)

    await handleSubscriptionUpserted({
      id: 'sub_456',
      customer: 'cus_abc',
      items: { data: [{ price: { id: 'price_growth' } }] },
    } as any)

    expect(mockSb._mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'growth' })
    )
  })
})

describe('handleSubscriptionDeleted', () => {
  it('downgrades workspace to free', async () => {
    const mockSb = makeMockSupabase()
    ;(createSupabaseServiceClient as any).mockReturnValue(mockSb)

    await handleSubscriptionDeleted({ id: 'sub_123', customer: 'cus_abc' } as any)

    expect(mockSb._mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: 'free',
        stripe_subscription_id: null,
        stripe_price_id: null,
      })
    )
  })
})
