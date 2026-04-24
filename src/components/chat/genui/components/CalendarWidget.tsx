import { Card } from '@/components/ui/card'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import React, { useMemo, useState } from 'react'
import { coerceArray } from './input-coercion'

interface CalendarEventInput {
  date: string
  title: string
  time?: string
  color?: string
  description?: string
}

interface CalendarEvent extends CalendarEventInput {
  dateKey: string
}

interface CalendarWidgetProps {
  month?: string
  weekStartsOn?: 'sunday' | 'monday'
  events?: unknown
  highlightedDates?: unknown
  showEventList?: boolean
  title?: string
}

const WEEKDAY_ORDER_SUNDAY = [0, 1, 2, 3, 4, 5, 6]
const WEEKDAY_ORDER_MONDAY = [1, 2, 3, 4, 5, 6, 0]

const WEEKDAY_LABELS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const DEFAULT_EVENT_COLOR = '#ef4444'
const TODAY_COLOR = '#ef4444'

function toDateKey(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

function parseMonthProp(value: string | undefined): {
  year: number
  month: number
} {
  if (value) {
    const match = value.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/)
    if (match) {
      const year = Number(match[1])
      const month = Number(match[2]) - 1
      if (
        Number.isFinite(year) &&
        Number.isFinite(month) &&
        month >= 0 &&
        month <= 11
      ) {
        return { year, month }
      }
    }
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return { year: parsed.getFullYear(), month: parsed.getMonth() }
    }
  }
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() }
}

function parseEventDate(value: string): string | null {
  const match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    if (
      Number.isFinite(year) &&
      Number.isFinite(month) &&
      Number.isFinite(day) &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31
    ) {
      return toDateKey(year, month - 1, day)
    }
  }
  const parsed = new Date(value)
  if (!Number.isNaN(parsed.getTime())) {
    return toDateKey(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
  }
  return null
}

function normalizeEvents(raw: unknown): CalendarEvent[] {
  const list = coerceArray<Record<string, unknown>>(raw)
  const events: CalendarEvent[] = []
  for (const entry of list) {
    const date = typeof entry.date === 'string' ? entry.date : ''
    const title = typeof entry.title === 'string' ? entry.title : ''
    if (!date || !title) continue
    const dateKey = parseEventDate(date)
    if (!dateKey) continue
    events.push({
      date,
      title,
      time: typeof entry.time === 'string' ? entry.time : undefined,
      color: typeof entry.color === 'string' ? entry.color : undefined,
      description:
        typeof entry.description === 'string' ? entry.description : undefined,
      dateKey,
    })
  }
  return events
}

function normalizeHighlightedDates(raw: unknown): Set<string> {
  const list = coerceArray<unknown>(raw)
  const keys = new Set<string>()
  for (const entry of list) {
    if (typeof entry !== 'string') continue
    const key = parseEventDate(entry)
    if (key) keys.add(key)
  }
  return keys
}

function buildMonthGrid(
  year: number,
  month: number,
  weekStartsOn: 'sunday' | 'monday',
): Array<{ day: number; inMonth: boolean; year: number; month: number }> {
  const firstOfMonth = new Date(year, month, 1)
  const firstWeekday = firstOfMonth.getDay()
  const weekStartIndex = weekStartsOn === 'monday' ? 1 : 0
  const leading = (firstWeekday - weekStartIndex + 7) % 7

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const prevMonthDays = new Date(year, month, 0).getDate()

  const cells: Array<{
    day: number
    inMonth: boolean
    year: number
    month: number
  }> = []

  for (let i = leading - 1; i >= 0; i--) {
    const day = prevMonthDays - i
    const prev =
      month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }
    cells.push({ day, inMonth: false, year: prev.year, month: prev.month })
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, inMonth: true, year, month })
  }

  const next =
    month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }
  while (cells.length % 7 !== 0) {
    const day = cells.length - daysInMonth - leading + 1
    cells.push({ day, inMonth: false, year: next.year, month: next.month })
  }

  while (cells.length < 42) {
    const day = cells.length - daysInMonth - leading + 1
    cells.push({ day, inMonth: false, year: next.year, month: next.month })
  }

  return cells
}

