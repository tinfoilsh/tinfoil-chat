import { AI_MODELS } from '@/app/config/models'
import {
  ExclamationTriangleIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import { useCallback } from 'react'
import { Link } from '../link'
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

  const model = AI_MODELS(isPremium).find(
    (model) => model.modelName === selectedModel,
  )
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
              Running {model.modelNameSimple}
            </span>
          </button>

          {expandedLabel === 'model' && handleModelSelect && (
            <ModelSelector
              selectedModel={selectedModel}
              onSelect={onModelSelect}
              isDarkMode={isDarkMode}
              isPremium={isPremium}
            />
          )}
        </div>

        {/* Verification label */}
        <button
          type="button"
          onClick={openAndExpandVerifier}
          className={`flex items-center gap-1.5 rounded-lg px-2 py-1 ${
            isDarkMode ? 'bg-gray-600' : 'bg-gray-200'
          }`}
        >
          {!verificationComplete ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-5 w-5 animate-pulse text-yellow-500"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
              />
            </svg>
          ) : verificationSuccess ? (
            <ShieldCheckIcon className="h-5 w-5 text-emerald-500" />
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
                ? 'Connection verified'
                : 'Verification failed'}
          </span>
        </button>
      </div>

      {/* Info button */}
      <Link
        href="/technology"
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-1.5 rounded-lg px-2 py-1 ${
          isDarkMode
            ? 'bg-gray-700/50 hover:bg-gray-600'
            : 'bg-gray-200 hover:bg-gray-300'
        } transition-colors`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className={`h-5 w-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
          />
        </svg>
        <span
          className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-600'} hidden md:inline`}
        >
          Learn how it works
        </span>
      </Link>
    </div>
  )
}
