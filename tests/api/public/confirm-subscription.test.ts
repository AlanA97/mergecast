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

interface PendingSubscriber {
  id: string
  confirmation_token_expires_at: string | null
  workspaces: { slug: string }
}

interface ConfirmedSubscriber {
  workspaces: { slug: string }
}

function makeServiceMock(
  pending: PendingSubscriber | null,
  confirmed: ConfirmedSubscriber | null = pending
    ? { workspaces: pending.workspaces }
    : null
) {
  vi.mocked(createSupabaseServiceClient).mockReturnValue({
    from: () => ({
      // Used by the first query: select by token
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: pending }),
          }),
        }),
      }),
      // Used by the second query: update then select
      update: () => ({
        eq: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: confirmed }),
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

  it('redirects to /?error=expired_token when token has expired', async () => {
    makeServiceMock({
      id: 'sub-1',
      confirmation_token_expires_at: new Date(Date.now() - 1000).toISOString(),
      workspaces: { slug: 'acme' },
    })
    const res = await GET(makeRequest('expired-token'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(`${APP_URL}/?error=expired_token`)
  })

  it('confirms subscription and redirects to confirm-subscription page', async () => {
    makeServiceMock({
      id: 'sub-1',
      confirmation_token_expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      workspaces: { slug: 'acme' },
    })
    const res = await GET(makeRequest('valid-token'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(`${APP_URL}/confirm-subscription?slug=acme`)
  })
})
