import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/auth/callback/route'

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}))

import { createSupabaseServerClient } from '@/lib/supabase/server'

function makeRequest(url: string) {
  return new Request(url)
}

describe('GET /api/auth/callback', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('exchanges code and redirects to /dashboard by default', async () => {
    ;(createSupabaseServerClient as any).mockResolvedValue({
      auth: { exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }) },
    })

    const req = makeRequest('http://localhost:3000/api/auth/callback?code=abc123')
    const res = await GET(req)

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost:3000/dashboard')
  })

  it('respects the next param on success', async () => {
    ;(createSupabaseServerClient as any).mockResolvedValue({
      auth: { exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }) },
    })

    const req = makeRequest('http://localhost:3000/api/auth/callback?code=abc123&next=/onboarding')
    const res = await GET(req)

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost:3000/onboarding')
  })

  it('redirects to /login?error=auth_failed when exchange fails', async () => {
    ;(createSupabaseServerClient as any).mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({ error: new Error('bad token') }),
      },
    })

    const req = makeRequest('http://localhost:3000/api/auth/callback?code=bad')
    const res = await GET(req)

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost:3000/login?error=auth_failed')
  })

  it('redirects to /login?error=auth_failed when no code is present', async () => {
    const req = makeRequest('http://localhost:3000/api/auth/callback')
    const res = await GET(req)

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost:3000/login?error=auth_failed')
  })
})
