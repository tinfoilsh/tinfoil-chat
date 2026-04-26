import { cn } from '@/components/ui/utils'
import { PiSpeedometerLight } from 'react-icons/pi'
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
  reasoningEffort: ReasoningEffort
  onChange: (effort: ReasoningEffort) => void
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
}

export function ReasoningEffortSelector({
  reasoningEffort,
  onChange,
  isOpen,
  onToggle,
  onClose,
}: ReasoningEffortSelectorProps) {
  const current =
    EFFORT_OPTIONS.find((o) => o.value === reasoningEffort) ?? EFFORT_OPTIONS[1]

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
        title={`Reasoning effort: ${current.label}`}
      >
        <PiSpeedometerLight className="h-4 w-4" />
        <span className="text-xs font-medium">{current.label}</span>
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
          {EFFORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                'flex w-full flex-col rounded-md border px-3 py-2 text-left text-sm transition-colors',
                reasoningEffort === option.value
                  ? 'border-border-subtle bg-surface-card text-content-primary'
                  : 'border-transparent hover:bg-surface-card/70',
              )}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onChange(option.value)
                onClose()
              }}
            >
              <span className="font-medium">{option.label}</span>
              <span className="text-xs text-content-muted">
                {option.description}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
