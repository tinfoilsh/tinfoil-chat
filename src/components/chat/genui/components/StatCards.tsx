import { Card, CardContent } from '@/components/ui/card'
import { TrendingDown, TrendingUp } from 'lucide-react'

interface Stat {
  label: string
  value: string | number
  trend?: 'up' | 'down'
}

interface StatCardsProps {
  stats: Stat[]
}

export function StatCards({ stats }: StatCardsProps) {
  return (
    <div className="my-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {stats.map((stat, index) => (
        <Card key={index}>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-content-muted">
              {stat.label}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xl font-semibold text-content-primary">
                {stat.value}
              </span>
              {stat.trend === 'up' && (
                <TrendingUp className="h-4 w-4 text-green-500" />
              )}
              {stat.trend === 'down' && (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function validateStatCardsProps(
  props: Record<string, unknown>,
): boolean {
  return (
    Array.isArray(props.stats) &&
    props.stats.every(
      (s: unknown) =>
        s !== null &&
        typeof s === 'object' &&
        typeof (s as any).label === 'string' &&
        (typeof (s as any).value === 'string' ||
          typeof (s as any).value === 'number'),
    )
  )
}
