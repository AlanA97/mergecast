import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const isAdmin = user.user_metadata?.is_admin === true
  if (!isAdmin) redirect('/dashboard')

  const service = createSupabaseServiceClient()
  const { data: workspaces } = await service
    .from('workspaces')
    .select('id, name, slug, plan, created_at')
    .order('created_at', { ascending: false })

  const planCounts = (workspaces ?? []).reduce((acc, ws) => {
    acc[ws.plan] = (acc[ws.plan] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const paidPlans = ['starter', 'growth', 'scale']
  const mrrEstimate = (workspaces ?? []).reduce((sum, ws) => {
    const prices: Record<string, number> = { starter: 29, growth: 59, scale: 99 }
    return sum + (prices[ws.plan] ?? 0)
  }, 0)

  return (
    <div className="p-6 max-w-5xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Admin</h1>
        <p className="text-sm text-muted-foreground">Internal overview — not visible to users.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total workspaces', value: workspaces?.length ?? 0 },
          { label: 'Paid (any plan)', value: Object.entries(planCounts).filter(([k]) => paidPlans.includes(k)).reduce((s, [, v]) => s + v, 0) },
          { label: 'Free', value: planCounts['free'] ?? 0 },
          { label: 'MRR estimate', value: `$${mrrEstimate}` },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border p-4">
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Workspace list */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              {['Name', 'Slug', 'Plan', 'Created'].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(workspaces ?? []).map(ws => (
              <tr key={ws.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{ws.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{ws.slug}</td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${ws.plan === 'free' ? 'bg-muted' : 'bg-green-100 text-green-800'}`}>
                    {ws.plan}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(ws.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
