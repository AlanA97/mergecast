'use client'
import {useState, ChangeEvent} from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function SubscribeForm({ workspaceId }: { workspaceId: string }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function subscribe(e: ChangeEvent) {
    e.preventDefault()
    setState('loading')
    const res = await fetch('/api/public/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: workspaceId, email }),
    })
    if (res.ok) {
      setState('success')
    } else {
      const data = await res.json()
      setErrorMsg(
        data.error === 'SUBSCRIBER_LIMIT_REACHED'
          ? 'Subscriptions are temporarily unavailable.'
          : 'Something went wrong. Please try again.'
      )
      setState('error')
    }
  }

  if (state === 'success') {
    return (
      <div className="rounded-lg border p-4 text-sm text-center">
        Check your inbox to confirm your subscription.
      </div>
    )
  }

  return (
    <div>
      <form onSubmit={subscribe} className="flex gap-2">
        <Input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="flex-1"
        />
        <Button type="submit" disabled={state === 'loading'}>
          {state === 'loading' ? 'Subscribing…' : 'Subscribe'}
        </Button>
      </form>
      {state === 'error' && <p className="text-destructive text-xs mt-1">{errorMsg}</p>}
    </div>
  )
}
