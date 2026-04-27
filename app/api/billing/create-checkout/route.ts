import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { getStripeClient } from '@/lib/stripe/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const CheckoutSchema = z.object({
  workspace_id: z.string().uuid(),
  price_id: z.string().startsWith('price_'),
})

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = CheckoutSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { workspace_id, price_id } = parsed.data
  const service = createSupabaseServiceClient()

  const { data: membership } = await service
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspace_id)
    .eq('user_id', user.id)
    .single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: workspace } = await service
    .from('workspaces')
    .select('stripe_customer_id, name')
    .eq('id', workspace_id)
    .single() as { data: { stripe_customer_id: string | null; name: string } | null }
  if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const stripe = getStripeClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: price_id, quantity: 1 }],
    customer: workspace.stripe_customer_id ?? undefined,
    customer_email: workspace.stripe_customer_id ? undefined : user.email,
    metadata: { workspace_id },
    success_url: `${appUrl}/dashboard/billing?success=true`,
    cancel_url: `${appUrl}/dashboard/billing`,
  })

  return NextResponse.json({ url: session.url })
}
