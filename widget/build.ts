import { buildSync } from 'esbuild'
import { writeFileSync, mkdirSync } from 'fs'

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mergecast.co'

const result = buildSync({
  entryPoints: ['widget/src/index.ts'],
  bundle: true,
  minify: true,
  format: 'iife',
  define: { MERGECAST_API_URL: JSON.stringify(appUrl) },
  write: false,
})

mkdirSync('public/widget', { recursive: true })
writeFileSync('public/widget/widget.js', result.outputFiles[0].text)
console.log('Widget built:', result.outputFiles[0].text.length, 'bytes')
