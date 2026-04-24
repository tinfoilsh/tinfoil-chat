import { Card } from '@/components/ui/card'
import React, { useEffect, useMemo, useRef, useState } from 'react'

type ClockStyle = 'analog' | 'digital' | 'both'

interface ClockWidgetProps {
  timezone?: string
  label?: string
  style?: ClockStyle
  showSeconds?: boolean
  hour12?: boolean
  isDarkMode?: boolean
}

const CLOCK_TICK_INTERVAL_MS = 1000
const CLOCK_FACE_SIZE_PX = 176
const CLOCK_FACE_CENTER = CLOCK_FACE_SIZE_PX / 2
const CLOCK_FACE_RADIUS = CLOCK_FACE_CENTER - 4

function formatZonedParts(
  date: Date,
  timezone: string | undefined,
  hour12: boolean,
): {
  hours: number
  minutes: number
  seconds: number
  dateLabel: string
  tzLabel: string
} {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZoneName: 'short',
    }).formatToParts(date)

    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? ''

    const hours = Number(get('hour'))
    const minutes = Number(get('minute'))
    const seconds = Number(get('second'))
    const weekday = get('weekday')
    const month = get('month')
    const day = get('day')
    const tzLabel = get('timeZoneName')

    return {
      hours: Number.isFinite(hours) ? hours : 0,
      minutes: Number.isFinite(minutes) ? minutes : 0,
      seconds: Number.isFinite(seconds) ? seconds : 0,
      dateLabel: [weekday, `${month} ${day}`].filter(Boolean).join(', '),
      tzLabel,
    }
  } catch {
    return {
      hours: date.getHours(),
      minutes: date.getMinutes(),
      seconds: date.getSeconds(),
      dateLabel: date.toDateString(),
      tzLabel: '',
    }
  }
}

