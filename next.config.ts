import type { NextConfig } from 'next'

// Content Security Policy
// - script-src / style-src use 'unsafe-inline' because Next.js App Router emits
//   inline scripts and styles during hydration. A nonce-based policy (stronger)
//   can be added later by generating a nonce in proxy.ts and threading it through
//   the root layout via headers.
// - connect-src covers Supabase REST + realtime WebSocket traffic from client
//   components (auth, subscriptions).
// - img-src is broad (https:) because workspace logo_url can be any hosted URL.
// - frame-ancestors 'none' supersedes X-Frame-Options for modern browsers;
//   we keep both for compatibility.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "font-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
