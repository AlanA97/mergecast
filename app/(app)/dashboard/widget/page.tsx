import { createSupabaseServerClient } from '@/lib/supabase/server'
import { WidgetSettingsForm } from '@/components/dashboard/widget-settings-form'

export default async function WidgetPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspaces(id, slug)')
    .eq('user_id', user!.id)
    .limit(1)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workspace = membership?.workspaces as any
  const slug: string = workspace?.slug ?? ''
  const workspaceId: string = workspace?.id ?? ''
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const snippet = `<script src="${appUrl}/api/widget/${slug}" data-workspace="${slug}" async></script>`

  return (
    <div className="p-4 md:p-6 max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Embed widget</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Add this script tag before the closing &lt;/body&gt; tag in your app.
        </p>
      </div>

      <div className="rounded-lg border bg-muted p-4">
        <pre className="text-xs overflow-auto whitespace-pre-wrap break-all">{snippet}</pre>
      </div>

      <WidgetSettingsForm workspaceId={workspaceId} />
    </div>
  )
}
