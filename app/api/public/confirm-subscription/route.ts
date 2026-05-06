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

  // Look up the subscriber first to check token expiry before confirming
  const { data: pending } = await service
    .from('subscribers')
    .select('id, confirmation_token_expires_at, workspaces(slug)')
    .eq('confirmation_token', token)
    .eq('confirmed', false)
    .single()

  if (!pending) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/?error=invalid_token`
    )
  }

  if (
    pending.confirmation_token_expires_at &&
    new Date(pending.confirmation_token_expires_at) < new Date()
  ) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/?error=expired_token`
    )
  }

  const { data: subscriber } = await service
    .from('subscribers')
    .update({
      confirmed: true,
      confirmed_at: new Date().toISOString(),
      confirmation_token: null,
      confirmation_token_expires_at: null,
    })
    .eq('id', pending.id)
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
