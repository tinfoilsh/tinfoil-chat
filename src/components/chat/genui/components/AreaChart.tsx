import {
  Area,
  CartesianGrid,
  AreaChart as RechartsAreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

interface AreaChartProps {
  data: Record<string, string | number>[]
  xKey: string
  yKey: string
  title?: string
  color?: string
}

export function AreaChart({
  data,
  xKey,
  yKey,
  title,
  color = '#3b82f6',
}: AreaChartProps) {
  const gradientId = `area-gradient-${yKey}`
  return (
    <div className="my-3">
      {title && (
        <p className="mb-2 text-sm font-medium text-content-primary">{title}</p>
      )}
      <div className="rounded-lg border border-border-subtle p-4">
        <ResponsiveContainer width="100%" height={300}>
          <RechartsAreaChart data={data}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border-subtle, #e5e7eb)"
            />
            <XAxis
              dataKey={xKey}
              tick={{ fontSize: 12 }}
              stroke="currentColor"
            />
            <YAxis tick={{ fontSize: 12 }} stroke="currentColor" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--surface-chat-background))',
                border: '1px solid hsl(var(--border-subtle))',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                color: 'hsl(var(--content-primary))',
              }}
            />
            <Area
              type="monotone"
              dataKey={yKey}
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
            />
          </RechartsAreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function validateAreaChartProps(
  props: Record<string, unknown>,
): boolean {
  return (
    Array.isArray(props.data) &&
    typeof props.xKey === 'string' &&
    typeof props.yKey === 'string'
  )
}
