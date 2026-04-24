import { PLAN_LIMITS, type Plan } from '@/lib/plans'
import { createSupabaseServiceClient } from '@/lib/supabase/server'

interface WorkspaceQuotaFields {
  plan: Plan
  publish_count_this_month: number
  publish_quota_reset_at: string
}

interface QuotaResult {
  allowed: boolean
  reason?: 'QUOTA_EXCEEDED'
}

export async function checkPublishQuota(
  workspace: WorkspaceQuotaFields,
  workspaceId?: string
): Promise<QuotaResult> {
  const limit = PLAN_LIMITS[workspace.plan as Plan].publishes_per_month

  // Lazy reset: if reset_at is in the past, reset the counter
  if (new Date(workspace.publish_quota_reset_at) < new Date()) {
    if (workspaceId) {
      const supabase = createSupabaseServiceClient()
      const nextReset = new Date()
      nextReset.setMonth(nextReset.getMonth() + 1, 1)
      nextReset.setHours(0, 0, 0, 0)
      await supabase
        .from('workspaces')
        .update({
          publish_count_this_month: 0,
          publish_quota_reset_at: nextReset.toISOString(),
        })
        .eq('id', workspaceId)
    }
    return { allowed: true }
  }

  if (workspace.publish_count_this_month >= limit) {
    return { allowed: false, reason: 'QUOTA_EXCEEDED' }
  }

  return { allowed: true }
}
