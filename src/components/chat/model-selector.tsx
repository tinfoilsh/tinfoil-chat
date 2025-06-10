'use client'

import { type BaseModel, getAvailableChatModels } from '@/app/config/models'
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

  return (
    <div
      data-model-menu
      className={`absolute bottom-full mb-2 w-[200px] rounded-lg border shadow-lg ${
        isDarkMode ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'
      }`}
    >
      {getAvailableChatModels(models, isPremium)
        .map((model) => (
          <button
            key={model.modelName}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              isDarkMode
                ? `text-gray-200 ${
                    model.modelName === selectedModel
                      ? 'bg-gray-600'
                      : 'hover:bg-gray-600/50'
                  }`
                : `text-gray-700 ${
                    model.modelName === selectedModel
                      ? 'bg-gray-100'
                      : 'hover:bg-gray-100'
                  }`
            }`}
            onClick={() => onSelect(model.modelName as AIModel)}
          >
            <img
              src={failedImages[model.modelName] ? '/icon.png' : model.image}
              alt={model.name}
              className="h-5 w-5"
              onError={() => handleImageError(model.modelName)}
            />
            <div className="flex flex-col">
              <span className="font-medium">{model.name}</span>
              <span
                className={`text-xs ${
                  isDarkMode ? 'text-gray-400' : 'text-gray-500'
                }`}
              >
                {model.description}
              </span>
            </div>
          </button>
        ))}
    </div>
  )
}
