'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface WidgetSettings {
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  theme: 'light' | 'dark'
  accent_color: string
  button_label: string
}

const POSITIONS: Array<{ value: WidgetSettings['position']; label: string }> = [
  { value: 'bottom-right', label: 'Bottom right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'top-right', label: 'Top right' },
  { value: 'top-left', label: 'Top left' },
]

export function WidgetSettingsForm({ workspaceId }: { workspaceId: string }) {
  const [settings, setSettings] = useState<WidgetSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch(`/api/workspaces/${workspaceId}/widget-settings`)
      .then(r => r.json())
      .then(d => {
        if (d.settings) setSettings(d.settings)
      })
  }, [workspaceId])

  async function save() {
    if (!settings) return
    setSaving(true)
    const res = await fetch(`/api/workspaces/${workspaceId}/widget-settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  if (!settings) return <div className="text-sm text-muted-foreground">Loading…</div>

  return (
    <div className="rounded-lg border p-6 space-y-5">
      <p className="font-medium">Widget appearance</p>

      <div className="space-y-2">
        <Label>Position</Label>
        <div className="grid grid-cols-2 gap-2 max-w-xs">
          {POSITIONS.map(p => (
            <button
              key={p.value}
              onClick={() => setSettings(s => s ? { ...s, position: p.value } : s)}
              className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                settings.position === p.value
                  ? 'border-foreground bg-foreground text-background'
                  : 'hover:bg-muted'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Theme</Label>
        <div className="flex gap-2">
          {(['light', 'dark'] as const).map(t => (
            <button
              key={t}
              onClick={() => setSettings(s => s ? { ...s, theme: t } : s)}
              className={`rounded-md border px-4 py-2 text-sm capitalize transition-colors ${
                settings.theme === t
                  ? 'border-foreground bg-foreground text-background'
                  : 'hover:bg-muted'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="accent">Accent colour</Label>
        <div className="flex items-center gap-3">
          <input
            id="accent"
            type="color"
            value={settings.accent_color}
            onChange={e => setSettings(s => s ? { ...s, accent_color: e.target.value } : s)}
            className="h-9 w-9 cursor-pointer rounded-md border bg-transparent p-0.5"
          />
          <Input
            value={settings.accent_color}
            onChange={e => setSettings(s => s ? { ...s, accent_color: e.target.value } : s)}
            className="max-w-[120px] font-mono text-sm"
            placeholder="#000000"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="label">Button label</Label>
        <Input
          id="label"
          value={settings.button_label}
          onChange={e => setSettings(s => s ? { ...s, button_label: e.target.value } : s)}
          className="max-w-xs"
          maxLength={32}
          placeholder="What's new"
        />
      </div>

      <Button onClick={save} disabled={saving} size="sm">
        {saved ? 'Saved' : saving ? 'Saving…' : 'Save changes'}
      </Button>
    </div>
  )
}