function formatDigital(
  hours: number,
  minutes: number,
  seconds: number,
  hour12: boolean,
  showSeconds: boolean,
): { time: string; suffix: string } {
  let displayHours = hours
  let suffix = ''
  if (hour12) {
    suffix = hours >= 12 ? 'PM' : 'AM'
    displayHours = hours % 12
    if (displayHours === 0) displayHours = 12
  }
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  const hh = hour12
    ? String(displayHours)
    : String(displayHours).padStart(2, '0')
  return {
    time: showSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`,
    suffix,
  }
}

function ClockFace({
  hours,
  minutes,
  seconds,
  isDarkMode,
}: {
  hours: number
  minutes: number
  seconds: number
  isDarkMode?: boolean
}): React.JSX.Element {
  const secondAngle = seconds * 6
  const minuteAngle = minutes * 6 + seconds * 0.1
  const hourAngle = (hours % 12) * 30 + minutes * 0.5

  const faceFill = isDarkMode ? '#111113' : '#ffffff'
  const faceStroke = isDarkMode ? '#2a2a2d' : '#e5e5e7'
  const handColor = isDarkMode ? '#ffffff' : '#000000'
  const tickColor = isDarkMode ? '#5a5a5f' : '#b0b0b5'
  const hourTickColor = isDarkMode ? '#ffffff' : '#000000'
  const secondHandColor = '#ff3b30'

  const hourTicks = Array.from({ length: 12 }, (_, i) => i)
  const minuteTicks = Array.from({ length: 60 }, (_, i) => i).filter(
    (i) => i % 5 !== 0,
  )

  return (
    <svg
      width={CLOCK_FACE_SIZE_PX}
      height={CLOCK_FACE_SIZE_PX}
      viewBox={`0 0 ${CLOCK_FACE_SIZE_PX} ${CLOCK_FACE_SIZE_PX}`}
      role="img"
      aria-label="Analog clock"
      className="drop-shadow-sm"
    >
      <circle
        cx={CLOCK_FACE_CENTER}
        cy={CLOCK_FACE_CENTER}
        r={CLOCK_FACE_RADIUS}
        fill={faceFill}
        stroke={faceStroke}
        strokeWidth={2}
      />

      {hourTicks.map((i) => {
        const angle = (i * 30 - 90) * (Math.PI / 180)
        const x1 = CLOCK_FACE_CENTER + Math.cos(angle) * (CLOCK_FACE_RADIUS - 4)
        const y1 = CLOCK_FACE_CENTER + Math.sin(angle) * (CLOCK_FACE_RADIUS - 4)
        const x2 =
          CLOCK_FACE_CENTER + Math.cos(angle) * (CLOCK_FACE_RADIUS - 14)
        const y2 =
          CLOCK_FACE_CENTER + Math.sin(angle) * (CLOCK_FACE_RADIUS - 14)
        return (
          <line
            key={`h-${i}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={hourTickColor}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        )
      })}

      {minuteTicks.map((i) => {
        const angle = (i * 6 - 90) * (Math.PI / 180)
        const x1 = CLOCK_FACE_CENTER + Math.cos(angle) * (CLOCK_FACE_RADIUS - 4)
        const y1 = CLOCK_FACE_CENTER + Math.sin(angle) * (CLOCK_FACE_RADIUS - 4)
        const x2 = CLOCK_FACE_CENTER + Math.cos(angle) * (CLOCK_FACE_RADIUS - 9)
        const y2 = CLOCK_FACE_CENTER + Math.sin(angle) * (CLOCK_FACE_RADIUS - 9)
        return (
          <line
            key={`m-${i}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={tickColor}
            strokeWidth={1}
            strokeLinecap="round"
          />
        )
      })}

      <line
        x1={CLOCK_FACE_CENTER}
        y1={CLOCK_FACE_CENTER + 12}
        x2={CLOCK_FACE_CENTER}
        y2={CLOCK_FACE_CENTER - (CLOCK_FACE_RADIUS - 48)}
        stroke={handColor}
        strokeWidth={5}
        strokeLinecap="round"
        transform={`rotate(${hourAngle} ${CLOCK_FACE_CENTER} ${CLOCK_FACE_CENTER})`}
      />

      <line
        x1={CLOCK_FACE_CENTER}
        y1={CLOCK_FACE_CENTER + 14}
        x2={CLOCK_FACE_CENTER}
        y2={CLOCK_FACE_CENTER - (CLOCK_FACE_RADIUS - 22)}
        stroke={handColor}
        strokeWidth={3.5}
        strokeLinecap="round"
        transform={`rotate(${minuteAngle} ${CLOCK_FACE_CENTER} ${CLOCK_FACE_CENTER})`}
      />

      <line
        x1={CLOCK_FACE_CENTER}
        y1={CLOCK_FACE_CENTER + 18}
        x2={CLOCK_FACE_CENTER}
        y2={CLOCK_FACE_CENTER - (CLOCK_FACE_RADIUS - 14)}
        stroke={secondHandColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        transform={`rotate(${secondAngle} ${CLOCK_FACE_CENTER} ${CLOCK_FACE_CENTER})`}
      />

      <circle
        cx={CLOCK_FACE_CENTER}
        cy={CLOCK_FACE_CENTER}
        r={4}
        fill={secondHandColor}
      />
      <circle
        cx={CLOCK_FACE_CENTER}
        cy={CLOCK_FACE_CENTER}
        r={1.5}
        fill={faceFill}
      />
    </svg>
  )
}

export function ClockWidget({
  timezone,
  label,
  style = 'both',
  showSeconds = true,
  hour12 = true,
  isDarkMode,
}: ClockWidgetProps): React.JSX.Element {
  const [now, setNow] = useState<Date>(() => new Date())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setNow(new Date())
    }, CLOCK_TICK_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const { hours, minutes, seconds, dateLabel, tzLabel } = useMemo(
    () => formatZonedParts(now, timezone, hour12),
    [now, timezone, hour12],
  )

  const digital = useMemo(
    () => formatDigital(hours, minutes, seconds, hour12, showSeconds),
    [hours, minutes, seconds, hour12, showSeconds],
  )

  const headerLabel = label ?? timezone ?? 'Current Time'
  const showAnalog = style === 'analog' || style === 'both'
  const showDigital = style === 'digital' || style === 'both'

  return (
    <Card className="my-3 max-w-md">
      <div className="flex flex-col items-center gap-4 p-5">
        <div className="flex w-full flex-col items-center gap-1 text-center">
          <p className="text-sm font-medium text-content-primary">
            {headerLabel}
          </p>
          {tzLabel && (
            <p className="text-xs text-content-muted">
              {dateLabel}
              {tzLabel ? ` · ${tzLabel}` : ''}
            </p>
          )}
        </div>

        {showAnalog && (
          <ClockFace
            hours={hours}
            minutes={minutes}
            seconds={seconds}
            isDarkMode={isDarkMode}
          />
        )}

        {showDigital && (
          <div className="flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-3xl font-semibold text-content-primary">
              {digital.time}
            </span>
            {digital.suffix && (
              <span className="text-sm font-medium text-content-muted">
                {digital.suffix}
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

export function validateClockWidgetProps(
  props: Record<string, unknown>,
): boolean {
  if (props.timezone !== undefined && typeof props.timezone !== 'string') {
    return false
  }
  if (props.label !== undefined && typeof props.label !== 'string') {
    return false
  }
  if (
    props.style !== undefined &&
    props.style !== 'analog' &&
    props.style !== 'digital' &&
    props.style !== 'both'
  ) {
    return false
  }
  return true
}
