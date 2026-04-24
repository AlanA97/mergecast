import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkPublishQuota } from '@/lib/quota'
import type { Plan } from '@/lib/plans'

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: vi.fn(),
}))

import { createSupabaseServiceClient } from '@/lib/supabase/server'

function makeWorkspace(plan: Plan, count: number, resetAt: Date) {
  return {
    plan,
    publish_count_this_month: count,
    publish_quota_reset_at: resetAt.toISOString(),
  }
}

describe('checkPublishQuota', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('allows publish when free tier has quota remaining', async () => {
    const ws = makeWorkspace('free', 2, new Date(Date.now() + 86400000))
    const result = await checkPublishQuota(ws as any)
    expect(result.allowed).toBe(true)
  })

  it('blocks publish when free tier quota exhausted', async () => {
    const ws = makeWorkspace('free', 3, new Date(Date.now() + 86400000))
    const result = await checkPublishQuota(ws as any)
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('QUOTA_EXCEEDED')
  })

  it('allows publish on paid tier regardless of count', async () => {
    const ws = makeWorkspace('starter', 9999, new Date(Date.now() + 86400000))
    const result = await checkPublishQuota(ws as any)
    expect(result.allowed).toBe(true)
  })

  it('resets count and allows publish when quota_reset_at is in the past', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    ;(createSupabaseServiceClient as any).mockReturnValue({
      from: () => ({ update: mockUpdate }),
    })
    const ws = makeWorkspace('free', 3, new Date(Date.now() - 1000))
    const result = await checkPublishQuota(ws as any, 'ws-id-123')
    expect(result.allowed).toBe(true)
    expect(mockUpdate).toHaveBeenCalled()
  })
})
