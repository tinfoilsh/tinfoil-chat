import { cn } from '@/components/ui/utils'
import { GiGearStickPattern } from 'react-icons/gi'
import type { ReasoningEffort } from './hooks/use-reasoning-effort'

const EFFORT_OPTIONS: {
  value: ReasoningEffort
  label: string
  description: string
}[] = [
  { value: 'low', label: 'Low', description: 'Quick responses' },
  { value: 'medium', label: 'Medium', description: 'Balanced reasoning' },
  { value: 'high', label: 'High', description: 'Deep thinking' },
]

type ReasoningEffortSelectorProps = {
  /** Whether the model exposes graded effort (low/medium/high). */
  supportsEffort: boolean
  /** Whether the model exposes an on/off thinking toggle. */
  supportsToggle: boolean
  reasoningEffort: ReasoningEffort
  onEffortChange: (effort: ReasoningEffort) => void
  thinkingEnabled: boolean
  onThinkingEnabledChange: (enabled: boolean) => void
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
}

export function ReasoningEffortSelector({
  supportsEffort,
  supportsToggle,
  reasoningEffort,
  onEffortChange,
  thinkingEnabled,
  onThinkingEnabledChange,
  isOpen,
  onToggle,
  onClose,
}: ReasoningEffortSelectorProps) {
  if (!supportsEffort && !supportsToggle) {
    return null
  }

  // Toggle-only models render as a single pill that flips state on click;
  // there is no popover to open.
  if (supportsToggle && !supportsEffort) {
    return (
      <button
        type="button"
        data-reasoning-selector
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onThinkingEnabledChange(!thinkingEnabled)
        }}
        className={cn(
          'flex items-center gap-1 transition-colors',
          thinkingEnabled
            ? 'text-content-primary'
            : 'text-content-secondary hover:text-content-primary',
        )}
        title={thinkingEnabled ? 'Thinking on' : 'Thinking off'}
      >
        <GiGearStickPattern className="h-4 w-4" />
        <span className="text-xs font-medium">
          {thinkingEnabled ? 'Thinking' : 'No thinking'}
        </span>
      </button>
    )
  }

  // Effort-supporting models render a button that opens a popover. When the
  // model also supports a toggle, the popover includes an "Off" option.
  const currentEffort =
    EFFORT_OPTIONS.find((o) => o.value === reasoningEffort) ?? EFFORT_OPTIONS[1]
  const buttonLabel =
    supportsToggle && !thinkingEnabled ? 'Off' : currentEffort.label
  const buttonTitle =
    supportsToggle && !thinkingEnabled
      ? 'Thinking off'
      : `Reasoning effort: ${currentEffort.label}`

  return (
    <div className="relative">
      <button
        type="button"
        data-reasoning-selector
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onToggle()
        }}
        className="flex items-center gap-1 text-content-secondary transition-colors hover:text-content-primary"
        title={buttonTitle}
      >
        <GiGearStickPattern className="h-4 w-4" />
        <span className="text-xs font-medium">{buttonLabel}</span>
        <svg
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          data-reasoning-menu
          className="absolute bottom-full z-50 mb-2 w-[200px] overflow-hidden rounded-lg border border-border-subtle bg-surface-chat p-1 font-aeonik-fono text-content-secondary shadow-lg"
        >
          {supportsToggle && (
            <button
              type="button"
              className={cn(
                'flex w-full flex-col rounded-md border px-3 py-2 text-left text-sm transition-colors',
                !thinkingEnabled
                  ? 'border-border-subtle bg-surface-card text-content-primary'
                  : 'border-transparent hover:bg-surface-card/70',
              )}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onThinkingEnabledChange(false)
                onClose()
              }}
            >
              <span className="font-medium">Off</span>
              <span className="text-xs text-content-muted">
                Disable thinking mode
              </span>
            </button>
          )}
          {EFFORT_OPTIONS.map((option) => {
            const isActive =
              (!supportsToggle || thinkingEnabled) &&
              reasoningEffort === option.value
            return (
              <button
                key={option.value}
                type="button"
                className={cn(
                  'flex w-full flex-col rounded-md border px-3 py-2 text-left text-sm transition-colors',
                  isActive
                    ? 'border-border-subtle bg-surface-card text-content-primary'
                    : 'border-transparent hover:bg-surface-card/70',
                )}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (supportsToggle && !thinkingEnabled) {
                    onThinkingEnabledChange(true)
                  }
                  onEffortChange(option.value)
                  onClose()
                }}
              >
                <span className="font-medium">{option.label}</span>
                <span className="text-xs text-content-muted">
                  {option.description}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
