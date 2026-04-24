'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { slugify } from '@/lib/utils'

type Step = 'workspace' | 'connect' | 'done'

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  )
}

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('workspace')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugError, setSlugError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleNameChange(value: string) {
    setName(value)
    setSlug(slugify(value))
    setSlugError('')
  }

  async function createWorkspace() {
    setLoading(true)
    const res = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug }),
    })
    const data = await res.json()
    setLoading(false)

    if (res.status === 409) {
      setSlugError('This slug is already taken. Try a different one.')
      return
    }
    if (!res.ok) {
      setSlugError('Something went wrong. Please try again.')
      return
    }

    setStep('connect')
  }

  function openGitHubApp() {
    const appSlug = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG
    window.open(`https://github.com/apps/${appSlug}/installations/new`, '_blank')
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-8 p-8">
        {/* Step indicator */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {(['workspace', 'connect', 'done'] as Step[]).map((s, i) => (
            <span
              key={s}
              className={`flex items-center gap-2 ${step === s ? 'text-foreground font-medium' : ''}`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                  step === s ? 'bg-foreground text-background' : 'bg-muted'
                }`}
              >
                {i + 1}
              </span>
              {s === 'workspace' ? 'Name it' : s === 'connect' ? 'Connect repo' : 'Done'}
              {i < 2 && <span className="mx-1">→</span>}
            </span>
          ))}
        </div>

        {step === 'workspace' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold">Name your changelog</h1>
              <p className="text-muted-foreground text-sm mt-1">
                This is how your users will find your changelog.
              </p>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Workspace name</Label>
                <Input
                  value={name}
                  onChange={e => handleNameChange(e.target.value)}
                  placeholder="Acme Inc"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label>Changelog URL</Label>
                <div className="flex items-center rounded-md border bg-muted px-3 py-2 text-sm">
                  <span className="text-muted-foreground">changelog.mergecast.co/</span>
                  <Input
                    value={slug}
                    onChange={e => {
                      setSlug(e.target.value)
                      setSlugError('')
                    }}
                    className="border-0 bg-transparent p-0 focus-visible:ring-0"
                    placeholder="acme"
                  />
                </div>
                {slugError && <p className="text-destructive text-xs">{slugError}</p>}
              </div>
            </div>
            <Button
              onClick={createWorkspace}
              disabled={!name || !slug || loading}
              className="w-full"
            >
              {loading ? 'Creating…' : 'Continue'}
            </Button>
          </div>
        )}

        {step === 'connect' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold">Connect a GitHub repo</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Mergecast will listen for merged pull requests and draft release notes automatically.
              </p>
            </div>
            <Button onClick={openGitHubApp} className="w-full" size="lg">
              <GitHubIcon className="mr-2 h-4 w-4" />
              Install GitHub App
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Opens GitHub in a new tab. Return here when done.
            </p>
            <Button variant="outline" className="w-full" onClick={() => setStep('done')}>
              I&apos;ve installed it — continue
            </Button>
            <button
              className="w-full text-sm text-muted-foreground underline"
              onClick={() => setStep('done')}
            >
              Skip for now
            </button>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-6 text-center">
            <div className="text-5xl">🎉</div>
            <div>
              <h1 className="text-2xl font-bold">You&apos;re all set</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Merge a PR and your first draft will appear in the dashboard.
              </p>
            </div>
            <Button className="w-full" onClick={() => router.push('/dashboard')}>
              Go to dashboard
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
