import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function WidgetPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspaces(slug)')
    .eq('user_id', user!.id)
    .limit(1)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slug = (membership?.workspaces as any)?.slug ?? ''
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const snippet = `<script src="${appUrl}/api/widget/${slug}" data-workspace="${slug}" async></script>`

  return (
    <div className="p-4 md:p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Embed widget</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Add this script tag before the closing &lt;/body&gt; tag in your app.
        </p>
      </div>
      <div className="rounded-lg border bg-muted p-4">
        <pre className="text-xs overflow-auto whitespace-pre-wrap break-all">{snippet}</pre>
      </div>
      <p className="text-sm text-muted-foreground">
        The widget renders a floating &quot;What&apos;s new&quot; button. Clicking it shows your
        latest published entries.
      </p>
    </div>
  )
}
