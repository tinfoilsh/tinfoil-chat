'use client'

import { type BaseModel, isModelAvailable } from '@/app/config/models'
import { LockClosedIcon } from '@heroicons/react/24/outline'
import { useEffect, useRef, useState } from 'react'
import type { AIModel } from './types'

type ModelSelectorProps = {
  selectedModel: AIModel
  onSelect: (model: AIModel) => void
  isDarkMode: boolean
  isPremium: boolean
  models: BaseModel[]
  preferredPosition?: 'above' | 'below' // Optional prop to prefer a position
  onPremiumModelClick?: () => void // Called when a non-premium user clicks a premium model
}

export function ModelSelector({
  selectedModel,
  onSelect,
  isDarkMode,
  isPremium,
  models,
  preferredPosition = 'above', // Default to above
  onPremiumModelClick,
}: ModelSelectorProps) {
  // Track images that failed to load
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({})
  const menuRef = useRef<HTMLDivElement>(null)

  // Start with sensible defaults based on preferred positioning
  const [dynamicStyles, setDynamicStyles] = useState<{
    maxHeight: string
    bottom?: string
    top?: string
  }>({
    maxHeight: '400px',
    ...(preferredPosition === 'below' ? { top: '100%' } : { bottom: '100%' }),
  })

  const handleImageError = (modelName: string) => {
    setFailedImages((prev) => ({ ...prev, [modelName]: true }))
  }

  // Calculate optimal positioning and height
  useEffect(() => {
    let animationFrameId: number | null = null

    const calculatePosition = () => {
      const menuElement = menuRef.current
      if (!menuElement) return

      // Get the parent button's position
      const buttonElement = menuElement.parentElement
      if (!buttonElement) return

      const buttonRect = buttonElement.getBoundingClientRect()

      // Calculate available space
      const spaceAbove = buttonRect.top - 20 // 20px for padding
      const spaceBelow = window.innerHeight - buttonRect.bottom - 20 // 20px for padding

      // Determine position based on preference and available space
      let useAbove = preferredPosition === 'above'

      // Override preference if there's not enough space
      if (
        preferredPosition === 'above' &&
        spaceAbove < 150 &&
        spaceBelow > 150
      ) {
        useAbove = false
      } else if (
        preferredPosition === 'below' &&
        spaceBelow < 150 &&
        spaceAbove > 150
      ) {
        useAbove = true
      }

      if (useAbove) {
        setDynamicStyles({
          maxHeight: `${Math.min(Math.max(0, spaceAbove), window.innerHeight * 0.7)}px`,
          bottom: '100%',
          top: undefined,
        })
      } else {
        // Position below
        setDynamicStyles({
          maxHeight: `${Math.min(Math.max(0, spaceBelow), window.innerHeight * 0.7)}px`,
          top: '100%',
          bottom: undefined,
        })
      }
    }

    // Throttled version using requestAnimationFrame
    const throttledCalculatePosition = () => {
      if (animationFrameId !== null) {
        return
      }
      animationFrameId = requestAnimationFrame(() => {
        calculatePosition()
        animationFrameId = null
      })
    }

    // Run immediately without delay
    calculatePosition()

    window.addEventListener('resize', throttledCalculatePosition)
    window.addEventListener('scroll', throttledCalculatePosition)

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId)
      }
      window.removeEventListener('resize', throttledCalculatePosition)
      window.removeEventListener('scroll', throttledCalculatePosition)
    }
  }, [preferredPosition])

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
      ref={menuRef}
      data-model-menu
      className={`absolute z-50 w-[280px] overflow-y-auto rounded-lg border border-border-subtle bg-surface-chat font-aeonik-fono text-content-secondary shadow-lg ${dynamicStyles.bottom ? 'mb-2' : 'mt-2'}`}
      style={{
        maxHeight: dynamicStyles.maxHeight,
        ...(dynamicStyles.bottom && { bottom: dynamicStyles.bottom }),
        ...(dynamicStyles.top && { top: dynamicStyles.top }),
      }}
    >
      {displayModels.map((model) => {
        const isAvailable = isModelAvailable(model, isPremium)
        const isSelected = model.modelName === selectedModel
        const isPremiumModel = model.paid === true

        const buttonClasses = [
          'relative flex w-full items-start gap-3 rounded-lg border border-border-subtle px-3 py-2 text-left text-sm transition-colors',
          'text-content-secondary',
        ]

        if (isSelected) {
          buttonClasses.push('bg-surface-card text-content-primary')
        }

        if (isAvailable) {
          buttonClasses.push('cursor-pointer')
          if (!isSelected) {
            buttonClasses.push('hover:bg-surface-card/70')
          }
        } else {
          if (!isSelected) {
            buttonClasses.push('text-content-muted')
          }
          if (isPremiumModel && !isPremium && onPremiumModelClick) {
            buttonClasses.push('cursor-pointer hover:bg-surface-card/60')
          } else {
            buttonClasses.push('cursor-not-allowed')
          }
        }

        return (
          <button
            type="button"
            key={model.modelName}
            className={buttonClasses.join(' ')}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (isAvailable) {
                onSelect(model.modelName as AIModel)
              } else if (isPremiumModel && !isPremium && onPremiumModelClick) {
                onPremiumModelClick()
              }
            }}
            onTouchEnd={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (isAvailable) {
                onSelect(model.modelName as AIModel)
              } else if (isPremiumModel && !isPremium && onPremiumModelClick) {
                onPremiumModelClick()
              }
            }}
            disabled={
              !isAvailable &&
              (!isPremiumModel || isPremium || !onPremiumModelClick)
            }
          >
            <div className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center">
              <img
                src={
                  failedImages[model.modelName]
                    ? '/icon.png'
                    : model.modelName.toLowerCase().includes('openai') ||
                        model.modelName.toLowerCase().includes('gpt')
                      ? isDarkMode
                        ? '/model-icons/openai-dark.png'
                        : '/model-icons/openai-light.png'
                      : `/model-icons/${model.image}`
                }
                alt={model.name}
                className={`h-5 w-5 ${!isAvailable ? 'opacity-70 grayscale' : ''}`}
                onError={() => handleImageError(model.modelName)}
              />
            </div>
            <div className="flex flex-1 flex-col">
              <div className="flex items-center gap-2">
                <span
                  className={`font-medium ${!isAvailable ? 'opacity-70' : ''}`}
                >
                  {model.name}
                </span>
                {isPremiumModel && !isPremium && (
                  <div className="inline-flex items-center gap-0.5 rounded border border-brand-accent-light/40 bg-brand-accent-light/10 px-1 py-0.5 text-xs text-brand-accent-light">
                    <LockClosedIcon className="h-2 w-2" />
                    <span className="text-xs font-medium">Pro</span>
                  </div>
                )}
              </div>
              <span
                className={`text-xs text-content-muted ${!isAvailable ? 'opacity-70' : ''}`}
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
