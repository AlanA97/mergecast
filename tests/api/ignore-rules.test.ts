import { describe, it, expect, vi } from 'vitest'

const mockUser = { id: 'user-1' }
const mockRules = [
  { id: 'rule-1', workspace_id: 'ws-1', rule_type: 'title_prefix', pattern: 'chore:', created_at: '2026-01-01' },
]

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}))

import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { GET, POST } from '@/app/api/workspaces/[id]/ignore-rules/route'
import { DELETE } from '@/app/api/workspaces/[id]/ignore-rules/[ruleId]/route'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}
function makeRuleParams(id: string, ruleId: string) {
  return { params: Promise.resolve({ id, ruleId }) }
}

describe('GET /api/workspaces/[id]/ignore-rules', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as any)
    const res = await GET(new Request('http://localhost'), makeParams('ws-1'))
    expect(res.status).toBe(401)
  })

  it('returns rules for the workspace', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    } as any)
    vi.mocked(createSupabaseServiceClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'workspace_members') {
          return {
            select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { role: 'owner' } }) }) }) }),
          }
        }
        // pr_ignore_rules
        return {
          select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: mockRules }) }) }),
        }
      },
    } as any)
    const res = await GET(new Request('http://localhost'), makeParams('ws-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rules).toHaveLength(1)
  })
})

describe('POST /api/workspaces/[id]/ignore-rules', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as any)
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule_type: 'title_prefix', pattern: 'chore:' }),
    })
    const res = await POST(req, makeParams('ws-1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid rule_type', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    } as any)
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule_type: 'invalid', pattern: 'chore:' }),
    })
    const res = await POST(req, makeParams('ws-1'))
    expect(res.status).toBe(400)
  })

  it('creates a rule and returns 201', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    } as any)
    const newRule = { id: 'rule-new', workspace_id: 'ws-1', rule_type: 'title_prefix', pattern: 'fix:', created_at: '2026-01-01' }
    vi.mocked(createSupabaseServiceClient).mockReturnValue({
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { role: 'owner' } }) }) }) }),
        insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: newRule, error: null }) }) }),
      }),
    } as any)
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule_type: 'title_prefix', pattern: 'fix:' }),
    })
    const res = await POST(req, makeParams('ws-1'))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.rule.pattern).toBe('fix:')
  })

  it('returns 409 for duplicate rule', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    } as any)
    vi.mocked(createSupabaseServiceClient).mockReturnValue({
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { role: 'owner' } }) }) }) }),
        insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { code: '23505' } }) }) }),
      }),
    } as any)
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule_type: 'title_prefix', pattern: 'chore:' }),
    })
    const res = await POST(req, makeParams('ws-1'))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('RULE_ALREADY_EXISTS')
  })
})

describe('DELETE /api/workspaces/[id]/ignore-rules/[ruleId]', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as any)
    const res = await DELETE(new Request('http://localhost'), makeRuleParams('ws-1', 'rule-1'))
    expect(res.status).toBe(401)
  })

  it('returns 204 on success', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    } as any)
    vi.mocked(createSupabaseServiceClient).mockReturnValue({
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { role: 'owner' } }) }) }) }),
        delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
      }),
    } as any)
    const res = await DELETE(new Request('http://localhost'), makeRuleParams('ws-1', 'rule-1'))
    expect(res.status).toBe(204)
  })
})
