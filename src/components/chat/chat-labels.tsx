import { type BaseModel } from '@/app/config/models'
import {
  Cog6ToothIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  LockOpenIcon,
} from '@heroicons/react/24/outline'
import { useCallback } from 'react'
import { ModelSelector } from './model-selector'
import type { AIModel } from './types'

type ChatLabelsProps = {
  verificationComplete: boolean
  verificationSuccess?: boolean
  openAndExpandVerifier: () => void
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
  onSettingsClick?: () => void
}

export function ChatLabels({
  verificationComplete,
  verificationSuccess,
  openAndExpandVerifier,
  expandedLabel,
  handleLabelClick,
  selectedModel,
  handleModelSelect,
  isDarkMode,
  isPremium,
  models,
  onSettingsClick,
}: ChatLabelsProps) {
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
    <div className="mb-2 flex items-center gap-2">
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
              isDarkMode ? 'bg-gray-600' : 'bg-gray-200'
            } ${
              expandedLabel === 'model' ? 'bg-opacity-80' : ''
            } transition-colors hover:bg-opacity-80`}
          >
            <img src={model.image} alt={model.name} className="h-5 w-5" />
            <span
              className={`hidden text-xs md:inline ${
                isDarkMode ? 'text-gray-200' : 'text-gray-600'
              }`}
            >
              Running {model.name}
            </span>
          </button>

          {expandedLabel === 'model' && handleModelSelect && (
            <ModelSelector
              selectedModel={selectedModel}
              onSelect={onModelSelect}
              isDarkMode={isDarkMode}
              isPremium={isPremium}
              models={models}
            />
          )}
        </div>

        {/* Settings button */}
        {onSettingsClick && (
          <button
            type="button"
            onClick={onSettingsClick}
            className={`flex items-center gap-1.5 rounded-lg px-2 py-1 ${
              isDarkMode ? 'bg-gray-600' : 'bg-gray-200'
            } transition-colors hover:bg-opacity-80`}
            title="Settings"
          >
            <Cog6ToothIcon className="h-5 w-5 text-gray-500" />
            <span
              className={`hidden text-xs md:inline ${
                isDarkMode ? 'text-gray-200' : 'text-gray-600'
              }`}
            >
              Settings
            </span>
          </button>
        )}

        {/* Verification label */}
        <button
          type="button"
          onClick={openAndExpandVerifier}
          className={`flex items-center gap-1.5 rounded-lg px-2 py-1 ${
            isDarkMode ? 'bg-gray-600' : 'bg-gray-200'
          }`}
        >
          {!verificationComplete ? (
            <LockOpenIcon className="h-5 w-5 animate-pulse text-yellow-500" />
          ) : verificationSuccess ? (
            <LockClosedIcon className="lock-close-animation h-5 w-5 text-emerald-500" />
          ) : (
            <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
          )}
          <span
            className={`hidden text-xs md:inline ${
              isDarkMode ? 'text-gray-200' : 'text-gray-600'
            }`}
          >
            {!verificationComplete
              ? 'Verifying...'
              : verificationSuccess
                ? 'Chat is private'
                : 'Verification failed'}
          </span>
        </button>
      </div>

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
