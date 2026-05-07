import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  // When the Supabase OAuth redirect URL is misconfigured (e.g. missing from
  // additional_redirect_urls, or NEXT_PUBLIC_APP_URL not set), Supabase falls
  // back to site_url and sends the PKCE code to the root: /?code=<uuid>.
  // Catch that here and forward to the real callback handler so sign-in still
  // works rather than silently dropping the code on the landing page.
  if (request.nextUrl.pathname === '/' && request.nextUrl.searchParams.has('code')) {
    const url = request.nextUrl.clone()
    url.pathname = '/api/auth/callback'
    return NextResponse.redirect(url)
  }

  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|widget|api/webhooks|api/public|api/cron).*)'],
}
