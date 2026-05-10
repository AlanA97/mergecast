'use client'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// SVG fill attributes do not resolve CSS custom properties — they are not CSS properties,
// they are SVG presentation attributes. We must resolve the actual color value at render
// time via getComputedStyle and pass a concrete color string to Recharts.
// This component is always 'use client', so document is available at render time.
function getPrimaryColor(): string {
  if (typeof document === 'undefined') return '#0f172a' // SSR fallback (should not happen)
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()
  return raw ? `hsl(${raw})` : '#0f172a'
}

interface Props {
  subscriberGrowth: { month: string; new_subscribers: number }[]
  publishingCadence: { month: string; count: number }[]
}

export function AnalyticsCharts({ subscriberGrowth, publishingCadence }: Props) {
  const primaryColor = getPrimaryColor()
  const subsEmpty = subscriberGrowth.every(d => d.new_subscribers === 0)
  const cadenceEmpty = publishingCadence.every(d => d.count === 0)

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">New subscribers</CardTitle>
        </CardHeader>
        <CardContent>
          {subsEmpty ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={subscriberGrowth} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar
                  dataKey="new_subscribers"
                  name="New subscribers"
                  fill={primaryColor}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Entries published</CardTitle>
        </CardHeader>
        <CardContent>
          {cadenceEmpty ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={publishingCadence} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar
                  dataKey="count"
                  name="Entries published"
                  fill={primaryColor}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
