import { AlertTriangle, CheckCircle2, Shield } from 'lucide-react'
import { coerceArray } from './input-coercion'

type RiskLevel = 'low' | 'medium' | 'high'

interface ConfirmationCardProps {
  title: string
  summary: string
  riskLevel?: RiskLevel
  reason?: string
  details?: unknown
  consequences?: unknown
  confirmLabel?: string
  cancelLabel?: string
  requiresConfirmation?: boolean
}

const RISK_META = {
  low: {
    icon: CheckCircle2,
    containerClass: 'border-green-500/30 bg-green-500/5',
    badgeClass:
      'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400',
    iconClass: 'text-green-500',
    label: 'Low risk',
  },
  medium: {
    icon: Shield,
    containerClass: 'border-yellow-500/30 bg-yellow-500/5',
    badgeClass:
      'border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
    iconClass: 'text-yellow-500',
    label: 'Medium risk',
  },
  high: {
    icon: AlertTriangle,
    containerClass: 'border-red-500/30 bg-red-500/5',
    badgeClass:
      'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
    iconClass: 'text-red-500',
    label: 'High risk',
  },
} as const

function getStringItems(value: unknown): string[] {
  return coerceArray<unknown>(value).filter(
    (item): item is string => typeof item === 'string' && item.length > 0,
  )
}

export function ConfirmationCard({
  title,
  summary,
  riskLevel = 'medium',
  reason,
  details,
  consequences,
  confirmLabel = 'Approve',
  cancelLabel = 'Revise',
  requiresConfirmation = true,
}: ConfirmationCardProps) {
  const meta = RISK_META[riskLevel]
  const Icon = meta.icon
  const detailItems = getStringItems(details)
  const consequenceItems = getStringItems(consequences)

  return (
    <div
      className={`my-3 overflow-hidden rounded-lg border ${meta.containerClass}`}
    >
      <div className="flex items-start gap-3 px-4 py-4">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${meta.iconClass}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-content-primary">
                {title}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-content-primary">
                {summary}
              </p>
            </div>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${meta.badgeClass}`}
            >
              {meta.label}
            </span>
          </div>

          {reason && (
            <div className="mt-3 rounded-md border border-border-subtle bg-surface-card/70 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-content-muted">
                Why this needs approval
              </p>
              <p className="mt-1 text-sm text-content-primary">{reason}</p>
            </div>
          )}

          {detailItems.length > 0 && (
            <div className="mt-3">
              <p className="text-xs uppercase tracking-wide text-content-muted">
                Request details
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-content-primary">
                {detailItems.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {consequenceItems.length > 0 && (
            <div className="mt-3">
              <p className="text-xs uppercase tracking-wide text-content-muted">
                Potential impact
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-content-primary">
                {consequenceItems.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border-subtle bg-surface-card px-3 py-1 text-xs font-medium text-content-primary">
              {confirmLabel}
            </span>
            <span className="rounded-full border border-border-subtle bg-surface-card px-3 py-1 text-xs font-medium text-content-primary">
              {cancelLabel}
            </span>
            <span className="text-xs text-content-muted">
              {requiresConfirmation
                ? 'Awaiting confirmation in chat'
                : 'Confirmation optional'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function validateConfirmationCardProps(
  props: Record<string, unknown>,
): boolean {
  if (typeof props.title !== 'string' || typeof props.summary !== 'string') {
    return false
  }

  if (
    props.riskLevel !== undefined &&
    !['low', 'medium', 'high'].includes(props.riskLevel as string)
  ) {
    return false
  }

  return true
}
