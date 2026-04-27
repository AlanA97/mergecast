import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: vi.fn(),
}))

import { GET } from '@/app/api/public/confirm-subscription/route'
import { createSupabaseServiceClient } from '@/lib/supabase/server'

const APP_URL = 'http://localhost:3000'

function makeRequest(token?: string) {
  const url = token
    ? `${APP_URL}/api/public/confirm-subscription?token=${token}`
    : `${APP_URL}/api/public/confirm-subscription`
  return new Request(url)
}

function makeServiceMock(subscriber: { workspaces: { slug: string } } | null) {
  vi.mocked(createSupabaseServiceClient).mockReturnValue({
    from: () => ({
      update: () => ({
        eq: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: subscriber }),
          }),
        }),
      }),
    }),
  } as any)
}

describe('GET /api/public/confirm-subscription', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_APP_URL = APP_URL
  })

  it('redirects to /?error=invalid_token when no token is provided', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(`${APP_URL}/?error=invalid_token`)
  })

  it('redirects to /?error=invalid_token when token is not found', async () => {
    makeServiceMock(null)
    const res = await GET(makeRequest('bad-token'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(`${APP_URL}/?error=invalid_token`)
  })

  it('confirms subscription and redirects to confirm-subscription page', async () => {
    makeServiceMock({ workspaces: { slug: 'acme' } })
    const res = await GET(makeRequest('valid-token'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(`${APP_URL}/confirm-subscription?slug=acme`)
  })
})
