import OpenAI from 'openai'

export interface ChatCompletionClient {
  // Narrow interface for testability — compatible with OpenAI client shape
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chat: { completions: { create: (params: any) => Promise<any> } }
}

interface DraftInput {
  prTitle: string
  prBody: string
  _client?: ChatCompletionClient
}

interface DraftOutput {
  title: string
  body: string
}

export interface ReleaseDraftInput {
  tagName: string
  prs: Array<{ prTitle: string; prBody: string }>
  _client?: ChatCompletionClient
}

const RELEASE_SYSTEM_PROMPT = `You are a product writer for a SaaS company. Your job is to write a concise, user-facing release notes entry from a list of GitHub pull requests included in a release tag.

Rules:
- Write for end users, not developers. Avoid technical jargon like "refactor", "fix null pointer", "bump dependency".
- Title: use the tag name followed by a short release headline (e.g. "v1.2.0 — Dark mode & faster search"). Keep it under 80 characters.
- Body: group changes thematically into 2–5 short bullet points. Each bullet describes one user-facing improvement (start each with "- ").
- Omit dependency bumps, CI changes, internal refactors, and test-only changes entirely.
- If ALL PRs are infrastructure-only with no user impact, return: {"title":"","body":""}
- Respond ONLY with valid JSON: {"title":"...","body":"..."}`

export async function generateReleaseNotesDraft(input: ReleaseDraftInput): Promise<DraftOutput> {
  const client: ChatCompletionClient =
    input._client ?? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  // Cap at 50 PRs to stay within safe token limits; remainder is noted in the prompt
  const MAX_PRS = 50
  const truncated = input.prs.length > MAX_PRS
  const prsToSend = input.prs.slice(0, MAX_PRS)
  const prList = prsToSend
    .map((pr, i) => `PR ${i + 1}: ${pr.prTitle}\n${pr.prBody ? pr.prBody.slice(0, 300) : '(no description)'}`)
    .join('\n\n') + (truncated ? `\n\n(${input.prs.length - MAX_PRS} additional PRs omitted for brevity)` : '')
  const userMessage = `Tag: ${input.tagName}\n\nPull requests in this release:\n\n${prList}`

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL,
    messages: [
      { role: 'system', content: RELEASE_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.4,
    max_completion_tokens: 600,
  })

  const content = response.choices[0]?.message?.content ?? ''

  let parsed: { title?: string; body?: string }
  try {
    parsed = JSON.parse(content)
  } catch {
    return { title: input.tagName, body: '' }
  }

  return {
    title: parsed.title || input.tagName,
    body: parsed.body || '',
  }
}

const SYSTEM_PROMPT = `You are a product writer for a SaaS company. Your job is to turn a GitHub pull request into a concise, user-facing changelog entry.

Rules:
- Write for end users, not developers. Avoid technical jargon like "refactor", "fix null pointer", "bump dependency".
- Title: short, positive, feature-focused (e.g. "Dark mode support", "Faster search results")
- Body: 1–3 sentences explaining what changed and why it benefits the user
- If the PR is a dependency bump, internal refactor, or CI change with no user impact, return: {"title":"","body":""}
- Respond ONLY with valid JSON: {"title":"...","body":"..."}`

export async function generateChangelogDraft(input: DraftInput): Promise<DraftOutput> {
  const client: ChatCompletionClient =
    input._client ?? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const userMessage = `PR Title: ${input.prTitle}\nPR Description: ${input.prBody || '(none)'}`

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.4,
    max_completion_tokens: 300,
  })

  const content = response.choices[0]?.message?.content ?? ''

  let parsed: { title?: string; body?: string }
  try {
    parsed = JSON.parse(content)
  } catch {
    // Model returned non-JSON — fall back to PR title with no body
    return { title: input.prTitle, body: '' }
  }

  return {
    title: parsed.title || input.prTitle,
    body: parsed.body || '',
  }
}
