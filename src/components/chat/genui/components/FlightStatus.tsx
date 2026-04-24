import { Card } from '@/components/ui/card'
import { Plane } from 'lucide-react'
import React from 'react'

type FlightStatus =
  | 'scheduled'
  | 'boarding'
  | 'departed'
  | 'in_air'
  | 'landed'
  | 'arrived'
  | 'delayed'
  | 'cancelled'
  | 'diverted'

interface FlightStatusProps {
  airline: string
  flightNumber: string
  airlineIataCode?: string
  origin: {
    code: string
    name?: string
    city?: string
    terminal?: string
    gate?: string
    scheduledTime?: string
    actualTime?: string
  }
  destination: {
    code: string
    name?: string
    city?: string
    terminal?: string
    gate?: string
    scheduledTime?: string
    actualTime?: string
  }
  status?: FlightStatus
  statusLabel?: string
  duration?: string
  seat?: string
  confirmationCode?: string
  aircraft?: string
  note?: string
}

const STATUS_COLORS: Record<FlightStatus, string> = {
  scheduled: '#6b7280',
  boarding: '#2563eb',
  departed: '#2563eb',
  in_air: '#2563eb',
  landed: '#16a34a',
  arrived: '#16a34a',
  delayed: '#f59e0b',
  cancelled: '#dc2626',
  diverted: '#dc2626',
}

const STATUS_DEFAULT_LABEL: Record<FlightStatus, string> = {
  scheduled: 'Scheduled',
  boarding: 'Boarding',
  departed: 'Departed',
  in_air: 'In flight',
  landed: 'Landed',
  arrived: 'Arrived',
  delayed: 'Delayed',
  cancelled: 'Cancelled',
  diverted: 'Diverted',
}

function AirportBlock({
  code,
  city,
  name,
  terminal,
  gate,
  scheduledTime,
  actualTime,
  align,
}: {
  code: string
  city?: string
  name?: string
  terminal?: string
  gate?: string
  scheduledTime?: string
  actualTime?: string
  align: 'left' | 'right'
}): React.JSX.Element {
  const alignmentClass =
    align === 'left' ? 'items-start text-left' : 'items-end text-right'
  const showRescheduled = actualTime && actualTime !== scheduledTime

  const detailPairs: Array<{ label: string; value: string }> = []
  if (terminal) detailPairs.push({ label: 'Terminal', value: terminal })
  if (gate) detailPairs.push({ label: 'Gate', value: gate })

  return (
    <div className={`flex min-w-0 flex-1 flex-col gap-1 ${alignmentClass}`}>
      <span className="text-3xl font-semibold tracking-wide text-content-primary">
        {code.toUpperCase()}
      </span>
      {(city || name) && (
        <span className="max-w-full truncate text-xs text-content-muted">
          {city || name}
        </span>
      )}
      {scheduledTime && (
        <div className="mt-2 flex flex-col gap-0.5">
          <span className="font-mono text-lg font-semibold tabular-nums text-content-primary">
            {showRescheduled ? actualTime : scheduledTime}
          </span>
          {showRescheduled && (
            <span className="font-mono text-xs tabular-nums text-content-muted line-through">
              {scheduledTime}
            </span>
          )}
        </div>
      )}
      {detailPairs.length > 0 && (
        <div
          className={`mt-1 flex flex-wrap gap-x-3 gap-y-0.5 ${align === 'right' ? 'justify-end' : 'justify-start'}`}
        >
          {detailPairs.map((d) => (
            <span key={d.label} className="text-[11px] text-content-muted">
              <span className="uppercase tracking-wide">{d.label}</span>{' '}
              <span className="font-medium text-content-primary">
                {d.value}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function FlightStatusCard({
  airline,
  flightNumber,
  airlineIataCode,
  origin,
  destination,
  status,
  statusLabel,
  duration,
  seat,
  confirmationCode,
  aircraft,
  note,
}: FlightStatusProps): React.JSX.Element {
  const normalizedStatus: FlightStatus = status ?? 'scheduled'
  const accentColor = STATUS_COLORS[normalizedStatus]
  const displayStatusLabel =
    statusLabel ?? STATUS_DEFAULT_LABEL[normalizedStatus]

  const flightLabel = airlineIataCode
    ? `${airlineIataCode.toUpperCase()} ${flightNumber}`
    : flightNumber

  const metaRows: Array<{ label: string; value: string }> = []
  if (seat) metaRows.push({ label: 'Seat', value: seat })
  if (confirmationCode)
    metaRows.push({ label: 'Confirmation', value: confirmationCode })
  if (aircraft) metaRows.push({ label: 'Aircraft', value: aircraft })

  return (
    <Card className="my-3 max-w-2xl overflow-hidden">
      <div className="flex flex-col">
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
          style={{ backgroundColor: `${accentColor}15` }}
        >
          <div className="flex min-w-0 flex-col">
            <span className="text-xs font-semibold uppercase tracking-wide text-content-muted">
              {airline}
            </span>
            <span className="text-base font-semibold text-content-primary">
              {flightLabel}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: accentColor }}
            />
            <span
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: accentColor }}
            >
              {displayStatusLabel}
            </span>
          </div>
        </div>

        <div className="flex items-stretch gap-3 px-5 py-5">
          <AirportBlock
            code={origin.code}
            city={origin.city}
            name={origin.name}
            terminal={origin.terminal}
            gate={origin.gate}
            scheduledTime={origin.scheduledTime}
            actualTime={origin.actualTime}
            align="left"
          />

          <div className="flex min-w-[72px] flex-col items-center justify-center gap-2">
            <div className="relative flex w-full items-center">
              <span
                className="h-px flex-1"
                style={{ backgroundColor: accentColor, opacity: 0.4 }}
              />
              <Plane
                className="mx-1 h-4 w-4 rotate-90"
                style={{ color: accentColor }}
              />
              <span
                className="h-px flex-1"
                style={{ backgroundColor: accentColor, opacity: 0.4 }}
              />
            </div>
            {duration && (
              <span className="text-[11px] text-content-muted">{duration}</span>
            )}
          </div>

          <AirportBlock
            code={destination.code}
            city={destination.city}
            name={destination.name}
            terminal={destination.terminal}
            gate={destination.gate}
            scheduledTime={destination.scheduledTime}
            actualTime={destination.actualTime}
            align="right"
          />
        </div>

        {(metaRows.length > 0 || note) && (
          <div className="border-t border-border-subtle bg-surface-chat-background px-5 py-3">
            {metaRows.length > 0 && (
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {metaRows.map((row) => (
                  <div key={row.label} className="flex flex-col">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-content-muted">
                      {row.label}
                    </span>
                    <span className="font-mono text-sm tabular-nums text-content-primary">
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {note && <p className="mt-2 text-xs text-content-muted">{note}</p>}
          </div>
        )}
      </div>
    </Card>
  )
}

export function validateFlightStatusProps(
  props: Record<string, unknown>,
): boolean {
  if (typeof props.airline !== 'string' || props.airline.length === 0) {
    return false
  }
  if (
    typeof props.flightNumber !== 'string' ||
    props.flightNumber.length === 0
  ) {
    return false
  }
  const origin = props.origin
  const destination = props.destination
  if (!origin || typeof origin !== 'object') return false
  if (!destination || typeof destination !== 'object') return false
  const o = origin as Record<string, unknown>
  const d = destination as Record<string, unknown>
  if (typeof o.code !== 'string' || o.code.length === 0) return false
  if (typeof d.code !== 'string' || d.code.length === 0) return false
  return true
}
