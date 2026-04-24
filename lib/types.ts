export interface Workspace {
  id: string
  slug: string
  name: string
  plan: string
  publish_count_this_month: number
  publish_quota_reset_at: string
  logo_url?: string | null
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  stripe_price_id?: string | null
  created_at: string
  updated_at: string
}

export interface Entry {
  id: string
  workspace_id: string
  repo_id?: string | null
  pr_number?: number | null
  pr_title?: string | null
  pr_body?: string | null
  pr_url?: string | null
  pr_merged_at?: string | null
  pr_author?: string | null
  ai_draft?: string | null
  title?: string | null
  final_content?: string | null
  status: string
  published_at?: string | null
  created_at: string
  updated_at: string
}
