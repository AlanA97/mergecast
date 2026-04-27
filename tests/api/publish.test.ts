import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
const mockWorkspace = {
  id: 'ws-1',
  plan: 'starter',
  publish_count_this_month: 2,
  publish_quota_reset_at: '2026-05-01T00:00:00Z',
  slug: 'acme',
  name: 'Acme Corp',
}
const mockEntry = {
  id: 'entry-1',
  workspace_id: 'ws-1',
  status: 'draft',
  title: 'Dark mode',
  final_content: 'We shipped dark mode.',
  published_at: null,
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}))

vi.mock('@/lib/quota', () => ({
  checkPublishQuota: vi.fn(),
}))

vi.mock('@/lib/resend/email', () => ({
  sendPublishEmail: vi.fn().mockResolvedValue(undefined),
}))

import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { checkPublishQuota } from '@/lib/quota'
import { POST } from '@/app/api/workspaces/[id]/entries/[entryId]/publish/route'

function makeParams(id: string, entryId: string) {
  return { params: Promise.resolve({ id, entryId }) }
}

function makeServiceMock({
  workspace = mockWorkspace,
  membership = { role: 'owner' },
  entry = mockEntry,
  updateError = null as null | { message: string },
}: {
  workspace?: typeof mockWorkspace | null
  membership?: { role: string } | null
  entry?: typeof mockEntry | null
  updateError?: { message: string } | null
} = {}) {
  const publishedEntry = { ...mockEntry, status: 'published', published_at: new Date().toISOString() }
  const fromWorkspaces = {
    select: () => ({
      eq: () => ({ single: () => Promise.resolve({ data: workspace }) }),
    }),
    update: () => ({ eq: () => Promise.resolve({ error: null }) }),
  }
  const fromMembers = {
    select: () => ({
      eq: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: membership }) }),
      }),
    }),
  }
  // changelog_entries needs select (for fetching) and update (for publishing)
  const fromEntries = {
    select: () => ({
      eq: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: entry }) }),
      }),
    }),
    update: () => ({
      eq: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: publishedEntry, error: updateError }),
        }),
      }),
    }),
  }
  return vi.mocked(createSupabaseServiceClient).mockReturnValue({
    from: (table: string) => {
      if (table === 'workspaces') return fromWorkspaces as any
      if (table === 'workspace_members') return fromMembers as any
      if (table === 'changelog_entries') return fromEntries as any
      return {} as any
    },
  } as any)
}

describe('POST /api/workspaces/[id]/entries/[entryId]/publish', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as any)
    const res = await POST(new Request('http://localhost'), makeParams('ws-1', 'entry-1'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when workspace does not exist', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    } as any)
    makeServiceMock({ workspace: null })
    vi.mocked(checkPublishQuota).mockResolvedValue({ allowed: true })
    const res = await POST(new Request('http://localhost'), makeParams('ws-1', 'entry-1'))
    expect(res.status).toBe(404)
  })

  it('returns 403 when user is not a workspace member', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    } as any)
    makeServiceMock({ membership: null })
    vi.mocked(checkPublishQuota).mockResolvedValue({ allowed: true })
    const res = await POST(new Request('http://localhost'), makeParams('ws-1', 'entry-1'))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Forbidden')
  })

  it('returns 403 when publish quota is exceeded', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    } as any)
    makeServiceMock()
    vi.mocked(checkPublishQuota).mockResolvedValue({ allowed: false, reason: 'QUOTA_EXCEEDED' })
    const res = await POST(new Request('http://localhost'), makeParams('ws-1', 'entry-1'))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('QUOTA_EXCEEDED')
  })

  it('returns 404 when entry does not exist', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    } as any)
    makeServiceMock({ entry: null })
    vi.mocked(checkPublishQuota).mockResolvedValue({ allowed: true })
    const res = await POST(new Request('http://localhost'), makeParams('ws-1', 'entry-1'))
    expect(res.status).toBe(404)
  })

  it('returns 409 when entry is already published', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    } as any)
    makeServiceMock({ entry: { ...mockEntry, status: 'published' } })
    vi.mocked(checkPublishQuota).mockResolvedValue({ allowed: true })
    const res = await POST(new Request('http://localhost'), makeParams('ws-1', 'entry-1'))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('Already published')
  })

  it('returns 200 with published entry on success', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    } as any)
    makeServiceMock()
    vi.mocked(checkPublishQuota).mockResolvedValue({ allowed: true })
    const res = await POST(new Request('http://localhost'), makeParams('ws-1', 'entry-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.entry.status).toBe('published')
  })
})
