import { Card } from '@/components/ui/card'
import React, { useMemo } from 'react'
import { coerceArray } from './input-coercion'

interface GaugeZone {
  from: number
  to: number
  color: string
  label?: string
}

interface GaugeProps {
  label: string
  value: number | string
  min?: number | string
  max?: number | string
  unit?: string
  description?: string
  valueLabel?: string
  zones?: unknown
  color?: string
  size?: 'small' | 'default'
}

const GAUGE_VIEWBOX = 220
const GAUGE_RADIUS = 90
const GAUGE_STROKE = 18
const GAUGE_CENTER = GAUGE_VIEWBOX / 2
const GAUGE_BASELINE = GAUGE_CENTER + 20

function toNumber(value: number | string | undefined): number | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const cleaned = value.replace(/[^0-9+\-.eE]/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeZones(raw: unknown): GaugeZone[] {
  const list = coerceArray<Record<string, unknown>>(raw)
  const zones: GaugeZone[] = []
  for (const entry of list) {
    const from = toNumber(entry.from as number | string | undefined)
    const to = toNumber(entry.to as number | string | undefined)
    const color =
      typeof entry.color === 'string' && entry.color.length > 0
        ? entry.color
        : null
    if (from === null || to === null || !color) continue
    zones.push({
      from,
      to,
      color,
      label: typeof entry.label === 'string' ? entry.label : undefined,
    })
  }
  return zones
}

function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number,
): { x: number; y: number } {
  const angleRad = (angleDeg * Math.PI) / 180
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  }
}

function arcPath(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(cx, cy, radius, startAngle)
  const end = polarToCartesian(cx, cy, radius, endAngle)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  const sweep = 1
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`
}

function valueToAngle(value: number, min: number, max: number): number {
  if (max === min) return 180
  const clamped = Math.max(min, Math.min(max, value))
  const ratio = (clamped - min) / (max - min)
  return 180 + ratio * 180
}

export function Gauge({
  label,
  value,
  min = 0,
  max = 100,
  unit,
  description,
  valueLabel,
  zones,
  color = '#3b82f6',
  size = 'default',
}: GaugeProps): React.JSX.Element {
  const valueNum = toNumber(value)
  const minNum = toNumber(min) ?? 0
  const maxNum = toNumber(max) ?? 100
  const normalizedZones = useMemo(() => normalizeZones(zones), [zones])

  if (valueNum === null) {
    return (
      <Card className="my-3 max-w-sm">
        <div className="p-5 text-sm text-content-muted">
          Invalid gauge value.
        </div>
      </Card>
    )
  }

  const endAngle = valueToAngle(valueNum, minNum, maxNum)
  const dimension = size === 'small' ? 160 : 220
  const displayValue = Number.isInteger(valueNum)
    ? valueNum.toString()
    : valueNum.toFixed(2)

  return (
    <Card className="my-3 max-w-sm">
      <div className="flex flex-col items-center gap-2 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-content-muted">
          {label}
        </p>

        <div
          className="relative"
          style={{ width: dimension, height: dimension / 1.6 }}
        >
          <svg
            viewBox={`0 0 ${GAUGE_VIEWBOX} ${GAUGE_VIEWBOX / 1.6}`}
            width="100%"
            height="100%"
            role="img"
            aria-label={`${label}: ${displayValue}${unit ? ` ${unit}` : ''}`}
          >
            <path
              d={arcPath(GAUGE_CENTER, GAUGE_BASELINE, GAUGE_RADIUS, 180, 360)}
              fill="none"
              stroke="hsl(var(--border-subtle))"
              strokeWidth={GAUGE_STROKE}
              strokeLinecap="round"
            />

            {normalizedZones.map((zone, i) => {
              const zoneStartAngle = valueToAngle(zone.from, minNum, maxNum)
              const zoneEndAngle = valueToAngle(zone.to, minNum, maxNum)
              if (zoneEndAngle <= zoneStartAngle) return null
              return (
                <path
                  key={`zone-${i}`}
                  d={arcPath(
                    GAUGE_CENTER,
                    GAUGE_BASELINE,
                    GAUGE_RADIUS,
                    zoneStartAngle,
                    zoneEndAngle,
                  )}
                  fill="none"
                  stroke={zone.color}
                  strokeWidth={GAUGE_STROKE}
                  strokeOpacity="0.3"
                  strokeLinecap="butt"
                />
              )
            })}

            <path
              d={arcPath(
                GAUGE_CENTER,
                GAUGE_BASELINE,
                GAUGE_RADIUS,
                180,
                endAngle,
              )}
              fill="none"
              stroke={color}
              strokeWidth={GAUGE_STROKE}
              strokeLinecap="round"
            />

            {(() => {
              const tip = polarToCartesian(
                GAUGE_CENTER,
                GAUGE_BASELINE,
                GAUGE_RADIUS,
                endAngle,
              )
              return (
                <circle
                  cx={tip.x}
                  cy={tip.y}
                  r={GAUGE_STROKE / 2 + 2}
                  fill="hsl(var(--surface-chat-background))"
                  stroke={color}
                  strokeWidth={2}
                />
              )
            })()}
          </svg>

          <div
            className="absolute inset-x-0 bottom-1 flex flex-col items-center"
            aria-hidden="true"
          >
            <span className="font-mono text-3xl font-semibold tabular-nums text-content-primary">
              {displayValue}
            </span>
            {(unit || valueLabel) && (
              <span className="text-xs text-content-muted">
                {valueLabel ?? unit}
              </span>
            )}
          </div>
        </div>

        <div className="flex w-full justify-between px-2 text-[11px] text-content-muted">
          <span>{Number.isInteger(minNum) ? minNum : minNum.toFixed(2)}</span>
          <span>{Number.isInteger(maxNum) ? maxNum : maxNum.toFixed(2)}</span>
        </div>

        {description && (
          <p className="mt-1 text-center text-xs text-content-muted">
            {description}
          </p>
        )}

        {normalizedZones.length > 0 && (
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            {normalizedZones.map((zone, i) => (
              <span
                key={`zone-label-${i}`}
                className="flex items-center gap-1 text-[11px] text-content-muted"
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: zone.color }}
                />
                {zone.label ?? `${zone.from}–${zone.to}`}
              </span>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

export function validateGaugeProps(props: Record<string, unknown>): boolean {
  if (typeof props.label !== 'string' || props.label.length === 0) {
    return false
  }
  if (typeof props.value !== 'number' && typeof props.value !== 'string') {
    return false
  }
  return toNumber(props.value as number | string) !== null
}
