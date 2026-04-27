'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface WorkspaceSummary { id: string; plan: string }
interface BillingPlan { id: string; priceId: string }

const PLAN_DETAILS = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$19/mo',
    features: ['Unlimited publishes', '1,000 subscribers', '1 repo'],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '$49/mo',
    features: ['Unlimited publishes', '10,000 subscribers', '3 repos'],
  },
  {
    id: 'scale',
    name: 'Scale',
    price: '$79/mo',
    features: ['Unlimited publishes', '50,000 subscribers', 'Unlimited repos'],
  },
]

export default function BillingPage() {
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null)
  const [plans, setPlans] = useState<BillingPlan[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/workspaces').then(r => r.json()).then(d => setWorkspace(d.workspaces?.[0]))
    fetch('/api/billing/plans').then(r => r.json()).then(d => setPlans(d.plans ?? []))
  }, [])

  async function startCheckout(priceId: string) {
    if (!workspace) return
    setLoading(true)
    const res = await fetch('/api/billing/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: workspace.id, price_id: priceId }),
    })
    const data = await res.json()
    if (data.url) window.location.assign(data.url)
    setLoading(false)
  }

  async function openPortal() {
    if (!workspace) return
    setLoading(true)
    const res = await fetch('/api/billing/create-portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: workspace.id }),
    })
    const data = await res.json()
    if (data.url) window.location.assign(data.url)
    setLoading(false)
  }

  const currentPlan = workspace?.plan ?? 'free'
  const isOnPaidPlan = currentPlan !== 'free'

  return (
    <div className="p-4 md:p-6 max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Billing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Current plan:{' '}
          <span className="font-medium capitalize">{currentPlan}</span>
        </p>
      </div>

      {isOnPaidPlan && (
        <Button variant="outline" onClick={openPortal} disabled={loading}>
          Manage subscription
        </Button>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {PLAN_DETAILS.map(plan => {
          const apiPlan = plans.find(p => p.id === plan.id)
          const isCurrentPlan = plan.id === currentPlan
          return (
            <div
              key={plan.id}
              className={`rounded-lg border p-5 space-y-4 ${isCurrentPlan ? 'border-foreground' : ''}`}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{plan.name}</h2>
                {isCurrentPlan && <Badge>Current</Badge>}
              </div>
              <p className="text-2xl font-bold">{plan.price}</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {plan.features.map(f => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>
              {!isCurrentPlan && apiPlan?.priceId && (
                <Button
                  className="w-full"
                  variant={isCurrentPlan ? 'outline' : 'default'}
                  onClick={() => startCheckout(apiPlan.priceId)}
                  disabled={loading}
                >
                  Upgrade
                </Button>
              )}
            </div>
          )
        })}
      </div>

      {currentPlan === 'free' && (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground space-y-1">
          <p className="font-medium">Free plan limits</p>
          <p>3 publishes/month · 100 subscribers · 1 repo</p>
        </div>
      )}
    </div>
  )
}
