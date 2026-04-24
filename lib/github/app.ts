import { App } from '@octokit/app'
import { Octokit } from '@octokit/rest'

let _app: App | null = null

export function getGitHubApp(): App {
  if (_app) return _app
  _app = new App({
    appId: process.env.GITHUB_APP_ID!,
    privateKey: Buffer.from(process.env.GITHUB_APP_PRIVATE_KEY!, 'base64').toString('utf-8'),
    webhooks: { secret: process.env.GITHUB_APP_WEBHOOK_SECRET! },
    Octokit,
  })
  return _app
}

export async function getInstallationOctokit(installationId: number): Promise<Octokit> {
  const app = getGitHubApp()
  return app.getInstallationOctokit(installationId) as unknown as Octokit
}

export async function registerWebhookForRepo(
  installationId: number,
  owner: string,
  repo: string,
  webhookSecret: string
): Promise<number> {
  const octokit = await getInstallationOctokit(installationId)
  const { data } = await octokit.rest.repos.createWebhook({
    owner,
    repo,
    config: {
      url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/github`,
      content_type: 'json',
      secret: webhookSecret,
    },
    events: ['pull_request'],
    active: true,
  })
  return data.id
}

export async function deleteWebhookForRepo(
  installationId: number,
  owner: string,
  repo: string,
  hookId: number
): Promise<void> {
  const octokit = await getInstallationOctokit(installationId)
  await octokit.rest.repos.deleteWebhook({ owner, repo, hook_id: hookId })
}
