'use client'
import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export function CopySnippet({ snippet }: { snippet: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative rounded-lg border bg-muted p-4">
      <button
        onClick={copy}
        className="absolute top-2 right-2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
        aria-label="Copy snippet"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <pre className="text-xs overflow-auto whitespace-pre-wrap break-all pr-7">{snippet}</pre>
    </div>
  )
}
