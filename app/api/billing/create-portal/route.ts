import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { getStripeClient } from '@/lib/stripe/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const PortalSchema = z.object({ workspace_id: z.string().uuid() })

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = PortalSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const service = createSupabaseServiceClient()
  const { data: workspace } = await service
    .from('workspaces')
    .select('stripe_customer_id')
    .eq('id', parsed.data.workspace_id)
    .single()

  if (!(workspace as any)?.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing account found' }, { status: 400 })
  }

  const stripe = getStripeClient()
  const session = await stripe.billingPortal.sessions.create({
    customer: (workspace as any).stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
  })

  return NextResponse.json({ url: session.url })
}
