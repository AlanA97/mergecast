import { Card, CardHeader } from '@/components/ui/card'

export default function AnalyticsLoading() {
  return (
    <div className="p-4 md:p-6 max-w-5xl space-y-6">
      <div className="h-7 w-24 rounded bg-muted animate-pulse" />

      {/* KPI skeletons */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2 space-y-2">
              <div className="h-3 w-24 rounded bg-muted animate-pulse" />
              <div className="h-8 w-16 rounded bg-muted animate-pulse" />
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Chart skeletons */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-4 w-32 rounded bg-muted animate-pulse" />
            </CardHeader>
            <div className="px-6 pb-6">
              <div className="h-44 w-full rounded bg-muted animate-pulse" />
            </div>
          </Card>
        ))}
      </div>

      {/* Table skeletons */}
      {Array.from({ length: 2 }).map((_, i) => (
        <section key={i} className="space-y-3">
          <div className="h-3 w-36 rounded bg-muted animate-pulse" />
          <div className="rounded-lg border overflow-hidden">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className={`flex gap-4 px-4 py-3 ${j < 3 ? 'border-b' : ''}`}>
                <div className="h-4 w-48 rounded bg-muted animate-pulse" />
                <div className="h-4 w-20 rounded bg-muted animate-pulse" />
                <div className="ml-auto h-4 w-10 rounded bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
