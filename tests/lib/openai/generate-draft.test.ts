import { describe, it, expect, vi } from 'vitest'
import { generateChangelogDraft, type ChatCompletionClient } from '@/lib/openai/generate-draft'

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
