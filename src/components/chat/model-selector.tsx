'use client'

import { type BaseModel, isModelAvailable } from '@/app/config/models'
import { LockClosedIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import type { AIModel } from './types'

type ModelSelectorProps = {
  selectedModel: AIModel
  onSelect: (model: AIModel) => void
  isDarkMode: boolean
  isPremium: boolean
  models: BaseModel[]
}

export function ModelSelector({
  selectedModel,
  onSelect,
  isDarkMode,
  isPremium,
  models,
}: ModelSelectorProps) {
  // Track images that failed to load
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({})

  const handleImageError = (modelName: string) => {
    setFailedImages((prev) => ({ ...prev, [modelName]: true }))
  }

  // Filter models based on subscription status
  // Premium users: show only premium models
  // Free users: show all models (free models enabled, premium models disabled)
  const displayModels = models.filter((model) => {
    if (model.type !== 'chat' || model.chat !== true) return false

    // For premium users, only show premium models
    if (isPremium && !model.paid) {
      return false
    }

    // For free users, show all models
    return true
  })

  return (
    <div
      data-model-menu
      className={`absolute bottom-full mb-2 w-[280px] rounded-lg border shadow-lg ${
        isDarkMode ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'
      }`}
    >
      {displayModels.map((model) => {
        const isAvailable = isModelAvailable(model, isPremium)
        const isSelected = model.modelName === selectedModel
        const isPremiumModel = model.paid === true

        return (
          <button
            key={model.modelName}
            className={`relative flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              isAvailable
                ? isDarkMode
                  ? `text-gray-200 ${
                      isSelected ? 'bg-gray-600' : 'hover:bg-gray-600/50'
                    }`
                  : `text-gray-700 ${
                      isSelected ? 'bg-gray-100' : 'hover:bg-gray-100'
                    }`
                : isDarkMode
                  ? 'cursor-not-allowed text-gray-500'
                  : 'cursor-not-allowed text-gray-400'
            }`}
            onClick={() => isAvailable && onSelect(model.modelName as AIModel)}
            disabled={!isAvailable}
          >
            <div className="relative">
              <img
                src={
                  failedImages[model.modelName]
                    ? '/icon.png'
                    : model.modelName.toLowerCase().includes('openai') ||
                        model.modelName.toLowerCase().includes('gpt')
                      ? isDarkMode
                        ? '/model-icons/openai-dark.png'
                        : '/model-icons/openai-light.png'
                      : model.image
                }
                alt={model.name}
                className={`h-5 w-5 ${!isAvailable ? 'opacity-70 grayscale' : ''}`}
                onError={() => handleImageError(model.modelName)}
              />
              {isPremiumModel && !isPremium && (
                <div
                  className={`absolute -bottom-0.5 -right-0.5 ${
                    isDarkMode ? 'bg-gray-800' : 'bg-white'
                  } rounded-full p-0.5`}
                >
                  <LockClosedIcon
                    className={`h-2.5 w-2.5 ${
                      isDarkMode ? 'text-emerald-400/60' : 'text-emerald-500/60'
                    }`}
                  />
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-col">
              <div className="flex items-center gap-2">
                <span
                  className={`font-medium ${!isAvailable ? 'opacity-70' : ''}`}
                >
                  {model.name}
                </span>
                {isPremiumModel && !isPremium && (
                  <div
                    className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs ${
                      isDarkMode
                        ? 'border border-emerald-800/40 bg-emerald-900/30 text-emerald-400/70'
                        : 'border border-emerald-200/50 bg-emerald-50/70 text-emerald-600/70'
                    }`}
                  >
                    <LockClosedIcon className="h-2 w-2" />
                    <span className="text-xs font-medium">Pro</span>
                  </div>
                )}
              </div>
              <span
                className={`text-xs ${
                  isDarkMode ? 'text-gray-400' : 'text-gray-500'
                } ${!isAvailable ? 'opacity-70' : ''}`}
              >
                {model.description}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
