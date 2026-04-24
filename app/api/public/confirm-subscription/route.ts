import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/?error=invalid_token`
    )
  }

  const service = createSupabaseServiceClient()
  const { data: subscriber } = await service
    .from('subscribers')
    .update({
      confirmed: true,
      confirmed_at: new Date().toISOString(),
      confirmation_token: null,
    })
    .eq('confirmation_token', token)
    .select('workspaces(slug)')
    .single()

  if (!subscriber) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/?error=invalid_token`
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slug = (subscriber.workspaces as any)?.slug ?? ''
  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_APP_URL}/confirm-subscription?slug=${slug}`
  )
}
