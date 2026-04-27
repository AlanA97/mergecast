import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mergecast.co'
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/privacy', '/terms'],
        disallow: ['/dashboard/', '/onboarding/', '/admin/', '/api/'],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
  }
}
