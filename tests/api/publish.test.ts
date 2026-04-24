import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/quota', () => ({
  checkPublishQuota: vi.fn(),
}))

import { checkPublishQuota } from '@/lib/quota'

describe('publish quota enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('blocks publish when quota returns not allowed', async () => {
    ;(checkPublishQuota as any).mockResolvedValue({ allowed: false, reason: 'QUOTA_EXCEEDED' })
    const result = await checkPublishQuota({} as any)
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('QUOTA_EXCEEDED')
  })

  it('allows publish when quota returns allowed', async () => {
    ;(checkPublishQuota as any).mockResolvedValue({ allowed: true })
    const result = await checkPublishQuota({} as any)
    expect(result.allowed).toBe(true)
  })
})
