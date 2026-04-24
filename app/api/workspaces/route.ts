import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const DEFAULT_IGNORE_RULES = [
  { rule_type: 'title_prefix', pattern: 'chore:' },
  { rule_type: 'title_prefix', pattern: 'docs:' },
  { rule_type: 'title_prefix', pattern: 'ci:' },
  { rule_type: 'title_prefix', pattern: 'test:' },
  { rule_type: 'title_contains', pattern: 'bump deps' },
  { rule_type: 'title_contains', pattern: 'dependabot' },
]

const CreateWorkspaceSchema = z.object({
  name: z.string().min(1).max(64),
  slug: z
    .string()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
})

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = CreateWorkspaceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 })
  }

  const { name, slug } = parsed.data
  const service = createSupabaseServiceClient()

  // Check slug uniqueness
  const { data: existing } = await service
    .from('workspaces')
    .select('id')
    .eq('slug', slug)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'SLUG_TAKEN' }, { status: 409 })
  }

  // Create workspace
  const { data: workspace, error: wsError } = await service
    .from('workspaces')
    .insert({ name, slug })
    .select()
    .single()

  if (wsError || !workspace) {
    return NextResponse.json({ error: 'Failed to create workspace' }, { status: 500 })
  }

  // Add creator as owner
  await service.from('workspace_members').insert({
    workspace_id: workspace.id,
    user_id: user.id,
    role: 'owner',
  })

  // Create default settings
  await Promise.all([
    service.from('widget_settings').insert({ workspace_id: workspace.id }),
    service.from('changelog_settings').insert({ workspace_id: workspace.id }),
    service.from('pr_ignore_rules').insert(
      DEFAULT_IGNORE_RULES.map(r => ({ workspace_id: workspace.id, ...r }))
    ),
  ])

  return NextResponse.json({ workspace }, { status: 201 })
}

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, workspaces(*)')
    .eq('user_id', user.id)

  const workspaces = (memberships ?? []).map((m: any) => ({ ...m.workspaces, role: m.role }))
  return NextResponse.json({ workspaces })
}
