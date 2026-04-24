import { createSupabaseServerClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'

export default async function SubscribersPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspaces(id)')
    .eq('user_id', user!.id)
    .limit(1)
    .single()

  const workspaceId = (membership?.workspaces as any)?.id

  const { data: subscribers, count } = await supabase
    .from('subscribers')
    .select('*', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .is('unsubscribed_at', null)
    .order('subscribed_at', { ascending: false })
    .limit(50)

  const confirmed = (subscribers ?? []).filter(s => s.confirmed).length

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Subscribers</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {confirmed} confirmed · {(count ?? 0) - confirmed} pending confirmation
        </p>
      </div>

      {(!subscribers || subscribers.length === 0) ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground text-sm">
            No subscribers yet. Share your changelog URL to start growing your list.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                {['Email', 'Status', 'Subscribed'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subscribers.map(s => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="px-4 py-3">{s.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant={s.confirmed ? 'default' : 'secondary'}>
                      {s.confirmed ? 'confirmed' : 'pending'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {format(new Date(s.subscribed_at), 'MMM d, yyyy')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
