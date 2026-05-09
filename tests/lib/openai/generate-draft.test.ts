import { describe, it, expect, vi } from 'vitest'
import { generateChangelogDraft, generateReleaseNotesDraft, type ChatCompletionClient } from '@/lib/openai/generate-draft'

function makeClient(content: string): ChatCompletionClient {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content } }],
        }),
      },
    },
  }
}

describe('generateChangelogDraft', () => {
  it('returns title and body from OpenAI response', async () => {
    const client = makeClient(
      '{"title":"Dark mode support","body":"You can now switch between light and dark mode in your account settings."}'
    )
    const result = await generateChangelogDraft({
      prTitle: 'Add dark mode toggle',
      prBody: 'Implements a theme switcher in the settings page. Closes #123.',
      _client: client,
    })
    expect(result.title).toBe('Dark mode support')
    expect(result.body).toContain('dark mode')
  })

  it('returns fallback on malformed JSON response', async () => {
    const client = makeClient('not json at all')
    const result = await generateChangelogDraft({
      prTitle: 'Fix bug',
      prBody: '',
      _client: client,
    })
    expect(result.title).toBe('Fix bug')
    expect(result.body).toBe('')
  })

  it('returns empty title and body for infra-only PRs', async () => {
    const client = makeClient('{"title":"","body":""}')
    const result = await generateChangelogDraft({
      prTitle: 'Bump eslint from 9.0.0 to 9.1.0',
      prBody: '',
      _client: client,
    })
    // title falls back to prTitle when returned title is empty
    expect(result.title).toBe('Bump eslint from 9.0.0 to 9.1.0')
    expect(result.body).toBe('')
  })
})

describe('generateReleaseNotesDraft', () => {
  it('returns title and bulleted body from multi-PR list', async () => {
    const client = makeClient(
      '{"title":"v1.2.0 — Dark mode & faster search","body":"- Dark mode support added\\n- Search now 3× faster"}'
    )
    const result = await generateReleaseNotesDraft({
      tagName: 'v1.2.0',
      prs: [
        { prTitle: 'Add dark mode toggle', prBody: 'Implements theme switcher.' },
        { prTitle: 'Optimise search index', prBody: 'New index reduces latency.' },
      ],
      _client: client,
    })
    expect(result.title).toBe('v1.2.0 — Dark mode & faster search')
    expect(result.body).toContain('Dark mode')
  })

  it('falls back to tagName as title when AI returns empty title', async () => {
    const client = makeClient('{"title":"","body":""}')
    const result = await generateReleaseNotesDraft({
      tagName: 'v2.0.0',
      prs: [{ prTitle: 'Bump deps', prBody: '' }],
      _client: client,
    })
    expect(result.title).toBe('v2.0.0')
    expect(result.body).toBe('')
  })

  it('falls back gracefully on malformed JSON response', async () => {
    const client = makeClient('not valid json')
    const result = await generateReleaseNotesDraft({
      tagName: 'v3.0.0',
      prs: [{ prTitle: 'Add feature', prBody: '' }],
      _client: client,
    })
    expect(result.title).toBe('v3.0.0')
    expect(result.body).toBe('')
  })

  it('truncates PR list at 50 entries before sending to OpenAI', async () => {
    const createSpy = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"title":"v1.0.0","body":"- Many improvements"}' } }],
    })
    const client: ChatCompletionClient = { chat: { completions: { create: createSpy } } }
    const prs = Array.from({ length: 60 }, (_, i) => ({ prTitle: `PR ${i + 1}`, prBody: '' }))
    await generateReleaseNotesDraft({ tagName: 'v1.0.0', prs, _client: client })
    const calledWith = (createSpy as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const userMessage = calledWith.messages[1].content as string
    // Only PRs 1-50 should appear; PR 51 should not
    expect(userMessage).toContain('PR 50')
    expect(userMessage).not.toContain('PR 51:')
    expect(userMessage).toContain('10 additional PRs omitted')
  })
})
