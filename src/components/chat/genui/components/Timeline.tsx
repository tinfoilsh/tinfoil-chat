import { coerceArray } from './chart-utils'

interface TimelineEvent {
  date: string
  title: string
  description?: string
}

interface TimelineProps {
  events: unknown
  title?: string
}

export function Timeline({ events, title }: TimelineProps) {
  const items = coerceArray<TimelineEvent>(events)
  return (
    <div className="my-3">
      {title && (
        <p className="mb-3 text-sm font-medium text-content-primary">{title}</p>
      )}
      <div className="relative">
        <div className="absolute bottom-2 left-[7px] top-2 w-px bg-border-subtle" />
        <div className="space-y-4">
          {items.map((event, i) => (
            <div key={i} className="relative flex gap-4">
              <div className="mt-1.5 h-[14px] w-[14px] shrink-0 rounded-full border-2 border-border-subtle bg-surface-card" />
              <div className="flex-1">
                <p className="text-xs font-medium uppercase tracking-wider text-content-muted">
                  {event.date}
                </p>
                <p className="mt-0.5 text-sm font-medium text-content-primary">
                  {event.title}
                </p>
                {event.description && (
                  <p className="mt-1 text-sm text-content-muted">
                    {event.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function validateTimelineProps(props: Record<string, unknown>): boolean {
  const events = coerceArray<unknown>(props.events)
  return (
    events.length > 0 &&
    events.every(
      (e: unknown) =>
        e !== null &&
        typeof e === 'object' &&
        typeof (e as any).date === 'string' &&
        typeof (e as any).title === 'string',
    )
  )
}
