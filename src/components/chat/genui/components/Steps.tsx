import { CheckCircle2, Circle, Loader2 } from 'lucide-react'

interface Step {
  title: string
  description?: string
  status?: 'pending' | 'active' | 'complete'
}

interface StepsProps {
  steps: Step[]
}

const STATUS_ICONS = {
  pending: <Circle className="h-5 w-5 text-content-muted" />,
  active: <Loader2 className="h-5 w-5 animate-spin text-blue-500" />,
  complete: <CheckCircle2 className="h-5 w-5 text-green-500" />,
} as const

export function Steps({ steps }: StepsProps) {
  return (
    <div className="my-3 space-y-3">
      {steps.map((step, i) => {
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
  return (
    Array.isArray(props.steps) &&
    props.steps.every(
      (s: unknown) =>
        s !== null &&
        typeof s === 'object' &&
        typeof (s as any).title === 'string',
    )
  )
}
