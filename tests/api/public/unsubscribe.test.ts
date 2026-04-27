import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: vi.fn(),
}))

import { GET } from '@/app/api/public/unsubscribe/route'
import { createSupabaseServiceClient } from '@/lib/supabase/server'

const APP_URL = 'http://localhost:3000'

function makeRequest(token?: string) {
  const url = token
    ? `${APP_URL}/api/public/unsubscribe?token=${token}`
    : `${APP_URL}/api/public/unsubscribe`
  return new Request(url)
}

function makeServiceMock() {
  const isMock = vi.fn().mockResolvedValue({ error: null })
  const eqMock = vi.fn().mockReturnValue({ is: isMock })
  const updateMock = vi.fn().mockReturnValue({ eq: eqMock })
  const mock = {
    from: vi.fn().mockReturnValue({ update: updateMock }),
    _update: updateMock,
    _eq: eqMock,
  }
  vi.mocked(createSupabaseServiceClient).mockReturnValue(mock as any)
  return mock
}

describe('GET /api/public/unsubscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_APP_URL = APP_URL
  })

  it('redirects to home when no token is provided', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(`${APP_URL}/`)
  })

  it('marks subscriber as unsubscribed and redirects to success page', async () => {
    const { _update, _eq } = makeServiceMock()
    const res = await GET(makeRequest('unsubscribe-token-abc'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(`${APP_URL}/unsubscribe?success=true`)
    expect(_update).toHaveBeenCalledWith(
      expect.objectContaining({ unsubscribed_at: expect.any(String) })
    )
    expect(_eq).toHaveBeenCalledWith('unsubscribe_token', 'unsubscribe-token-abc')
  })
})
