'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ExternalLink, Eye, RefreshCw } from 'lucide-react'

interface EntryEditorProps {
  entry: {
    id: string
    title: string | null
    final_content: string | null
    ai_draft: string | null
    pr_title: string | null
    pr_number: number | null
    pr_url: string | null
    pr_author: string | null
    pr_merged_at: string | null
    pr_body: string | null
    status: string
    view_count: number
    published_at: string | null
  }
  workspaceId: string
  subscriberCount: number
}

export function EntryEditor({ entry, workspaceId, subscriberCount }: EntryEditorProps) {
  const router = useRouter()
  const [title, setTitle] = useState(entry.title ?? entry.pr_title ?? '')
  const [content, setContent] = useState(entry.final_content ?? entry.ai_draft ?? '')
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')

  async function saveDraft() {
    setSaving(true)
    await fetch(`/api/workspaces/${workspaceId}/entries/${entry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, final_content: content }),
    })
    setSaving(false)
  }

  async function publish() {
    setPublishing(true)
    setError('')
    const res = await fetch(`/api/workspaces/${workspaceId}/entries/${entry.id}/publish`, {
      method: 'POST',
    })
    if (res.status === 403) {
      const data = await res.json()
      setError(
        data.error === 'QUOTA_EXCEEDED'
          ? 'Monthly publish limit reached. Upgrade to continue.'
          : 'You do not have permission to publish.'
      )
      setPublishing(false)
      setShowConfirm(false)
      return
    }
    router.push('/dashboard?tab=published')
    router.refresh()
  }

  async function regenerate() {
    setRegenerating(true)
    const res = await fetch(`/api/workspaces/${workspaceId}/entries/${entry.id}/regenerate`, {
      method: 'POST',
    })
    const data = await res.json()
    if (data.entry?.ai_draft) setContent(data.entry.ai_draft)
    setRegenerating(false)
  }

  async function archive() {
    await fetch(`/api/workspaces/${workspaceId}/entries/${entry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    })
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="flex gap-6 p-6 max-w-5xl">
      <div className="flex-1 space-y-4">
        <div className="space-y-2">
          <Label>Title</Label>
          <Input value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Content (markdown)</Label>
            <Button variant="ghost" size="sm" onClick={regenerate} disabled={regenerating}>
              <RefreshCw className={`mr-1 h-3 w-3 ${regenerating ? 'animate-spin' : ''}`} />
              Regenerate with AI
            </Button>
          </div>
          <Textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            className="min-h-[280px] font-mono text-sm"
          />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <div className="flex items-center gap-2 pt-2">
          <Button variant="outline" onClick={archive}>
            Archive
          </Button>
          <Button variant="outline" onClick={saveDraft} disabled={saving}>
            {saving ? 'Saving…' : 'Save draft'}
          </Button>
          <Button
            onClick={() => setShowConfirm(true)}
            disabled={entry.status === 'published'}
          >
            {entry.status === 'published' ? 'Published' : 'Publish'}
          </Button>
        </div>

        {showConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-background rounded-lg p-6 max-w-sm w-full space-y-4">
              <h2 className="font-semibold">Publish this entry?</h2>
              <p className="text-sm text-muted-foreground">
                This will update your public changelog and email{' '}
                <strong>
                  {subscriberCount} subscriber{subscriberCount !== 1 ? 's' : ''}
                </strong>
                .
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowConfirm(false)}>
                  Cancel
                </Button>
                <Button onClick={publish} disabled={publishing}>
                  {publishing ? 'Publishing…' : 'Confirm publish'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="w-72 shrink-0 space-y-4">
        <div className="rounded-lg border p-4 space-y-3 text-sm">
          <p className="font-medium">Source PR</p>
          {entry.pr_url && (
            <a
              href={entry.pr_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
              {entry.pr_title} #{entry.pr_number}
            </a>
          )}
          {entry.pr_author && (
            <p className="text-muted-foreground">by @{entry.pr_author}</p>
          )}
          <Badge>{entry.status}</Badge>
          {entry.status === 'published' && (
            <p className="text-muted-foreground flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {entry.view_count} view{entry.view_count !== 1 ? 's' : ''}
              {entry.published_at && (
                <span className="ml-1">
                  · Published {format(new Date(entry.published_at), 'MMM d')}
                </span>
              )}
            </p>
          )}
        </div>
        {entry.ai_draft && (
          <div className="rounded-lg border p-4 space-y-2 text-sm">
            <p className="font-medium text-muted-foreground">AI draft (reference)</p>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">
              {entry.ai_draft}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