function formatLongDate(
  year: number,
  month: number,
  day: number,
  weekday?: number,
): string {
  const weekdayLabel =
    weekday !== undefined
      ? [
          'Sunday',
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
        ][weekday]
      : ''
  const monthLabel = MONTH_LABELS[month]
  const base = `${monthLabel} ${day}, ${year}`
  return weekdayLabel ? `${weekdayLabel}, ${base}` : base
}

export function CalendarWidget({
  month: monthProp,
  weekStartsOn = 'sunday',
  events,
  highlightedDates,
  showEventList = true,
  title,
}: CalendarWidgetProps): React.JSX.Element {
  const initialView = useMemo(() => parseMonthProp(monthProp), [monthProp])
  const [view, setView] = useState<{ year: number; month: number }>(initialView)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const normalizedEvents = useMemo(() => normalizeEvents(events), [events])
  const highlightedKeys = useMemo(
    () => normalizeHighlightedDates(highlightedDates),
    [highlightedDates],
  )

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of normalizedEvents) {
      const list = map.get(event.dateKey) ?? []
      list.push(event)
      map.set(event.dateKey, list)
    }
    return map
  }, [normalizedEvents])

  const today = useMemo(() => {
    const now = new Date()
    return toDateKey(now.getFullYear(), now.getMonth(), now.getDate())
  }, [])

  const weekdayOrder =
    weekStartsOn === 'monday' ? WEEKDAY_ORDER_MONDAY : WEEKDAY_ORDER_SUNDAY

  const cells = useMemo(
    () => buildMonthGrid(view.year, view.month, weekStartsOn),
    [view, weekStartsOn],
  )

  const monthLabel = `${MONTH_LABELS[view.month]} ${view.year}`

  const eventsForSelectedOrMonth = useMemo(() => {
    if (selectedKey) {
      return eventsByDate.get(selectedKey) ?? []
    }
    return normalizedEvents
      .filter((event) => {
        const [y, m] = event.dateKey.split('-').map(Number)
        return y === view.year && m - 1 === view.month
      })
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  }, [selectedKey, eventsByDate, normalizedEvents, view])

  function goPrev() {
    setSelectedKey(null)
    setView((prev) =>
      prev.month === 0
        ? { year: prev.year - 1, month: 11 }
        : { year: prev.year, month: prev.month - 1 },
    )
  }

  function goNext() {
    setSelectedKey(null)
    setView((prev) =>
      prev.month === 11
        ? { year: prev.year + 1, month: 0 }
        : { year: prev.year, month: prev.month + 1 },
    )
  }

  function goToday() {
    const now = new Date()
    setSelectedKey(null)
    setView({ year: now.getFullYear(), month: now.getMonth() })
  }

  return (
    <Card className="my-3 max-w-md">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col">
            {title && (
              <p className="text-xs font-medium uppercase tracking-wide text-content-muted">
                {title}
              </p>
            )}
            <p className="text-base font-semibold text-content-primary">
              {monthLabel}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goToday}
              className="rounded-md border border-border-subtle px-2 py-1 text-xs font-medium text-content-primary hover:bg-surface-chat-background"
            >
              Today
            </button>
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous month"
              className="rounded-md p-1 text-content-muted hover:bg-surface-chat-background hover:text-content-primary"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next month"
              className="rounded-md p-1 text-content-muted hover:bg-surface-chat-background hover:text-content-primary"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {weekdayOrder.map((index) => (
            <span
              key={WEEKDAY_LABELS_SHORT[index]}
              className="pb-1 text-[10px] font-semibold uppercase tracking-wide text-content-muted"
            >
              {WEEKDAY_LABELS_SHORT[index]}
            </span>
          ))}
          {cells.map((cell, i) => {
            const key = toDateKey(cell.year, cell.month, cell.day)
            const isToday = key === today
            const isSelected = key === selectedKey
            const hasEvents = eventsByDate.has(key)
            const isHighlighted = highlightedKeys.has(key)
            const dayEvents = eventsByDate.get(key) ?? []
            const primaryColor =
              dayEvents[0]?.color ||
              (isHighlighted ? TODAY_COLOR : DEFAULT_EVENT_COLOR)

            const baseClasses =
              'relative mx-auto flex h-9 w-9 flex-col items-center justify-center rounded-full text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-content-primary/30'

            let stateClasses =
              'text-content-primary hover:bg-surface-chat-background'
            if (!cell.inMonth) {
              stateClasses =
                'text-content-muted/50 hover:bg-surface-chat-background'
            }
            if (isSelected) {
              stateClasses =
                'bg-content-primary text-surface-chat-background hover:bg-content-primary'
            } else if (isToday) {
              stateClasses = 'text-white'
            }

            return (
              <button
                key={`${key}-${i}`}
                type="button"
                onClick={() => {
                  setSelectedKey((prev) => (prev === key ? null : key))
                  if (!cell.inMonth) {
                    setView({ year: cell.year, month: cell.month })
                  }
                }}
                className={`${baseClasses} ${stateClasses}`}
                style={
                  isToday && !isSelected
                    ? { backgroundColor: TODAY_COLOR }
                    : undefined
                }
                aria-pressed={isSelected}
                aria-label={formatLongDate(cell.year, cell.month, cell.day)}
              >
                <span className="leading-none">{cell.day}</span>
                {hasEvents && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-1 h-1 w-1 rounded-full"
                    style={{
                      backgroundColor:
                        isSelected || isToday ? 'currentColor' : primaryColor,
                    }}
                  />
                )}
              </button>
            )
          })}
        </div>

        {showEventList && eventsForSelectedOrMonth.length > 0 && (
          <div className="mt-1 flex flex-col gap-2 border-t border-border-subtle pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-content-muted">
              {selectedKey
                ? (() => {
                    const [y, m, d] = selectedKey.split('-').map(Number)
                    return formatLongDate(
                      y,
                      m - 1,
                      d,
                      new Date(y, m - 1, d).getDay(),
                    )
                  })()
                : `${MONTH_LABELS[view.month]} events`}
            </p>
            <ul className="flex flex-col gap-2">
              {eventsForSelectedOrMonth.map((event, idx) => {
                const [y, m, d] = event.dateKey.split('-').map(Number)
                const dayLabel = `${MONTH_LABELS[m - 1].slice(0, 3)} ${d}`
                return (
                  <li
                    key={`${event.dateKey}-${idx}`}
                    className="flex items-start gap-3 rounded-lg border border-border-subtle bg-surface-chat-background px-3 py-2"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-1 inline-block h-2 w-2 flex-shrink-0 rounded-full"
                      style={{
                        backgroundColor: event.color || DEFAULT_EVENT_COLOR,
                      }}
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-medium text-content-primary">
                          {event.title}
                        </span>
                        {event.time && (
                          <span className="text-xs text-content-muted">
                            {event.time}
                          </span>
                        )}
                      </div>
                      {!selectedKey && (
                        <span className="text-[11px] uppercase tracking-wide text-content-muted">
                          {dayLabel}
                          {y !== view.year ? `, ${y}` : ''}
                        </span>
                      )}
                      {event.description && (
                        <p className="mt-1 text-xs text-content-muted">
                          {event.description}
                        </p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </Card>
  )
}

export function validateCalendarWidgetProps(
  props: Record<string, unknown>,
): boolean {
  if (props.month !== undefined && typeof props.month !== 'string') {
    return false
  }
  if (
    props.weekStartsOn !== undefined &&
    props.weekStartsOn !== 'sunday' &&
    props.weekStartsOn !== 'monday'
  ) {
    return false
  }
  if (props.title !== undefined && typeof props.title !== 'string') {
    return false
  }
  return true
}
