import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Eye } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  draft: 'secondary',
  published: 'default',
  archived: 'outline',
  ignored: 'outline',
}

interface EntryCardProps {
  entry: {
    id: string
    title: string | null
    pr_title: string | null
    pr_number: number | null
    status: string
    created_at: string
    published_at: string | null
    view_count: number
  }
}

export function EntryCard({ entry }: EntryCardProps) {
  const displayTitle = entry.title || entry.pr_title || 'Untitled update'
  const date = entry.published_at ?? entry.created_at

  return (
    <Link href={`/dashboard/entries/${entry.id}`}>
      <div className="flex items-center justify-between rounded-lg border bg-background p-4 hover:bg-muted/50 transition-colors cursor-pointer">
        <div className="space-y-1 min-w-0">
          <p className="font-medium text-sm truncate">{displayTitle}</p>
          <p className="text-xs text-muted-foreground">
            {entry.pr_number ? `PR #${entry.pr_number} · ` : ''}
            {formatDistanceToNow(new Date(date), { addSuffix: true })}
          </p>
        </div>
        <div className="flex items-center gap-3 ml-4 shrink-0">
          {entry.status === 'published' && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Eye className="h-3 w-3" />
              {entry.view_count}
            </span>
          )}
          <Badge variant={STATUS_VARIANT[entry.status] ?? 'secondary'}>
            {entry.status}
          </Badge>
        </div>
      </div>
    </Link>
  )
}
