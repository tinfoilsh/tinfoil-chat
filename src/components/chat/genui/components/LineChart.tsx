import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { coerceArray, isNonEmptyArray, type ChartRow } from './input-coercion'

interface LineChartProps {
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

export function LineChart({
  data,
  xKey: xKeyProp,
  yKey: yKeyProp,
  title,
  color = '#3b82f6',
}: LineChartProps) {
  const rows = coerceArray<ChartRow>(data)
  const { xKey, yKey } = inferChartKeys(rows, xKeyProp, yKeyProp)
  return (
    <div className="my-3">
      {title && (
        <p className="mb-2 text-sm font-medium text-content-primary">{title}</p>
      )}
      <div className="rounded-lg border border-border-subtle p-4">
        <ResponsiveContainer width="100%" height={300}>
          <RechartsLineChart data={rows}>
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
            <Line
              type="monotone"
              dataKey={yKey}
              stroke={color}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          </RechartsLineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function validateLineChartProps(
  props: Record<string, unknown>,
): boolean {
  return isNonEmptyArray(props.data)
}
