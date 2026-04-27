import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: vi.fn(),
}))

import { GET } from '@/app/api/cron/reset-quotas/route'
import { createSupabaseServiceClient } from '@/lib/supabase/server'

const CRON_SECRET = 'super-secret-token'

function makeRequest(authorization?: string) {
  return new Request('http://localhost/api/cron/reset-quotas', {
    headers: authorization ? { authorization } : {},
  })
}

function makeServiceMock({ error = null, count = 3 }: { error?: { message: string } | null; count?: number } = {}) {
  const ltMock = vi.fn().mockResolvedValue({ error, count })
  const updateMock = vi.fn().mockReturnValue({ lt: ltMock })
  vi.mocked(createSupabaseServiceClient).mockReturnValue({
    from: vi.fn().mockReturnValue({ update: updateMock }),
  } as any)
  return { updateMock, ltMock }
}

describe('GET /api/cron/reset-quotas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = CRON_SECRET
  })

  afterEach(() => {
    delete process.env.CRON_SECRET
  })

  // ── Auth ───────────────────────────────────────────────────────────────────

  it('returns 401 when CRON_SECRET env var is not set', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`))
    expect(res.status).toBe(401)
  })

  it('returns 401 when Authorization header is missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 401 when bearer token does not match', async () => {
    const res = await GET(makeRequest('Bearer wrong-token'))
    expect(res.status).toBe(401)
  })

  it('returns 401 for "Bearer undefined" (missing env would previously pass)', async () => {
    // Regression: before the env guard, a missing CRON_SECRET made the check
    // compare against "Bearer undefined", so this header would have passed.
    const res = await GET(makeRequest('Bearer undefined'))
    // CRON_SECRET is set to a real value, so this should still be 401
    expect(res.status).toBe(401)
  })

  // ── Success path ───────────────────────────────────────────────────────────

  it('resets overdue workspaces and returns count on success', async () => {
    makeServiceMock({ count: 5 })
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.reset).toBe(5)
    expect(body.next_reset).toBeDefined()
  })

  it('uses .lt() filter to only reset workspaces past their reset date', async () => {
    const { ltMock } = makeServiceMock()
    await GET(makeRequest(`Bearer ${CRON_SECRET}`))
    expect(ltMock).toHaveBeenCalledWith(
      'publish_quota_reset_at',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
    )
  })

  it('returns 0 when no workspaces need resetting', async () => {
    makeServiceMock({ count: 0 })
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`))
    expect(res.status).toBe(200)
    expect((await res.json()).reset).toBe(0)
  })

  // ── Error path ─────────────────────────────────────────────────────────────

  it('returns 500 when DB update fails', async () => {
    makeServiceMock({ error: { message: 'connection timeout' } })
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`))
    expect(res.status).toBe(500)
  })
})
