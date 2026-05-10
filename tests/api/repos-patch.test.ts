import {beforeEach, describe, expect, it, vi} from 'vitest'
import {PATCH} from '@/app/api/workspaces/[id]/repos/[repoId]/route'
import {updateWebhookEventsForRepo} from '@/lib/github/app'
import {createSupabaseServerClient, createSupabaseServiceClient} from '@/lib/supabase/server'

vi.mock('@/lib/github/app', () => ({
  deleteWebhookForRepo: vi.fn(),
  updateWebhookEventsForRepo: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_REPO = {
  id: 'repo-1',
  full_name: 'org/repo',
  github_installation_id: 123,
  webhook_id: 456,
  tag_based_mode: false,
}

function makeParams(repoId = 'repo-1') {
  return { params: Promise.resolve({ id: 'ws-1', repoId }) }
}

function makeRequest(body: object) {
  return new Request('http://localhost/api/workspaces/ws-1/repos/repo-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function setupMocks({
  user = { id: 'user-1' } as { id: string } | null,
  membership = { role: 'owner' } as { role: string } | null,
  repo = BASE_REPO as typeof BASE_REPO | null,
  updateResult = { data: { ...BASE_REPO, tag_based_mode: true }, error: null },
} = {}) {
  ;(createSupabaseServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  })

  const memberSingle = vi.fn().mockResolvedValue({ data: membership })
  const repoSingle = vi.fn().mockResolvedValue({ data: repo })
  const updateSingle = vi.fn().mockResolvedValue(updateResult)

  ;(createSupabaseServiceClient as ReturnType<typeof vi.fn>).mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === 'workspace_members') {
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: memberSingle }
      }
      if (table === 'repos') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: repoSingle,
          update: vi.fn().mockReturnThis(),
        }
      }
      return {}
    }),
  })

  // Make update().eq().select().single() chain work
  ;(createSupabaseServiceClient as ReturnType<typeof vi.fn>).mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === 'workspace_members') {
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: memberSingle }
      }
      if (table === 'repos') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: repoSingle,
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: updateSingle,
              }),
            }),
          }),
        }
      }
      return {}
    }),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PATCH /api/workspaces/[id]/repos/[repoId]', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 when not authenticated', async () => {
    setupMocks({ user: null })
    const res = await PATCH(makeRequest({ tag_based_mode: true }), makeParams())
    expect(res.status).toBe(401)
  })

  it('returns 403 when user is not a workspace member', async () => {
    setupMocks({ membership: null })
    const res = await PATCH(makeRequest({ tag_based_mode: true }), makeParams())
    expect(res.status).toBe(403)
  })

  it('returns 403 when user has member role (not owner/admin)', async () => {
    setupMocks({ membership: { role: 'member' } })
    const res = await PATCH(makeRequest({ tag_based_mode: true }), makeParams())
    expect(res.status).toBe(403)
  })

  it('returns 400 for invalid body (non-boolean)', async () => {
    setupMocks()
    const res = await PATCH(makeRequest({ tag_based_mode: 'yes' }), makeParams())
    expect(res.status).toBe(400)
  })

  it('returns 404 when repo not found', async () => {
    setupMocks({ repo: null })
    const res = await PATCH(makeRequest({ tag_based_mode: true }), makeParams())
    expect(res.status).toBe(404)
  })

  it('returns 200 immediately when value is unchanged (no GitHub call)', async () => {
    setupMocks({ repo: { ...BASE_REPO, tag_based_mode: false } })
    const res = await PATCH(makeRequest({ tag_based_mode: false }), makeParams())
    expect(res.status).toBe(200)
    expect(updateWebhookEventsForRepo).not.toHaveBeenCalled()
  })

  it('enables tag mode: updates DB and adds release event to webhook', async () => {
    setupMocks({ repo: { ...BASE_REPO, tag_based_mode: false } })
    const res = await PATCH(makeRequest({ tag_based_mode: true }), makeParams())
    expect(res.status).toBe(200)
    expect(updateWebhookEventsForRepo).toHaveBeenCalledWith(
      123, 'org', 'repo', 456, ['pull_request', 'release']
    )
  })

  it('disables tag mode: updates DB and removes create event from webhook', async () => {
    setupMocks({ repo: { ...BASE_REPO, tag_based_mode: true }, updateResult: { data: { ...BASE_REPO, tag_based_mode: false }, error: null } })
    const res = await PATCH(makeRequest({ tag_based_mode: false }), makeParams())
    expect(res.status).toBe(200)
    expect(updateWebhookEventsForRepo).toHaveBeenCalledWith(
      123, 'org', 'repo', 456, ['pull_request']
    )
  })

  it('returns 502 when GitHub webhook update fails', async () => {
    setupMocks()
    ;(updateWebhookEventsForRepo as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('GitHub API error'))
    const res = await PATCH(makeRequest({ tag_based_mode: true }), makeParams())
    expect(res.status).toBe(502)
  })
})
