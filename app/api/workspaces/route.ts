import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'


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

  // Create workspace, member, settings and ignore rules atomically via RPC
  const { data: workspace, error: wsError } = await service.rpc('create_workspace_with_defaults', {
    p_name: name,
    p_slug: slug,
    p_user_id: user.id,
  })

  if (wsError || !workspace) {
    // Catch the unique-violation that fires when a concurrent request wins the slug race
    if (wsError?.code === '23505') {
      return NextResponse.json({ error: 'SLUG_TAKEN' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to create workspace' }, { status: 500 })
  }

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
    .eq('user_id', user.id) as { data: Array<{ workspace_id: string; role: string; workspaces: Record<string, unknown> }> | null }

  const workspaces = (memberships ?? []).map(m => ({ ...m.workspaces, role: m.role }))
  return NextResponse.json({ workspaces })
}
