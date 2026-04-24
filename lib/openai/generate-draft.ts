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

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.4,
      max_tokens: 300,
    })

    const content = response.choices[0]?.message?.content ?? ''
    const parsed = JSON.parse(content)

    return {
      title: parsed.title || input.prTitle,
      body: parsed.body || '',
    }
  } catch {
    return { title: input.prTitle, body: '' }
  }
}
