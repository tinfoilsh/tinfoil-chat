import {
  Bar,
  CartesianGrid,
  BarChart as RechartsBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

interface BarChartProps {
  data: Record<string, string | number>[]
  xKey: string
  yKey: string
  title?: string
  color?: string
}

export function BarChart({
  data,
  xKey,
  yKey,
  title,
  color = '#3b82f6',
}: BarChartProps) {
  return (
    <div className="my-3">
      {title && (
        <p className="mb-2 text-sm font-medium text-content-primary">{title}</p>
      )}
      <div className="rounded-lg border border-border-subtle p-4">
        <ResponsiveContainer width="100%" height={300}>
          <RechartsBarChart data={data}>
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
                backgroundColor: 'var(--color-surface-primary, #fff)',
                border: '1px solid var(--color-border-subtle, #e5e7eb)',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
              }}
            />
            <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]} />
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function validateBarChartProps(props: Record<string, unknown>): boolean {
  return (
    Array.isArray(props.data) &&
    typeof props.xKey === 'string' &&
    typeof props.yKey === 'string'
  )
}
