import { CheckCircle2, Circle, CircleDot } from 'lucide-react'
import { coerceArray } from './input-coercion'

interface Step {
  title: string
  description?: string
  status?: 'pending' | 'active' | 'complete'
}

interface StepsProps {
  steps: unknown
}

const STATUS_ICONS = {
  pending: <Circle className="h-5 w-5 text-content-muted" />,
  active: <CircleDot className="h-5 w-5 text-blue-500" />,
  complete: <CheckCircle2 className="h-5 w-5 text-green-500" />,
} as const

export function Steps({ steps }: StepsProps) {
  const items = coerceArray<Step>(steps)
  return (
    <div className="my-3 space-y-3">
      {items.map((step, i) => {
        const status = step.status ?? 'pending'
        return (
          <div key={i} className="flex gap-3">
            <div className="mt-0.5 shrink-0">{STATUS_ICONS[status]}</div>
            <div>
              <p
                className={`text-sm font-medium ${status === 'complete' ? 'text-content-muted line-through' : 'text-content-primary'}`}
              >
                {step.title}
              </p>
              {step.description && (
                <p className="mt-0.5 text-xs text-content-muted">
                  {step.description}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function validateStepsProps(props: Record<string, unknown>): boolean {
  const steps = coerceArray<unknown>(props.steps)
  return (
    steps.length > 0 &&
    steps.every(
      (s: unknown) =>
        s !== null &&
        typeof s === 'object' &&
        typeof (s as any).title === 'string',
    )
  )
}
