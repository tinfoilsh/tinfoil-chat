import {
  Cell,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

const DEFAULT_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#f97316',
]

interface PieChartProps {
  data: Record<string, string | number>[]
  nameKey: string
  valueKey: string
  title?: string
}

export function PieChart({ data, nameKey, valueKey, title }: PieChartProps) {
  return (
    <div className="my-3">
      {title && (
        <p className="mb-2 text-sm font-medium text-content-primary">{title}</p>
      )}
      <div className="rounded-lg border border-border-subtle p-4">
        <ResponsiveContainer width="100%" height={300}>
          <RechartsPieChart>
            <Pie
              data={data}
              dataKey={valueKey}
              nameKey={nameKey}
              cx="50%"
              cy="50%"
              outerRadius={100}
              label={({ name, percent }: { name?: string; percent?: number }) =>
                `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`
              }
              labelLine={true}
            >
              {data.map((_, index) => (
                <Cell
                  key={index}
                  fill={DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--surface-chat-background))',
                border: '1px solid hsl(var(--border-subtle))',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                color: 'hsl(var(--content-primary))',
              }}
            />
          </RechartsPieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function validatePieChartProps(props: Record<string, unknown>): boolean {
  return (
    Array.isArray(props.data) &&
    typeof props.nameKey === 'string' &&
    typeof props.valueKey === 'string'
  )
}
