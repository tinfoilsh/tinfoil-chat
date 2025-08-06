import { isModelNameAvailable, type BaseModel } from '@/app/config/models'
import { logWarning } from '@/utils/error-handling'
import { useCallback, useEffect, useState } from 'react'
import { CONSTANTS } from '../constants'
import type { AIModel, LabelType } from '../types'

interface UseModelManagementProps {
  models: BaseModel[]
  isPremium: boolean
  isClient: boolean
  storeHistory: boolean
  subscriptionLoading?: boolean
}

interface UseModelManagementReturn {
  selectedModel: AIModel
  expandedLabel: LabelType
  setExpandedLabel: (label: LabelType) => void
  setVerificationComplete: (complete: boolean) => void
  setVerificationSuccess: (success: boolean) => void
  verificationComplete: boolean
  verificationSuccess: boolean
  handleModelSelect: (modelName: AIModel) => void
  handleLabelClick: (
    label: 'verify' | 'model' | 'info',
    action: () => void,
  ) => void
}

export function useModelManagement({
  models,
  isPremium,
  isClient,
  storeHistory,
  subscriptionLoading = false,
}: UseModelManagementProps): UseModelManagementReturn {
  // Model state - initialize with saved model or temporary default
  const [selectedModel, setSelectedModel] = useState<AIModel>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('selectedModel')
      if (saved) {
        return saved as AIModel
      }
    }
    // Use DEFAULT_MODEL only as a temporary placeholder
    // It will be replaced with the first available model from config
    return CONSTANTS.DEFAULT_MODEL
  })

  // Track if we've validated against the loaded models
  const [hasValidated, setHasValidated] = useState(false)

  // Add state for expanded label
  const [expandedLabel, setExpandedLabel] = useState<LabelType>(null)

  // Verification state
  const [verificationComplete, setVerificationComplete] = useState(false)
  const [verificationSuccess, setVerificationSuccess] = useState(false)

  // Effect to validate selected model when models are available and subscription status is loaded
  useEffect(() => {
    if (
      models.length > 0 &&
      isClient &&
      !hasValidated &&
      !subscriptionLoading
    ) {
      setHasValidated(true)

      // Get all available chat models for this user
      const availableChatModels = models.filter(
        (model) =>
          model.type === 'chat' &&
          model.chat === true &&
          isModelNameAvailable(model.modelName as AIModel, models, isPremium),
      )

      if (availableChatModels.length === 0) {
        logWarning('No chat models available', {
          component: 'useModelManagement',
          action: 'validateModel',
          metadata: { isPremium, modelCount: models.length },
        })
        return
      }

      // Check if current model (from localStorage or default) is valid
      if (isModelNameAvailable(selectedModel, models, isPremium)) {
        // Model is valid, just ensure it's saved
        localStorage.setItem('selectedModel', selectedModel)
        return
      }

      // Otherwise, use the first available model from config
      const firstAvailableModel = availableChatModels[0].modelName as AIModel
      setSelectedModel(firstAvailableModel)
      localStorage.setItem('selectedModel', firstAvailableModel)

      logWarning(
        `Model ${selectedModel} is not available, switching to ${firstAvailableModel}`,
        {
          component: 'useModelManagement',
          action: 'validateModel',
          metadata: {
            previousModel: selectedModel,
            isPremium,
            availableModels: availableChatModels.map((m) => m.modelName),
          },
        },
      )
    }
  }, [
    models,
    isPremium,
    isClient,
    hasValidated,
    selectedModel,
    subscriptionLoading,
  ])

  // Handle model selection
  const handleModelSelect = useCallback(
    (modelName: AIModel) => {
      // Prevent free users from changing models
      if (!storeHistory) return

      // Verify the model is available for the user
      if (!isModelNameAvailable(modelName, models, isPremium)) {
        logWarning(
          `Model ${modelName} is not available for the current subscription level`,
          {
            component: 'useModelManagement',
            action: 'handleModelSelect',
            metadata: { modelName, isPremium },
          },
        )
        return
      }

      setSelectedModel(modelName)
      setExpandedLabel(null)

      // Save to local storage
      localStorage.setItem('selectedModel', modelName)
    },
    [storeHistory, models, isPremium],
  )

  // Handle label click
  const handleLabelClick = useCallback(
    (label: 'verify' | 'model' | 'info', action: () => void) => {
      if (expandedLabel === label) {
        // If already expanded, perform the action
        action()
        setExpandedLabel(null)
      } else {
        // If not expanded or different label is expanded, expand this one
        setExpandedLabel(label)
      }
    },
    [expandedLabel],
  )

  return {
    selectedModel,
    expandedLabel,
    setExpandedLabel,
    setVerificationComplete,
    setVerificationSuccess,
    verificationComplete,
    verificationSuccess,
    handleModelSelect,
    handleLabelClick,
  }
}
