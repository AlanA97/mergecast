import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  handleCheckoutCompleted,
  handleSubscriptionUpserted,
  handleSubscriptionDeleted,
} from '@/lib/stripe/webhooks'

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: vi.fn(),
}))
vi.mock('@/lib/plans', () => ({
  getPlanFromPriceId: vi.fn((id: string) => {
    if (id === 'price_starter') return 'starter'
    if (id === 'price_growth') return 'growth'
    throw new Error(`Unknown Stripe price ID: ${id}`)
  }),
}))
vi.mock('@/lib/stripe/client', () => ({
  getStripeClient: vi.fn(),
}))

import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { getStripeClient } from '@/lib/stripe/client'

function makeSupabaseMock(updateError: { message: string } | null = null) {
  const eqMock = vi.fn().mockResolvedValue({ error: updateError })
  const updateMock = vi.fn().mockReturnValue({ eq: eqMock })
  const mock = {
    from: vi.fn().mockReturnValue({ update: updateMock }),
    _update: updateMock,
    _eq: eqMock,
  }
  vi.mocked(createSupabaseServiceClient).mockReturnValue(mock as any)
  return mock
}

// ─── handleSubscriptionUpserted ───────────────────────────────────────────────

describe('handleSubscriptionUpserted', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('updates workspace plan to starter', async () => {
    const { _update } = makeSupabaseMock()
    await handleSubscriptionUpserted({
      id: 'sub_123',
      customer: 'cus_abc',
      items: { data: [{ price: { id: 'price_starter' } }] },
    } as any)
    expect(_update).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'starter', stripe_subscription_id: 'sub_123' })
    )
  })

  it('updates workspace plan to growth', async () => {
    const { _update } = makeSupabaseMock()
    await handleSubscriptionUpserted({
      id: 'sub_456',
      customer: 'cus_abc',
      items: { data: [{ price: { id: 'price_growth' } }] },
    } as any)
    expect(_update).toHaveBeenCalledWith(expect.objectContaining({ plan: 'growth' }))
  })

  it('throws when DB update fails', async () => {
    makeSupabaseMock({ message: 'connection error' })
    await expect(
      handleSubscriptionUpserted({
        id: 'sub_123',
        customer: 'cus_abc',
        items: { data: [{ price: { id: 'price_starter' } }] },
      } as any)
    ).rejects.toThrow('handleSubscriptionUpserted DB update failed: connection error')
  })
})

// ─── handleSubscriptionDeleted ────────────────────────────────────────────────

describe('handleSubscriptionDeleted', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('downgrades workspace to free', async () => {
    const { _update } = makeSupabaseMock()
    await handleSubscriptionDeleted({ id: 'sub_123', customer: 'cus_abc' } as any)
    expect(_update).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'free', stripe_subscription_id: null, stripe_price_id: null })
    )
  })

  it('throws when DB update fails', async () => {
    makeSupabaseMock({ message: 'timeout' })
    await expect(
      handleSubscriptionDeleted({ id: 'sub_123', customer: 'cus_abc' } as any)
    ).rejects.toThrow('handleSubscriptionDeleted DB update failed: timeout')
  })
})

// ─── handleCheckoutCompleted ──────────────────────────────────────────────────

describe('handleCheckoutCompleted', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('no-ops when required fields are missing', async () => {
    // Supabase should never be called when session is incomplete
    makeSupabaseMock()
    await handleCheckoutCompleted({ subscription: null, customer: 'cus_1', metadata: {} } as any)
    expect(createSupabaseServiceClient).not.toHaveBeenCalled()
  })

  it('updates workspace with plan and Stripe IDs on success', async () => {
    const { _update } = makeSupabaseMock()
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({
          items: { data: [{ price: { id: 'price_starter' } }] },
        }),
      },
    } as any)

    await handleCheckoutCompleted({
      subscription: 'sub_abc',
      customer: 'cus_xyz',
      metadata: { workspace_id: 'ws-1' },
    } as any)

    expect(_update).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: 'starter',
        stripe_customer_id: 'cus_xyz',
        stripe_subscription_id: 'sub_abc',
        stripe_price_id: 'price_starter',
      })
    )
  })

  it('throws when DB update fails', async () => {
    makeSupabaseMock({ message: 'write failed' })
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({
          items: { data: [{ price: { id: 'price_starter' } }] },
        }),
      },
    } as any)

    await expect(
      handleCheckoutCompleted({
        subscription: 'sub_abc',
        customer: 'cus_xyz',
        metadata: { workspace_id: 'ws-1' },
      } as any)
    ).rejects.toThrow('handleCheckoutCompleted DB update failed: write failed')
  })
})
