import { Card } from '@/components/ui/card'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import React, { useMemo } from 'react'
import {
  Area,
  AreaChart as RechartsAreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { coerceArray } from './input-coercion'

type MarketStatus = 'open' | 'closed' | 'pre' | 'post' | 'unknown'

interface StockHistoryPoint {
  time: string
  price: number
}

interface StockTickerProps {
  symbol: string
  name?: string
  exchange?: string
  currency?: string
  price: number | string
  previousClose?: number | string
  change?: number | string
  changePercent?: number | string
  dayHigh?: number | string
  dayLow?: number | string
  openPrice?: number | string
  volume?: number | string
  marketCap?: string
  rangeLabel?: string
  history?: unknown
  marketStatus?: MarketStatus
  asOf?: string
}

const POSITIVE_COLOR = '#16a34a'
const NEGATIVE_COLOR = '#dc2626'
const NEUTRAL_COLOR = '#6b7280'

function toNumber(value: number | string | undefined): number | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const cleaned = value.replace(/[^0-9+\-.eE]/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeHistory(raw: unknown): StockHistoryPoint[] {
  const list = coerceArray<Record<string, unknown>>(raw)
  const points: StockHistoryPoint[] = []
  for (const entry of list) {
    const time =
      typeof entry.time === 'string'
        ? entry.time
        : typeof entry.date === 'string'
          ? entry.date
          : typeof entry.label === 'string'
            ? entry.label
            : ''
    const priceValue =
      entry.price ?? entry.value ?? entry.close ?? entry.y ?? entry.Price
    const price = toNumber(priceValue as number | string | undefined)
    if (time && price !== null) {
      points.push({ time, price })
    }
  }
  return points
}

function formatCurrency(value: number | null, currency?: string): string {
  if (value === null) return '—'
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return value.toFixed(2)
  }
}

function formatSignedNumber(value: number | null): string {
  if (value === null) return '—'
  const sign = value > 0 ? '+' : value < 0 ? '' : ''
  return `${sign}${value.toFixed(2)}`
}

function formatSignedPercent(value: number | null): string {
  if (value === null) return '—'
  const sign = value > 0 ? '+' : value < 0 ? '' : ''
  return `${sign}${value.toFixed(2)}%`
}

function formatNumberShort(value: number | null): string {
  if (value === null) return '—'
  const abs = Math.abs(value)
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${(value / 1e3).toFixed(2)}K`
  return value.toString()
}

function marketStatusLabel(status: MarketStatus | undefined): {
  label: string
  dotColor: string
} | null {
  switch (status) {
    case 'open':
      return { label: 'Market open', dotColor: '#16a34a' }
    case 'closed':
      return { label: 'Market closed', dotColor: '#6b7280' }
    case 'pre':
      return { label: 'Pre-market', dotColor: '#f59e0b' }
    case 'post':
      return { label: 'After hours', dotColor: '#f59e0b' }
    default:
      return null
  }
}

export function StockTicker({
  symbol,
  name,
  exchange,
  currency,
  price,
  previousClose,
  change,
  changePercent,
  dayHigh,
  dayLow,
  openPrice,
  volume,
  marketCap,
  rangeLabel,
  history,
  marketStatus,
  asOf,
}: StockTickerProps): React.JSX.Element {
  const priceNum = toNumber(price)
  const previousCloseNum = toNumber(previousClose)
  const explicitChange = toNumber(change)
  const explicitChangePercent = toNumber(changePercent)

  const derivedChange =
    explicitChange ??
    (priceNum !== null && previousCloseNum !== null
      ? priceNum - previousCloseNum
      : null)

  const derivedChangePercent =
    explicitChangePercent ??
    (derivedChange !== null &&
    previousCloseNum !== null &&
    previousCloseNum !== 0
      ? (derivedChange / previousCloseNum) * 100
      : null)

  const direction: 'up' | 'down' | 'flat' =
    derivedChange === null || derivedChange === 0
      ? 'flat'
      : derivedChange > 0
        ? 'up'
        : 'down'

  const accentColor =
    direction === 'up'
      ? POSITIVE_COLOR
      : direction === 'down'
        ? NEGATIVE_COLOR
        : NEUTRAL_COLOR

  const DirectionIcon =
    direction === 'up'
      ? ArrowUpRight
      : direction === 'down'
        ? ArrowDownRight
        : Minus

  const historyPoints = useMemo(() => normalizeHistory(history), [history])
  const gradientId = `stock-gradient-${symbol.replace(/[^A-Za-z0-9]/g, '')}`

  const stats: Array<{ label: string; value: string }> = []
  const openNum = toNumber(openPrice)
  const highNum = toNumber(dayHigh)
  const lowNum = toNumber(dayLow)
  const volumeNum = toNumber(volume)

  if (openNum !== null)
    stats.push({ label: 'Open', value: formatCurrency(openNum, currency) })
  if (previousCloseNum !== null)
    stats.push({
      label: 'Prev close',
      value: formatCurrency(previousCloseNum, currency),
    })
  if (highNum !== null)
    stats.push({ label: 'Day high', value: formatCurrency(highNum, currency) })
  if (lowNum !== null)
    stats.push({ label: 'Day low', value: formatCurrency(lowNum, currency) })
  if (volumeNum !== null)
    stats.push({ label: 'Volume', value: formatNumberShort(volumeNum) })
  if (marketCap) stats.push({ label: 'Market cap', value: marketCap })

  const status = marketStatusLabel(marketStatus)

  return (
    <Card className="my-3 max-w-2xl">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold tracking-wide text-content-primary">
                {symbol.toUpperCase()}
              </span>
              {exchange && (
                <span className="rounded-md border border-border-subtle px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-content-muted">
                  {exchange}
                </span>
              )}
            </div>
            {name && <p className="text-sm text-content-muted">{name}</p>}
          </div>
          {status && (
            <div className="flex items-center gap-2 text-xs text-content-muted">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: status.dotColor }}
              />
              <span>{status.label}</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-mono text-3xl font-semibold tabular-nums text-content-primary">
            {formatCurrency(priceNum, currency)}
          </span>
          <span
            className="flex items-center gap-1 text-sm font-medium tabular-nums"
            style={{ color: accentColor }}
          >
            <DirectionIcon className="h-4 w-4" />
            {formatSignedNumber(derivedChange)}
            <span>({formatSignedPercent(derivedChangePercent)})</span>
          </span>
          {asOf && (
            <span className="text-xs text-content-muted">As of {asOf}</span>
          )}
        </div>

        {historyPoints.length > 1 && (
          <div className="flex flex-col gap-1">
            {rangeLabel && (
              <p className="text-xs font-medium text-content-muted">
                {rangeLabel}
              </p>
            )}
            <div className="h-32 rounded-lg border border-border-subtle bg-transparent p-2">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsAreaChart
                  data={historyPoints}
                  margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor={accentColor}
                        stopOpacity={0.35}
                      />
                      <stop
                        offset="100%"
                        stopColor={accentColor}
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
                        ? [formatCurrency(value, currency), 'Price']
                        : [String(value), 'Price']
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="price"
                    stroke={accentColor}
                    strokeWidth={2}
                    fill={`url(#${gradientId})`}
                  />
                </RechartsAreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {stats.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-border-subtle bg-surface-chat-background px-3 py-2"
              >
                <p className="text-[11px] uppercase tracking-wide text-content-muted">
                  {stat.label}
                </p>
                <p className="mt-1 font-mono text-sm font-medium tabular-nums text-content-primary">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

export function validateStockTickerProps(
  props: Record<string, unknown>,
): boolean {
  if (typeof props.symbol !== 'string' || props.symbol.length === 0) {
    return false
  }
  const priceIsNumberOrString =
    typeof props.price === 'number' || typeof props.price === 'string'
  if (!priceIsNumberOrString) return false
  return true
}
