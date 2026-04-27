import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST, GET } from '@/app/api/workspaces/route'

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}))

import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'

const MOCK_USER = { id: 'user-123', email: 'test@example.com' }

function makeServiceMock(overrides: Record<string, any> = {}) {
  const selectChain = {
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides.select,
  }
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'ws-1', name: 'Test', slug: 'test' },
            error: null,
          }),
        }),
        ...overrides.insert,
      }),
    }),
    ...overrides,
  }
}

describe('POST /api/workspaces', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 when not authenticated', async () => {
    ;(createSupabaseServerClient as any).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('no user') }) },
    })

    const req = new Request('http://localhost/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', slug: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid slug', async () => {
    ;(createSupabaseServerClient as any).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: MOCK_USER }, error: null }) },
    })
    ;(createSupabaseServiceClient as any).mockReturnValue(makeServiceMock())

    const req = new Request('http://localhost/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', slug: 'INVALID SLUG!' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 409 when slug is taken', async () => {
    ;(createSupabaseServerClient as any).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: MOCK_USER }, error: null }) },
    })

    const serviceMock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'existing-ws' }, error: null }),
        }),
        insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn() }) }),
      }),
    }
    ;(createSupabaseServiceClient as any).mockReturnValue(serviceMock)

    const req = new Request('http://localhost/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', slug: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('SLUG_TAKEN')
  })
})

describe('GET /api/workspaces', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 when not authenticated', async () => {
    ;(createSupabaseServerClient as any).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('no user') }) },
    })

    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns workspaces for authenticated user', async () => {
    ;(createSupabaseServerClient as any).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: MOCK_USER }, error: null }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ workspace_id: 'ws-1', role: 'owner', workspaces: { id: 'ws-1', name: 'Test', slug: 'test' } }],
          }),
        }),
      }),
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.workspaces).toHaveLength(1)
  })
})
