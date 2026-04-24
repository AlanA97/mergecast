import { createSupabaseServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('workspace_id, workspaces(id, name, slug, plan)')
    .eq('user_id', user.id)
    .limit(1)

  if (!memberships?.length) redirect('/onboarding')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workspace = (memberships[0].workspaces as any)

  return (
    <div className="flex h-screen">
      <Sidebar workspace={workspace} />
      <main className="flex-1 overflow-auto bg-muted/10">{children}</main>
    </div>
  )
}
