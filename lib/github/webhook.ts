export async function validateGitHubWebhookSignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!signature || !signature.startsWith('sha256=')) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const expectedBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  const expectedHex =
    'sha256=' +
    Array.from(new Uint8Array(expectedBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

  // Constant-time comparison to prevent timing attacks
  if (expectedHex.length !== signature.length) return false
  let mismatch = 0
  for (let i = 0; i < expectedHex.length; i++) {
    mismatch |= expectedHex.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return mismatch === 0
}

export interface ParsedPullRequest {
  prNumber: number
  prTitle: string
  prBody: string
  prUrl: string
  prAuthor: string
  prMergedAt: string
  repoId: number
  repoFullName: string
  labels: string[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsePullRequestEvent(payload: any): ParsedPullRequest | null {
  if (payload.action !== 'closed') return null
  if (!payload.pull_request?.merged) return null

  return {
    prNumber: payload.pull_request.number,
    prTitle: payload.pull_request.title ?? '',
    prBody: payload.pull_request.body ?? '',
    prUrl: payload.pull_request.html_url,
    prAuthor: payload.pull_request.user?.login ?? '',
    prMergedAt: payload.pull_request.merged_at,
    repoId: payload.repository.id,
    repoFullName: payload.repository.full_name,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    labels: (payload.pull_request.labels ?? []).map((l: any) => l.name).filter((name: unknown): name is string => typeof name === 'string' && name.length > 0),
  }
}
