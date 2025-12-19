import { type BaseModel } from '@/app/config/models'
import { cn } from '@/components/ui/utils'
import { useAuth, useClerk } from '@clerk/nextjs'
import {
  TfBrain,
  TfCopy,
  TfShieldCheck,
  TfWarning,
} from '@tinfoilsh/tinfoil-icons'
import { useCallback } from 'react'
import { PiSpinner } from 'react-icons/pi'
import {
  isReasoningModel,
  type ReasoningEffort,
} from './hooks/use-reasoning-effort'
import { ModelSelector } from './model-selector'
import type { AIModel, LabelType } from './types'

const EFFORT_OPTIONS: {
  value: ReasoningEffort
  label: string
  description: string
}[] = [
  { value: 'low', label: 'Low', description: 'Quick responses' },
  { value: 'medium', label: 'Medium', description: 'Balanced reasoning' },
  { value: 'high', label: 'High', description: 'Deep thinking' },
]

type ChatControlsProps = {
  verificationComplete: boolean
  verificationSuccess?: boolean
  openAndExpandVerifier: () => void
  setIsSidebarOpen?: (isOpen: boolean) => void
  expandedLabel: LabelType
  handleLabelClick: (
    label: Exclude<LabelType, null>,
    action: () => void,
  ) => void
  selectedModel: AIModel
  handleModelSelect?: (model: AIModel) => void
  isDarkMode: boolean
  isPremium: boolean
  models: BaseModel[]
  onShareClick?: () => void
  hasMessages?: boolean
  isCompactMode?: boolean
  contextUsagePercentage?: number
  reasoningEffort?: ReasoningEffort
  onReasoningEffortChange?: (effort: ReasoningEffort) => void
}

