import {
  Area,
  CartesianGrid,
  AreaChart as RechartsAreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { coerceArray, isNonEmptyArray, type ChartRow } from './input-coercion'

interface AreaChartProps {
  data: unknown
  xKey?: string
  yKey?: string
  title?: string
  color?: string
}

function inferChartKeys(
  data: Record<string, string | number>[],
  preferredX?: string,
  preferredY?: string,
): { xKey: string; yKey: string } {
  const first = data[0] ?? {}
  const keys = Object.keys(first)
  let xKey = preferredX && preferredX in first ? preferredX : undefined
  let yKey = preferredY && preferredY in first ? preferredY : undefined
  if (!xKey) xKey = keys.find((k) => typeof first[k] === 'string') ?? keys[0]
  if (!yKey) yKey = keys.find((k) => k !== xKey && typeof first[k] === 'number')
  if (!yKey) yKey = keys.find((k) => k !== xKey) ?? keys[0]
  return { xKey: xKey || 'label', yKey: yKey || 'value' }
}

export function AreaChart({
  data,
  xKey: xKeyProp,
  yKey: yKeyProp,
  title,
  color = '#3b82f6',
}: AreaChartProps) {
  const rows = coerceArray<ChartRow>(data)
  const { xKey, yKey } = inferChartKeys(rows, xKeyProp, yKeyProp)
  const gradientId = `area-gradient-${yKey}`
  return (
    <div className="my-3">
      {title && (
        <p className="mb-2 text-sm font-medium text-content-primary">{title}</p>
      )}
      <div className="rounded-lg border border-border-subtle p-4">
        <ResponsiveContainer width="100%" height={300}>
          <RechartsAreaChart data={rows}>
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
              cursor={{
                stroke: 'hsl(var(--content-primary) / 0.2)',
                strokeWidth: 1,
              }}
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
  return isNonEmptyArray(props.data)
}
