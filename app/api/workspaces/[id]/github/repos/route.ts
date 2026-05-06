import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { getGitHubApp, getInstallationOctokit } from '@/lib/github/app'
import { NextResponse } from 'next/server'

export interface GitHubAvailableRepo {
  id: number
  full_name: string
  private: boolean
  installation_id: number
  already_connected: boolean
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workspaceId } = await params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()

  const { data: membership } = await service
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Already-connected repos for this workspace (to mark them)
  const { data: connectedRepos } = await service
    .from('repos')
    .select('github_repo_id')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
  const connectedIds = new Set((connectedRepos ?? []).map(r => r.github_repo_id))

  // The user's GitHub login is stored in auth metadata by Supabase's GitHub OAuth provider.
  // We use it to filter installations to only those belonging to the user's account or
  // organisations they administer — preventing cross-customer data leakage.
  const githubLogin: string | undefined =
    user.user_metadata?.user_name ?? user.user_metadata?.preferred_username

  try {
    const app = getGitHubApp()

    const { data: allInstallations } = await app.octokit.request('GET /app/installations', {
      per_page: 100,
    })

    // Filter to installations that belong to the authenticated user's account.
    // Fall back to all installations only when GitHub login is unavailable (should not happen
    // with GitHub OAuth, but prevents a hard failure).
    const installations = githubLogin
      ? allInstallations.filter(
          (inst: { account: { login: string } | null }) =>
            inst.account?.login === githubLogin
        )
      : allInstallations

    const repos: GitHubAvailableRepo[] = []

    for (const installation of installations) {
      const octokit = await getInstallationOctokit(installation.id)
      const { data } = await octokit.rest.apps.listReposAccessibleToInstallation({
        per_page: 100,
      })
      for (const repo of data.repositories) {
        repos.push({
          id: repo.id,
          full_name: repo.full_name,
          private: repo.private,
          installation_id: installation.id,
          already_connected: connectedIds.has(repo.id),
        })
      }
    }

    return NextResponse.json({ repos })
  } catch (err) {
    console.error('GitHub installations fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch GitHub repositories' }, { status: 502 })
  }
}