export function ChatControls({
  verificationComplete,
  verificationSuccess,
  openAndExpandVerifier,
  setIsSidebarOpen,
  expandedLabel,
  handleLabelClick,
  selectedModel,
  handleModelSelect,
  isDarkMode,
  isPremium,
  models,
  onShareClick,
  hasMessages = false,
  isCompactMode = false,
  contextUsagePercentage,
  reasoningEffort,
  onReasoningEffortChange,
}: ChatControlsProps) {
  const { isSignedIn } = useAuth()
  const { openSignIn } = useClerk()
  // Model selection handler - enforces handleModelSelect is defined
  const onModelSelect = useCallback(
    (model: AIModel) => {
      if (handleModelSelect) {
        handleModelSelect(model)
      }
    },
    [handleModelSelect],
  )

  const model = models.find((model) => model.modelName === selectedModel)
  if (!model) {
    return (
      <div className="mb-2 flex items-center gap-2">
        <div className="flex gap-2">
          <div className="flex items-center gap-1.5 rounded-lg px-2 py-1">
            <TfWarning className="h-5 w-5 text-red-500" />
            <span className="text-xs text-red-500">Model not found</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      {/* Left side labels group */}
      <div className="flex gap-2">
        {/* Model label */}
        <div className="relative">
          <button
            type="button"
            data-model-selector
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleLabelClick('model', () => {})
            }}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border border-border-subtle px-2 py-1 transition-colors',
              'bg-surface-chat-background hover:bg-surface-chat',
              expandedLabel === 'model' && 'bg-surface-chat',
            )}
          >
            <img
              src={
                model.image === 'openai.png'
                  ? `/model-icons/openai-${isDarkMode ? 'dark' : 'light'}.png`
                  : model.image === 'moonshot.png'
                    ? `/model-icons/moonshot-${isDarkMode ? 'dark' : 'light'}.png`
                    : `/model-icons/${model.image}`
              }
              alt={model.name}
              className="h-5 w-5"
            />
            {!isCompactMode && (
              <span className="text-xs text-content-secondary">
                {model.name}
              </span>
            )}
          </button>

          {expandedLabel === 'model' && handleModelSelect && (
            <ModelSelector
              selectedModel={selectedModel}
              onSelect={onModelSelect}
              isDarkMode={isDarkMode}
              isPremium={isPremium}
              models={models}
              onPremiumModelClick={() => {
                if (!isSignedIn) {
                  handleLabelClick('model', () => {})
                  void openSignIn()
                  return
                }
                if (setIsSidebarOpen) {
                  setIsSidebarOpen(true)
                  // Dispatch event to highlight the appropriate box
                  window.dispatchEvent(
                    new CustomEvent('highlightSidebarBox', {
                      detail: { isPremium },
                    }),
                  )
                }
              }}
            />
          )}
        </div>

        {/* Reasoning effort selector - only show for gpt-oss models */}
        {isReasoningModel(selectedModel) &&
          reasoningEffort &&
          onReasoningEffortChange && (
            <div className="relative">
              <button
                type="button"
                data-reasoning-selector
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleLabelClick('reasoning', () => {})
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border border-border-subtle px-2 py-1 transition-colors',
                  'bg-surface-chat-background hover:bg-surface-chat',
                  expandedLabel === 'reasoning' && 'bg-surface-chat',
                )}
                title={`Reasoning effort: ${reasoningEffort}`}
              >
                <TfBrain className="h-5 w-5 text-content-secondary" />
                {!isCompactMode && (
                  <span className="text-xs text-content-secondary">
                    {EFFORT_OPTIONS.find((o) => o.value === reasoningEffort)
                      ?.label || 'Medium'}
                  </span>
                )}
              </button>

              {expandedLabel === 'reasoning' && (
                <div
                  data-reasoning-menu
                  className="absolute bottom-full z-50 mb-2 w-[180px] overflow-hidden rounded-lg border border-border-subtle bg-surface-chat p-1 font-aeonik-fono text-content-secondary shadow-lg"
                >
                  {EFFORT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={cn(
                        'flex w-full flex-col rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                        reasoningEffort === option.value
                          ? 'border-border-subtle bg-surface-card text-content-primary'
                          : 'border-transparent hover:bg-surface-card/70',
                      )}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onReasoningEffortChange(option.value)
                        handleLabelClick('reasoning', () => {})
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
          )}

        {/* Verification label */}
        <button
          type="button"
          onClick={openAndExpandVerifier}
          className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-chat-background px-2 py-1 text-content-secondary transition-colors hover:bg-surface-chat"
        >
          {!verificationComplete ? (
            <PiSpinner className="h-5 w-5 animate-spin text-content-primary" />
          ) : verificationSuccess ? (
            <TfShieldCheck className="lock-close-animation h-5 w-5 text-emerald-500" />
          ) : (
            <TfWarning className="h-5 w-5 text-red-500" />
          )}
          {!isCompactMode && (
            <span className="text-xs text-content-secondary">
              {!verificationComplete
                ? 'Verifying...'
                : verificationSuccess
                  ? 'Chat is private'
                  : 'Verification failed'}
            </span>
          )}
        </button>

        {/* Copy button - only show when there are messages */}
        {onShareClick && hasMessages && (
          <button
            type="button"
            onClick={onShareClick}
            className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-chat-background px-2 py-1 text-content-secondary transition-colors hover:bg-surface-chat"
            title="Copy"
          >
            <TfCopy className="h-5 w-5 text-content-secondary" />
            {!isCompactMode && (
              <span className="text-xs text-content-secondary">Copy</span>
            )}
          </button>
        )}
      </div>

      {/* Right side - Context usage indicator */}
      {contextUsagePercentage !== undefined && contextUsagePercentage > 50 && (
        <div className="flex items-center gap-1.5">
          <div className="relative h-6 w-6">
            <svg className="h-6 w-6 -rotate-90 transform" viewBox="0 0 24 24">
              {/* Background circle */}
              <circle
                cx="12"
                cy="12"
                r="10"
                className="text-border-subtle"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
              />
              {/* Progress circle */}
              <circle
                cx="12"
                cy="12"
                r="10"
                className="text-content-primary transition-all duration-300"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 10}`}
                strokeDashoffset={`${2 * Math.PI * 10 * (1 - contextUsagePercentage / 100)}`}
              />
            </svg>
          </div>
          {!isCompactMode && (
            <span className="text-xs text-content-muted">
              {contextUsagePercentage.toFixed(0)}% of context used
            </span>
          )}
        </div>
      )}

      <style jsx>{`
        @keyframes lock-close {
          0% {
            transform: scale(1.2) rotate(-15deg);
          }
          60% {
            transform: scale(1.05) rotate(0deg);
          }
          100% {
            transform: scale(1) rotate(0deg);
          }
        }
        .lock-close-animation {
          animation: lock-close 0.4s ease-out;
        }
      `}</style>
    </div>
  )
}
