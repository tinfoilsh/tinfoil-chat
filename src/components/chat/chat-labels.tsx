import { type BaseModel } from '@/app/config/models'
import { useAuth, useClerk } from '@clerk/nextjs'
import {
  DocumentDuplicateIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import { useCallback } from 'react'
import { ModelSelector } from './model-selector'
import type { AIModel } from './types'

type ChatLabelsProps = {
  verificationComplete: boolean
  verificationSuccess?: boolean
  openAndExpandVerifier: () => void
  setIsSidebarOpen?: (isOpen: boolean) => void
  expandedLabel: 'verify' | 'model' | 'info' | null
  handleLabelClick: (
    label: 'verify' | 'model' | 'info',
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
}

export function ChatLabels({
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
}: ChatLabelsProps) {
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
            <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
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
            className={`flex items-center gap-1.5 rounded-lg px-2 py-1 ${
              isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
            } ${
              expandedLabel === 'model' ? 'bg-opacity-80' : ''
            } transition-colors hover:bg-opacity-80`}
          >
            <img
              src={
                model.modelName.toLowerCase().includes('openai') ||
                model.modelName.toLowerCase().includes('gpt')
                  ? isDarkMode
                    ? '/model-icons/openai-dark.png'
                    : '/model-icons/openai-light.png'
                  : model.image
              }
              alt={model.name}
              className="h-5 w-5"
            />
            {!isCompactMode && (
              <span
                className={`text-xs ${
                  isDarkMode ? 'text-gray-200' : 'text-gray-600'
                }`}
              >
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

        {/* Verification label */}
        <button
          type="button"
          onClick={openAndExpandVerifier}
          className={`flex items-center gap-1.5 rounded-lg px-2 py-1 ${
            isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
          }`}
        >
          {!verificationComplete ? (
            <svg
              className={`h-5 w-5 animate-spin ${isDarkMode ? 'text-white' : 'text-black'}`}
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : verificationSuccess ? (
            <ShieldCheckIcon className="lock-close-animation h-5 w-5 text-emerald-500" />
          ) : (
            <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
          )}
          {!isCompactMode && (
            <span
              className={`text-xs ${
                isDarkMode ? 'text-gray-200' : 'text-gray-600'
              }`}
            >
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
            className={`flex items-center gap-1.5 rounded-lg px-2 py-1 ${
              isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
            } transition-colors hover:bg-opacity-80`}
            title="Copy"
          >
            <DocumentDuplicateIcon
              className={`h-5 w-5 ${
                isDarkMode ? 'text-gray-200' : 'text-gray-600'
              }`}
            />
            {!isCompactMode && (
              <span
                className={`text-xs ${
                  isDarkMode ? 'text-gray-200' : 'text-gray-600'
                }`}
              >
                Copy
              </span>
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
                stroke={isDarkMode ? '#374151' : '#E5E7EB'}
                strokeWidth="2"
                fill="none"
              />
              {/* Progress circle */}
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke={isDarkMode ? 'white' : '#111827'}
                strokeWidth="2"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 10}`}
                strokeDashoffset={`${2 * Math.PI * 10 * (1 - contextUsagePercentage / 100)}`}
                className="transition-all duration-300"
              />
            </svg>
          </div>
          {!isCompactMode && (
            <span
              className={`text-xs ${
                isDarkMode ? 'text-gray-400' : 'text-gray-500'
              }`}
            >
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
