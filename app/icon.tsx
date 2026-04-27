import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

// Generates /icon.png — linked automatically by Next.js as a fallback icon
// for browsers that don't support SVG favicons (e.g. some Windows/iOS contexts).
// The primary icon is /public/favicon.svg (declared in app/layout.tsx metadata).
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#10b981',
          width: '100%',
          height: '100%',
          borderRadius: '25%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Simplified merge-arrows shape */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 40 40"
          style={{ display: 'block' }}
        >
          <circle cx="10" cy="13" r="3" fill="white" />
          <circle cx="10" cy="27" r="3" fill="white" />
          <circle cx="30" cy="20" r="3" fill="white" />
          <path
            d="M13 13 Q24 13 27 20"
            stroke="white"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M13 27 Q24 27 27 20"
            stroke="white"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    { ...size }
  )
}
