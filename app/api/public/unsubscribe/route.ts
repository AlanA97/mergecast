import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/`)
  }

  const service = createSupabaseServiceClient()
  await service
    .from('subscribers')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('unsubscribe_token', token)
    .is('unsubscribed_at', null)

  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_APP_URL}/unsubscribe?success=true`
  )
}
