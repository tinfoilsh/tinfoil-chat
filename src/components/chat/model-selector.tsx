import {
  getAutoModels,
  resolveModelSelection,
  type BaseModel,
} from '@/config/models'
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'
import { useLayoutEffect, useRef, useState } from 'react'
import { PiShuffleAngularBold } from 'react-icons/pi'
import {
  DEFAULT_EFFORT,
  supportsReasoningEffort,
  supportsThinkingToggle,
  type ReasoningEffort,
} from './hooks/use-reasoning-effort'
import type { AIModel } from './types'

const EFFORT_OPTIONS: {
  value: ReasoningEffort
  label: string
}[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

const EFFORT_EXPLAINER =
  'Higher effort means more thorough responses, but takes longer.'

type ModelSelectorProps = {
  selectedModel: AIModel
  onSelect: (model: AIModel) => void
  isDarkMode: boolean
  models: BaseModel[]
  preferredPosition?: 'above' | 'below'
  reasoningEffort?: ReasoningEffort
  onEffortChange?: (effort: ReasoningEffort) => void
  thinkingEnabled?: boolean
  onThinkingEnabledChange?: (enabled: boolean) => void
}

export function ModelSelector({
  selectedModel,
  onSelect,
  isDarkMode,
  models,
  preferredPosition = 'above',
  reasoningEffort,
  onEffortChange,
  thinkingEnabled,
  onThinkingEnabledChange,
}: ModelSelectorProps) {
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({})
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({})
  const menuRef = useRef<HTMLDivElement>(null)
  const isScrollingRef = useRef(false)
  const [showOtherModels, setShowOtherModels] = useState(false)
  const [showEffortOptions, setShowEffortOptions] = useState(false)

  const [dynamicStyles, setDynamicStyles] = useState<{
    maxHeight: string
    bottom?: string
    top?: string
    left?: string
    right?: string
  }>({
    maxHeight: '400px',
    ...(preferredPosition === 'below' ? { top: '100%' } : { bottom: '100%' }),
  })

  const handleImageError = (modelName: string) => {
    setFailedImages((prev) => ({ ...prev, [modelName]: true }))
  }

  const handleImageLoad = (modelName: string) => {
    setLoadedImages((prev) => ({ ...prev, [modelName]: true }))
  }

  useLayoutEffect(() => {
    let animationFrameId: number | null = null

    const calculatePosition = () => {
      const menuElement = menuRef.current
      if (!menuElement) return

      const buttonElement = menuElement.parentElement
      if (!buttonElement) return

      const buttonRect = buttonElement.getBoundingClientRect()

      // On mobile browsers (notably Firefox for Android) window.innerHeight
      // does not account for the dynamic toolbar or on-screen keyboard, which
      // can collapse the computed space and hide below-the-fold models. The
      // visual viewport reflects the actually-visible area, so prefer it.
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight

      const spaceAbove = buttonRect.top - 20
      const spaceBelow = viewportHeight - buttonRect.bottom - 20

      let useAbove = preferredPosition === 'above'

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

      const isMobile = window.innerWidth < 768
      const maxHeightCap = isMobile ? 300 : viewportHeight * 0.7

      const menuWidth = 280
      const viewportWidth = window.innerWidth
      const buttonLeft = buttonRect.left
      const buttonRight = buttonRect.right

      let horizontalStyles: { left?: string; right?: string } = {}

      if (isMobile) {
        if (buttonLeft + menuWidth > viewportWidth - 10) {
          const rightOffset = viewportWidth - buttonRight
          const dropdownLeft = viewportWidth - rightOffset - menuWidth
          if (dropdownLeft < 10) {
            horizontalStyles = { left: `${-buttonLeft + 10}px` }
          } else {
            horizontalStyles = { right: '0' }
          }
        }
      }

      if (useAbove) {
        setDynamicStyles({
          maxHeight: `${Math.min(Math.max(0, spaceAbove), maxHeightCap)}px`,
          bottom: '100%',
          top: undefined,
          ...horizontalStyles,
        })
      } else {
        setDynamicStyles({
          maxHeight: `${Math.min(Math.max(0, spaceBelow), maxHeightCap)}px`,
          top: '100%',
          bottom: undefined,
          ...horizontalStyles,
        })
      }
    }

    const throttledCalculatePosition = () => {
      if (animationFrameId !== null) {
        return
      }
      animationFrameId = requestAnimationFrame(() => {
        calculatePosition()
        animationFrameId = null
      })
    }

    calculatePosition()

    window.addEventListener('resize', throttledCalculatePosition)
    window.addEventListener('scroll', throttledCalculatePosition)
    // The visual viewport changes when the mobile toolbar or keyboard shows
    // or hides without firing window resize, so track it to keep the menu
    // height and position in sync (e.g. Firefox for Android).
    const visualViewport = window.visualViewport
    visualViewport?.addEventListener('resize', throttledCalculatePosition)
    visualViewport?.addEventListener('scroll', throttledCalculatePosition)

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId)
      }
      window.removeEventListener('resize', throttledCalculatePosition)
      window.removeEventListener('scroll', throttledCalculatePosition)
      visualViewport?.removeEventListener('resize', throttledCalculatePosition)
      visualViewport?.removeEventListener('scroll', throttledCalculatePosition)
    }
  }, [preferredPosition])

  const autoModels = getAutoModels(models)

  // Reasoning controls live at the bottom of the menu and reflect the
  // currently selected model (for Auto entries, the representative model the
  // selection resolves to). They only render when the parent wires the
  // reasoning props and the model exposes the matching capability.
  const resolvedModel = resolveModelSelection(selectedModel, models).model
  const showEffort =
    supportsReasoningEffort(resolvedModel) &&
    reasoningEffort !== undefined &&
    onEffortChange !== undefined
  const showThinkingToggle =
    supportsThinkingToggle(resolvedModel) &&
    thinkingEnabled !== undefined &&
    onThinkingEnabledChange !== undefined
  const isThinkingActive = !showThinkingToggle || thinkingEnabled === true
  const currentEffort =
    EFFORT_OPTIONS.find((o) => o.value === reasoningEffort) ?? EFFORT_OPTIONS[1]

  const displayModels = models.filter(
    (model) =>
      (model.type === 'chat' || model.type === 'code') && model.chat === true,
  )

  const TOP_MODEL_COUNT = 3
  const topModels = displayModels.slice(0, TOP_MODEL_COUNT)
  const otherModels = displayModels.slice(TOP_MODEL_COUNT)

  const getModelIcon = (model: BaseModel) => {
    if (failedImages[model.modelName]) return '/icon.png'
    if (model.image === 'openai.png')
      return `/model-icons/openai-${isDarkMode ? 'dark' : 'light'}.png`
    if (model.image === 'moonshot.png')
      return `/model-icons/moonshot-${isDarkMode ? 'dark' : 'light'}.png`
    return `/model-icons/${model.image}`
  }

  const focusTrigger = () => {
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-model-selector]')?.focus()
    })
  }

  const renderModelItem = (model: BaseModel) => {
    const isSelected = model.modelName === selectedModel
    return (
      <button
        type="button"
        key={model.modelName}
        role="menuitemradio"
        aria-checked={isSelected}
        className={`relative flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors ${isSelected ? 'text-content-primary' : 'cursor-pointer text-content-secondary hover:bg-surface-card/70'}`}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onSelect(model.modelName as AIModel)
          focusTrigger()
        }}
        onTouchEnd={(e) => {
          e.stopPropagation()
          if (isScrollingRef.current) return
          e.preventDefault()
          onSelect(model.modelName as AIModel)
          focusTrigger()
        }}
      >
        <div className="relative flex h-5 w-5 flex-none items-center justify-center">
          {model.isAuto ? (
            <PiShuffleAngularBold
              className="h-5 w-5 text-brand-accent-dark dark:text-brand-accent-light"
              aria-hidden="true"
            />
          ) : (
            <>
              {!loadedImages[model.modelName] &&
                !failedImages[model.modelName] && (
                  <div className="absolute h-5 w-5 rounded-full bg-gray-300 dark:bg-gray-600" />
                )}
              <img
                src={getModelIcon(model)}
                alt=""
                className={`h-5 w-5 transition-opacity duration-200 ${!loadedImages[model.modelName] && !failedImages[model.modelName] ? 'opacity-0' : ''}`}
                onLoad={() => handleImageLoad(model.modelName)}
                onError={() => handleImageError(model.modelName)}
              />
            </>
          )}
        </div>
        {!model.isAuto && model.descriptionShort ? (
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium">{model.name}</span>
            <span className="text-xs text-content-muted">
              {model.descriptionShort}
            </span>
          </div>
        ) : (
          <span className="flex-1 font-medium">{model.name}</span>
        )}
        {isSelected && (
          <CheckIcon
            className="h-4 w-4 flex-none text-brand-accent-dark dark:text-brand-accent-light"
            aria-hidden="true"
          />
        )}
      </button>
    )
  }

  return (
    <div
      ref={menuRef}
      data-model-menu
      role="menu"
      aria-label="Select a model"
      className={`absolute z-50 w-[280px] overflow-y-auto rounded-lg border border-border-subtle bg-surface-chat p-2 font-aeonik-fono text-content-secondary shadow-lg ${dynamicStyles.bottom ? 'mb-2' : 'mt-2'}`}
      style={{
        maxHeight: dynamicStyles.maxHeight,
        ...(dynamicStyles.bottom && { bottom: dynamicStyles.bottom }),
        ...(dynamicStyles.top && { top: dynamicStyles.top }),
        ...(dynamicStyles.left && { left: dynamicStyles.left }),
        ...(dynamicStyles.right && { right: dynamicStyles.right }),
      }}
      onTouchStart={(e) => {
        e.stopPropagation()
        isScrollingRef.current = false
      }}
      onTouchMove={(e) => {
        e.stopPropagation()
        isScrollingRef.current = true
      }}
      onTouchEnd={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {autoModels.map((model) => renderModelItem(model))}

      {autoModels.length > 0 && (
        <div className="mx-3 my-1 border-t border-border-subtle" />
      )}

      {topModels.map((model) => renderModelItem(model))}

      {(showEffort || showThinkingToggle) && (
        <div className="mx-3 my-1 border-t border-border-subtle" />
      )}

      {showEffort && (
        <>
          <button
            type="button"
            aria-expanded={showEffortOptions}
            className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm font-medium text-content-secondary transition-colors hover:bg-surface-card/70"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setShowEffortOptions((prev) => !prev)
            }}
            onTouchEnd={(e) => {
              e.stopPropagation()
              if (isScrollingRef.current) return
              e.preventDefault()
              setShowEffortOptions((prev) => !prev)
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span>Effort</span>
            <span className="flex items-center gap-1 text-content-muted">
              <span className="text-xs">
                {isThinkingActive ? currentEffort.label : 'Off'}
              </span>
              <ChevronRightIcon
                className={`h-4 w-4 transition-transform ${showEffortOptions ? 'rotate-90' : ''}`}
                aria-hidden="true"
              />
            </span>
          </button>

          {showEffortOptions && (
            <>
              <p className="px-3 py-1 text-xs text-content-muted">
                {EFFORT_EXPLAINER}
              </p>
              {EFFORT_OPTIONS.map((option) => {
                const isActive =
                  isThinkingActive && reasoningEffort === option.value
                const handleSelect = () => {
                  if (showThinkingToggle && !thinkingEnabled) {
                    onThinkingEnabledChange?.(true)
                  }
                  onEffortChange?.(option.value)
                }
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    className={`relative flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${isActive ? 'text-content-primary' : 'cursor-pointer text-content-secondary hover:bg-surface-card/70'}`}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleSelect()
                    }}
                    onTouchEnd={(e) => {
                      e.stopPropagation()
                      if (isScrollingRef.current) return
                      e.preventDefault()
                      handleSelect()
                    }}
                  >
                    <span className="font-medium">{option.label}</span>
                    {option.value === DEFAULT_EFFORT && (
                      <span className="rounded bg-surface-card px-1.5 py-0.5 text-xs text-content-muted">
                        Default
                      </span>
                    )}
                    <span className="flex-1" />
                    {isActive && (
                      <CheckIcon
                        className="h-4 w-4 flex-none text-brand-accent-dark dark:text-brand-accent-light"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                )
              })}
            </>
          )}
        </>
      )}

      {showThinkingToggle && (
        <>
          {showEffort && showEffortOptions && (
            <div className="mx-3 my-1 border-t border-border-subtle" />
          )}
          <button
            type="button"
            role="switch"
            aria-checked={thinkingEnabled}
            className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-content-secondary transition-colors hover:bg-surface-card/70"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onThinkingEnabledChange?.(!thinkingEnabled)
            }}
            onTouchEnd={(e) => {
              e.stopPropagation()
              if (isScrollingRef.current) return
              e.preventDefault()
              onThinkingEnabledChange?.(!thinkingEnabled)
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span>Thinking</span>
              <span className="text-xs font-normal text-content-muted">
                Can think for more complex tasks
              </span>
            </div>
            <span
              aria-hidden="true"
              className={`relative h-5 w-9 flex-none rounded-full border border-border-subtle transition-colors after:absolute after:left-[1px] after:top-[1px] after:h-4 after:w-4 after:rounded-full after:shadow-sm after:transition-all after:content-[''] ${thinkingEnabled ? 'bg-brand-accent-light after:translate-x-full after:bg-white' : 'bg-content-muted/40 after:bg-content-muted/70'}`}
            />
          </button>
        </>
      )}

      {otherModels.length > 0 && (
        <>
          <div className="mx-3 my-1 border-t border-border-subtle" />
          <button
            type="button"
            aria-expanded={showOtherModels}
            className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm font-medium text-content-secondary transition-colors hover:bg-surface-card/70"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setShowOtherModels((prev) => !prev)
            }}
            onTouchEnd={(e) => {
              e.stopPropagation()
              if (isScrollingRef.current) return
              e.preventDefault()
              setShowOtherModels((prev) => !prev)
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span>Other models</span>
            <ChevronDownIcon
              className={`h-4 w-4 text-content-muted transition-transform ${showOtherModels ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>

          {showOtherModels &&
            otherModels.map((model) => renderModelItem(model))}
        </>
      )}
    </div>
  )
}
