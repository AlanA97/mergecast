import { format } from 'date-fns'
import ReactMarkdown from 'react-markdown'

interface EntryProps {
  entry: {
    id: string
    title: string | null
    final_content: string | null
    published_at: string | null
    view_count: number
  }
}

export function ChangelogEntry({ entry }: EntryProps) {
  return (
    <article className="border-b pb-8 last:border-0">
      <time className="text-xs text-muted-foreground">
        {entry.published_at ? format(new Date(entry.published_at), 'MMMM d, yyyy') : ''}
      </time>
      <h2 className="text-lg font-semibold mt-1 mb-3">{entry.title ?? 'Update'}</h2>
      <div className="prose prose-sm max-w-none text-muted-foreground">
        <ReactMarkdown>{entry.final_content ?? ''}</ReactMarkdown>
      </div>
    </article>
  )
}
