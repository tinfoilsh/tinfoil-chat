import { Card } from '@/components/ui/card'
import { ArrowRight } from 'lucide-react'
import React, { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart as RechartsAreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { coerceArray } from './input-coercion'

interface RateHistoryPoint {
  time: string
  rate: number
}

interface CurrencyConverterProps {
  amount: number | string
  fromCurrency: string
  toCurrency: string
  rate: number | string
  convertedAmount?: number | string
  asOf?: string
  source?: string
  rangeLabel?: string
  history?: unknown
}

function toNumber(value: number | string | undefined): number | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const cleaned = value.replace(/[^0-9+\-.eE]/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeHistory(raw: unknown): RateHistoryPoint[] {
  const list = coerceArray<Record<string, unknown>>(raw)
  const points: RateHistoryPoint[] = []
  for (const entry of list) {
    const time =
      typeof entry.time === 'string'
        ? entry.time
        : typeof entry.date === 'string'
          ? entry.date
          : typeof entry.label === 'string'
            ? entry.label
            : ''
    const rateValue = entry.rate ?? entry.value ?? entry.y ?? entry.price
    const rate = toNumber(rateValue as number | string | undefined)
    if (time && rate !== null) {
      points.push({ time, rate })
    }
  }
  return points
}

function formatCurrency(
  value: number | null,
  currency: string,
  options?: Intl.NumberFormatOptions,
): string {
  if (value === null) return '—'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
      ...options,
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}

function formatRate(value: number | null): string {
  if (value === null) return '—'
  if (Math.abs(value) >= 100) return value.toFixed(2)
  if (Math.abs(value) >= 1) return value.toFixed(4)
  return value.toFixed(6)
}

export function CurrencyConverter({
  amount,
  fromCurrency,
  toCurrency,
  rate,
  convertedAmount,
  asOf,
  source,
  rangeLabel,
  history,
}: CurrencyConverterProps): React.JSX.Element {
  const rateNum = toNumber(rate)
  const initialAmountNum = toNumber(amount) ?? 1

  const [editableAmount, setEditableAmount] = useState<number>(initialAmountNum)

  useEffect(() => {
    setEditableAmount(initialAmountNum)
  }, [initialAmountNum])

  const explicitConverted = toNumber(convertedAmount)
  const derivedConverted =
    explicitConverted !== null && editableAmount === initialAmountNum
      ? explicitConverted
      : rateNum !== null
        ? editableAmount * rateNum
        : null

  const historyPoints = useMemo(() => normalizeHistory(history), [history])
  const from = fromCurrency.toUpperCase()
  const to = toCurrency.toUpperCase()
  const gradientId = `fx-gradient-${from}-${to}`

  const trend =
    historyPoints.length > 1
      ? historyPoints[historyPoints.length - 1].rate - historyPoints[0].rate
      : 0
  const trendColor = trend > 0 ? '#16a34a' : trend < 0 ? '#dc2626' : '#6b7280'

  return (
    <Card className="my-3 max-w-xl">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-border-subtle px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-content-primary">
              {from}
            </span>
            <ArrowRight className="h-4 w-4 text-content-muted" />
            <span className="rounded-md border border-border-subtle px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-content-primary">
              {to}
            </span>
          </div>
          {asOf && (
            <span className="text-xs text-content-muted">As of {asOf}</span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-content-muted">
              Amount ({from})
            </span>
            <input
              type="number"
              inputMode="decimal"
              value={Number.isFinite(editableAmount) ? editableAmount : ''}
              onChange={(e) => {
                const next = Number(e.target.value)
                setEditableAmount(Number.isFinite(next) ? next : 0)
              }}
              className="w-full rounded-lg border border-border-subtle bg-surface-chat-background px-3 py-2 font-mono text-xl font-semibold tabular-nums text-content-primary focus:border-content-primary focus:outline-none"
            />
          </label>

          <ArrowRight className="hidden h-5 w-5 text-content-muted sm:block" />

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-content-muted">
              Converted ({to})
            </span>
            <div className="rounded-lg border border-border-subtle bg-surface-chat-background px-3 py-2 font-mono text-xl font-semibold tabular-nums text-content-primary">
              {formatCurrency(derivedConverted, to)}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-content-muted">
          <span>
            1 {from} ={' '}
            <span className="font-mono font-medium text-content-primary">
              {formatRate(rateNum)}
            </span>{' '}
            {to}
          </span>
          {source && <span>Source: {source}</span>}
        </div>

        {historyPoints.length > 1 && (
          <div className="flex flex-col gap-1">
            {rangeLabel && (
              <p className="text-[11px] font-semibold uppercase tracking-wide text-content-muted">
                {rangeLabel}
              </p>
            )}
            <div className="h-24 rounded-lg border border-border-subtle bg-transparent p-2">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsAreaChart
                  data={historyPoints}
                  margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor={trendColor}
                        stopOpacity={0.35}
                      />
                      <stop
                        offset="100%"
                        stopColor={trendColor}
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" hide />
                  <YAxis hide domain={['dataMin', 'dataMax']} />
                  <Tooltip
                    cursor={{
                      stroke: 'hsl(var(--content-primary) / 0.2)',
                      strokeWidth: 1,
                    }}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--surface-chat-background))',
                      border: '1px solid hsl(var(--border-subtle))',
                      borderRadius: '0.5rem',
                      fontSize: '0.75rem',
                      color: 'hsl(var(--content-primary))',
                    }}
                    formatter={(value) =>
                      typeof value === 'number'
                        ? [formatRate(value), 'Rate']
                        : [String(value), 'Rate']
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="rate"
                    stroke={trendColor}
                    strokeWidth={2}
                    fill={`url(#${gradientId})`}
                  />
                </RechartsAreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

export function validateCurrencyConverterProps(
  props: Record<string, unknown>,
): boolean {
  if (
    typeof props.fromCurrency !== 'string' ||
    props.fromCurrency.length === 0
  ) {
    return false
  }
  if (typeof props.toCurrency !== 'string' || props.toCurrency.length === 0) {
    return false
  }
  if (typeof props.amount !== 'number' && typeof props.amount !== 'string') {
    return false
  }
  if (typeof props.rate !== 'number' && typeof props.rate !== 'string') {
    return false
  }
  return true
}
