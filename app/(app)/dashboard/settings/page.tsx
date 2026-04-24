'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, Lock } from 'lucide-react'

interface Workspace {
  id: string
  name: string
  slug: string
  plan: string
}

interface IgnoreRule {
  id: string
  rule_type: string
  pattern: string
}

interface ChangelogSettings {
  show_powered_by: boolean
}

const RULE_TYPE_LABELS: Record<string, string> = {
  title_prefix: 'Title starts with',
  title_contains: 'Title contains',
  label: 'Has label',
}

export default function SettingsPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [rules, setRules] = useState<IgnoreRule[]>([])
  const [newRuleType, setNewRuleType] = useState<string>('title_prefix')
  const [newRulePattern, setNewRulePattern] = useState('')
  const [addingRule, setAddingRule] = useState(false)

  const [changelogSettings, setChangelogSettings] = useState<ChangelogSettings | null>(null)
  const [savingBadge, setSavingBadge] = useState(false)

  useEffect(() => {
    fetch('/api/workspaces')
      .then(r => r.json())
      .then(data => {
        const ws = data.workspaces?.[0]
        if (!ws) return
        setWorkspace(ws)
        setName(ws.name)
        // Load ignore rules
        fetch(`/api/workspaces/${ws.id}/ignore-rules`)
          .then(r => r.json())
          .then(d => setRules(d.rules ?? []))
        // Load changelog settings
        fetch(`/api/workspaces/${ws.id}/changelog-settings`)
          .then(r => r.json())
          .then(d => setChangelogSettings(d.settings ?? null))
      })
  }, [])

  async function save() {
    if (!workspace) return
    setSaving(true)
    const res = await fetch(`/api/workspaces/${workspace.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  async function addRule() {
    if (!workspace || !newRulePattern.trim()) return
    setAddingRule(true)
    const res = await fetch(`/api/workspaces/${workspace.id}/ignore-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule_type: newRuleType, pattern: newRulePattern.trim() }),
    })
    if (res.ok) {
      const data = await res.json()
      setRules(prev => [...prev, data.rule])
      setNewRulePattern('')
    }
    setAddingRule(false)
  }

  async function deleteRule(ruleId: string) {
    if (!workspace) return
    const res = await fetch(`/api/workspaces/${workspace.id}/ignore-rules/${ruleId}`, { method: 'DELETE' })
    if (res.ok || res.status === 204) {
      setRules(prev => prev.filter(r => r.id !== ruleId))
    }
  }

  async function togglePoweredBy() {
    if (!workspace || !changelogSettings) return
    const isPaidPlan = ['growth', 'scale'].includes(workspace.plan.toLowerCase())
    if (!isPaidPlan) return // locked for free/starter
    setSavingBadge(true)
    const newValue = !changelogSettings.show_powered_by
    const res = await fetch(`/api/workspaces/${workspace.id}/changelog-settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ show_powered_by: newValue }),
    })
    if (res.ok) {
      setChangelogSettings(prev => prev ? { ...prev, show_powered_by: newValue } : prev)
    }
    setSavingBadge(false)
  }

  if (!workspace) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>

  const canToggleBadge = ['growth', 'scale'].includes(workspace.plan.toLowerCase())

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <h1 className="text-xl font-semibold">Settings</h1>

      {/* Workspace */}
      <div className="rounded-lg border p-6 space-y-4">
        <p className="font-medium">Workspace</p>
        <div className="space-y-2">
          <Label>Name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} className="max-w-sm" />
        </div>
        <div className="space-y-2">
          <Label>Changelog URL</Label>
          <p className="text-sm text-muted-foreground">
            changelog.mergecast.co/<strong>{workspace.slug}</strong>
          </p>
          <p className="text-xs text-muted-foreground">Slug cannot be changed after first publish.</p>
        </div>
        <Button onClick={save} disabled={saving} size="sm">
          {saved ? 'Saved' : saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>

      {/* Powered by Mergecast toggle */}
      {changelogSettings !== null && (
        <div className="rounded-lg border p-6 space-y-3">
          <p className="font-medium">Changelog Page</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">&ldquo;Powered by Mergecast&rdquo; badge</p>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                {!canToggleBadge && <Lock className="h-3 w-3 shrink-0" />}
                {canToggleBadge
                  ? 'Shown on your public changelog. Toggle to hide.'
                  : 'Growth plan required to remove.'}
              </p>
            </div>
            <button
              onClick={togglePoweredBy}
              disabled={!canToggleBadge || savingBadge}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                changelogSettings.show_powered_by ? 'bg-foreground' : 'bg-muted'
              } ${!canToggleBadge ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
              role="switch"
              aria-checked={changelogSettings.show_powered_by}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  changelogSettings.show_powered_by ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {!canToggleBadge && (
            <p className="text-xs text-muted-foreground">
              <a href="/dashboard/billing" className="underline">Upgrade to Growth</a> to remove the badge.
            </p>
          )}
        </div>
      )}

      {/* PR Ignore Rules */}
      <div className="rounded-lg border p-6 space-y-4">
        <div>
          <p className="font-medium">PR ignore rules</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            PRs matching any rule are silently skipped — no draft is created.
          </p>
        </div>

        {rules.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No rules yet — default rules are pre-configured when you connect your first repo.
          </p>
        )}
        {rules.length > 0 && (
          <div className="space-y-2">
            {rules.map(rule => (
              <div key={rule.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>
                  <span className="text-muted-foreground">{RULE_TYPE_LABELS[rule.rule_type] ?? rule.rule_type}: </span>
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">{rule.pattern}</code>
                </span>
                <button
                  onClick={() => deleteRule(rule.id)}
                  className="text-muted-foreground hover:text-destructive ml-2"
                  aria-label="Remove rule"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add rule form */}
        <div className="flex gap-2">
          <select
            value={newRuleType}
            onChange={e => setNewRuleType(e.target.value)}
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            <option value="title_prefix">Title starts with</option>
            <option value="title_contains">Title contains</option>
            <option value="label">Has label</option>
          </select>
          <Input
            value={newRulePattern}
            onChange={e => setNewRulePattern(e.target.value)}
            placeholder="e.g. chore:"
            className="flex-1 h-9"
            onKeyDown={e => { if (e.key === 'Enter') addRule() }}
          />
          <Button size="sm" onClick={addRule} disabled={addingRule || !newRulePattern.trim()}>
            Add
          </Button>
        </div>
      </div>
    </div>
  )
}
