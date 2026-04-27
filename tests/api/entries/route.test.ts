import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}))

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { GET, PATCH } from '@/app/api/workspaces/[id]/entries/[entryId]/route'

const MOCK_USER = { id: 'user-1' }
const MOCK_ENTRY = {
  id: 'entry-1',
  workspace_id: 'ws-1',
  title: 'Dark mode',
  final_content: 'We added dark mode.',
  status: 'draft',
}

function makeParams(id = 'ws-1', entryId = 'entry-1') {
  return { params: Promise.resolve({ id, entryId }) }
}

function makeSupabase({
  user = MOCK_USER as typeof MOCK_USER | null,
  entry = MOCK_ENTRY as typeof MOCK_ENTRY | null,
  updateEntry = { ...MOCK_ENTRY, title: 'Updated' } as typeof MOCK_ENTRY | null,
  updateError = null as { message: string } | null,
} = {}) {
  return vi.mocked(createSupabaseServerClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: entry }) }) }),
      }),
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: updateEntry, error: updateError }),
            }),
          }),
        }),
      }),
    }),
  } as any)
}

// ─── GET ──────────────────────────────────────────────────────────────────────

describe('GET /api/workspaces/[id]/entries/[entryId]', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 when unauthenticated', async () => {
    makeSupabase({ user: null })
    const res = await GET(new Request('http://localhost'), makeParams())
    expect(res.status).toBe(401)
  })

  it('returns 404 when entry does not exist', async () => {
    makeSupabase({ entry: null })
    const res = await GET(new Request('http://localhost'), makeParams())
    expect(res.status).toBe(404)
  })

  it('returns the entry on success', async () => {
    makeSupabase()
    const res = await GET(new Request('http://localhost'), makeParams())
    expect(res.status).toBe(200)
    const { entry } = await res.json()
    expect(entry.id).toBe('entry-1')
    expect(entry.title).toBe('Dark mode')
  })
})

// ─── PATCH ────────────────────────────────────────────────────────────────────

describe('PATCH /api/workspaces/[id]/entries/[entryId]', () => {
  beforeEach(() => { vi.clearAllMocks() })

  function makePatch(body: object) {
    return new Request('http://localhost', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('returns 401 when unauthenticated', async () => {
    makeSupabase({ user: null })
    const res = await PATCH(makePatch({ title: 'New' }), makeParams())
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid status value', async () => {
    makeSupabase()
    const res = await PATCH(makePatch({ status: 'published' }), makeParams())
    expect(res.status).toBe(400)
  })

  it('returns 404 when entry is not found or update fails', async () => {
    makeSupabase({ updateEntry: null, updateError: { message: 'not found' } })
    const res = await PATCH(makePatch({ title: 'New title' }), makeParams())
    expect(res.status).toBe(404)
  })

  it('updates title and returns 200', async () => {
    makeSupabase({ updateEntry: { ...MOCK_ENTRY, title: 'Updated title' } })
    const res = await PATCH(makePatch({ title: 'Updated title' }), makeParams())
    expect(res.status).toBe(200)
    expect((await res.json()).entry.title).toBe('Updated title')
  })

  it('updates status to archived and returns 200', async () => {
    makeSupabase({ updateEntry: { ...MOCK_ENTRY, status: 'archived' } })
    const res = await PATCH(makePatch({ status: 'archived' }), makeParams())
    expect(res.status).toBe(200)
    expect((await res.json()).entry.status).toBe('archived')
  })
})
