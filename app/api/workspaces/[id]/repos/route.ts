import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { registerWebhookForRepo } from '@/lib/github/app'
import { PLAN_LIMITS } from '@/lib/plans'
import { generateToken } from '@/lib/utils'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const ConnectRepoSchema = z.object({
  github_installation_id: z.number(),
  github_repo_id: z.number(),
  full_name: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workspaceId } = await params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()

  // Verify membership
  const { data: membership } = await service
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: workspace } = await service
    .from('workspaces')
    .select('plan')
    .eq('id', workspaceId)
    .single()
  if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Check repo limit
  const { count } = await service
    .from('repos')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)

  const repoLimit = PLAN_LIMITS[(workspace as any).plan as keyof typeof PLAN_LIMITS].repos
  if ((count ?? 0) >= repoLimit) {
    return NextResponse.json({ error: 'REPO_LIMIT_REACHED' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = ConnectRepoSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { github_installation_id, github_repo_id, full_name } = parsed.data
  const [owner, repo] = full_name.split('/')
  const webhookSecret = generateToken(32)

  // Register webhook via GitHub API
  let webhookId: number
  try {
    webhookId = await registerWebhookForRepo(github_installation_id, owner, repo, webhookSecret)
  } catch {
    return NextResponse.json({ error: 'Failed to register GitHub webhook' }, { status: 502 })
  }

  const { data: repoRecord, error } = await service
    .from('repos')
    .upsert(
      {
        workspace_id: workspaceId,
        github_repo_id,
        full_name,
        github_installation_id,
        webhook_secret: webhookSecret,
        is_active: true,
      },
      { onConflict: 'github_repo_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Failed to save repo' }, { status: 500 })

  return NextResponse.json({ repo: repoRecord }, { status: 201 })
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

  const { data: repos } = await supabase
    .from('repos')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .order('connected_at', { ascending: false })

  return NextResponse.json({ repos: repos ?? [] })
}
