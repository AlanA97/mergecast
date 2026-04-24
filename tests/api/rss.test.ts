import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: vi.fn(),
}))

import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { GET } from '@/app/(public)/[slug]/rss.xml/route'

const mockWorkspace = { id: 'ws-1', name: 'Acme' }
const mockEntries = [
  {
    id: 'e1',
    title: 'New feature',
    final_content: 'We shipped X.',
    published_at: '2026-04-01T10:00:00Z',
  },
  {
    id: 'e2',
    title: 'Fix <bug> & stuff',
    final_content: 'Fixed the "thing".',
    published_at: '2026-03-01T10:00:00Z',
  },
]

function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) }
}

describe('GET /[slug]/rss.xml', () => {
  it('returns 404 for unknown slug', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue({
      from: () => ({
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null }) }) }),
      }),
    } as any)
    const res = await GET(new Request('http://localhost'), makeParams('unknown'))
    expect(res.status).toBe(404)
  })

  it('returns valid RSS with correct Content-Type', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'workspaces') return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: mockWorkspace }) }) }),
        }
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: mockEntries }) }) }) }),
          }),
        }
      },
    } as any)
    const res = await GET(new Request('http://localhost'), makeParams('acme'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('application/rss+xml')
    const body = await res.text()
    expect(body).toContain('<rss version="2.0">')
    expect(body).toContain('<title>New feature</title>')
  })

  it('escapes XML special characters in titles', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'workspaces') return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: mockWorkspace }) }) }),
        }
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: mockEntries }) }) }) }),
          }),
        }
      },
    } as any)
    const res = await GET(new Request('http://localhost'), makeParams('acme'))
    const body = await res.text()
    expect(body).toContain('Fix &lt;bug&gt; &amp; stuff')
  })

  it('returns valid RSS with empty channel when no entries', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'workspaces') return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: mockWorkspace }) }) }),
        }
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [] }) }) }) }),
          }),
        }
      },
    } as any)
    const res = await GET(new Request('http://localhost'), makeParams('acme'))
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('<channel>')
    expect(body).not.toContain('<item>')
  })
})
