import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Lightbulb,
} from 'lucide-react'

type CalloutVariant = 'info' | 'success' | 'warning' | 'error' | 'tip'

interface CalloutProps {
  variant?: CalloutVariant
  title?: string
  content: string
}

const VARIANT_CONFIG: Record<
  CalloutVariant,
  {
    icon: typeof Info
    containerClass: string
    iconClass: string
  }
> = {
  info: {
    icon: Info,
    containerClass: 'border-blue-500/30 bg-blue-500/5',
    iconClass: 'text-blue-500',
  },
  success: {
    icon: CheckCircle2,
    containerClass: 'border-green-500/30 bg-green-500/5',
    iconClass: 'text-green-500',
  },
  warning: {
    icon: AlertTriangle,
    containerClass: 'border-yellow-500/30 bg-yellow-500/5',
    iconClass: 'text-yellow-500',
  },
  error: {
    icon: AlertCircle,
    containerClass: 'border-red-500/30 bg-red-500/5',
    iconClass: 'text-red-500',
  },
  tip: {
    icon: Lightbulb,
    containerClass: 'border-purple-500/30 bg-purple-500/5',
    iconClass: 'text-purple-500',
  },
}

export function Callout({ variant = 'info', title, content }: CalloutProps) {
  const config = VARIANT_CONFIG[variant] ?? VARIANT_CONFIG.info
  const Icon = config.icon

  return (
    <div
      className={`my-3 flex gap-3 rounded-lg border px-4 py-3 ${config.containerClass}`}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${config.iconClass}`} />
      <div className="flex-1">
        {title && (
          <p className="mb-1 text-sm font-semibold text-content-primary">
            {title}
          </p>
        )}
        <p className="whitespace-pre-wrap text-sm text-content-primary">
          {content}
        </p>
      </div>
    </div>
  )
}

export function validateCalloutProps(props: Record<string, unknown>): boolean {
  if (typeof props.content !== 'string') return false
  if (
    props.variant !== undefined &&
    !['info', 'success', 'warning', 'error', 'tip'].includes(
      props.variant as string,
    )
  ) {
    return false
  }
  return true
}
