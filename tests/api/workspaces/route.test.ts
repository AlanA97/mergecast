import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST, GET } from '@/app/api/workspaces/route'

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}))

import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'

const MOCK_USER = { id: 'user-123', email: 'test@example.com' }
const MOCK_WORKSPACE = { id: 'ws-1', name: 'Test', slug: 'test', plan: 'free' }

function makePostRequest(body: object) {
  return new Request('http://localhost/api/workspaces', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

// Mocks the service client for the slug-uniqueness check + RPC
function makeServiceMock({
  slugTaken = false,
  rpcResult = { data: MOCK_WORKSPACE, error: null },
}: { slugTaken?: boolean; rpcResult?: object } = {}) {
  return vi.mocked(createSupabaseServiceClient).mockReturnValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({ data: slugTaken ? { id: 'existing' } : null }),
        }),
      }),
    }),
    rpc: vi.fn().mockResolvedValue(rpcResult),
  } as any)
}

describe('POST /api/workspaces', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null }, error: new Error('no user') }) },
    } as any)
    const res = await POST(makePostRequest({ name: 'Test', slug: 'test' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid slug (uppercase / spaces)', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: MOCK_USER }, error: null }) },
    } as any)
    makeServiceMock()
    const res = await POST(makePostRequest({ name: 'Test', slug: 'INVALID SLUG!' }))
    expect(res.status).toBe(400)
  })

  it('returns 409 when slug is already taken', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: MOCK_USER }, error: null }) },
    } as any)
    makeServiceMock({ slugTaken: true })
    const res = await POST(makePostRequest({ name: 'Test', slug: 'test' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('SLUG_TAKEN')
  })

  it('calls create_workspace_with_defaults RPC with correct params and returns 201', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: MOCK_USER }, error: null }) },
    } as any)
    const rpcSpy = vi.fn().mockResolvedValue({ data: MOCK_WORKSPACE, error: null })
    vi.mocked(createSupabaseServiceClient).mockReturnValue({
      from: () => ({
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null }) }) }),
      }),
      rpc: rpcSpy,
    } as any)

    const res = await POST(makePostRequest({ name: 'Test Workspace', slug: 'test-ws' }))
    expect(res.status).toBe(201)
    expect((await res.json()).workspace.id).toBe('ws-1')
    expect(rpcSpy).toHaveBeenCalledWith('create_workspace_with_defaults', {
      p_name: 'Test Workspace',
      p_slug: 'test-ws',
      p_user_id: MOCK_USER.id,
    })
  })

  it('returns 500 when RPC fails', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: MOCK_USER }, error: null }) },
    } as any)
    makeServiceMock({ rpcResult: { data: null, error: { message: 'DB error' } } })
    const res = await POST(makePostRequest({ name: 'Test', slug: 'test' }))
    expect(res.status).toBe(500)
  })
})

describe('GET /api/workspaces', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null }, error: new Error('no user') }) },
    } as any)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns workspace list with role for authenticated user', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: MOCK_USER }, error: null }) },
      from: () => ({
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: [
                { workspace_id: 'ws-1', role: 'owner', workspaces: { id: 'ws-1', name: 'Test', slug: 'test' } },
              ],
            }),
        }),
      }),
    } as any)
    const res = await GET()
    expect(res.status).toBe(200)
    const { workspaces } = await res.json()
    expect(workspaces).toHaveLength(1)
    expect(workspaces[0].id).toBe('ws-1')
    expect(workspaces[0].role).toBe('owner')
  })

  it('returns empty array when user has no workspaces', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: MOCK_USER }, error: null }) },
      from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: null }) }) }),
    } as any)
    const res = await GET()
    expect(res.status).toBe(200)
    expect((await res.json()).workspaces).toHaveLength(0)
  })
})
