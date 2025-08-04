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
  // Model state - initialize with saved model if available
  const [selectedModel, setSelectedModel] = useState<AIModel>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('selectedModel')
      if (saved) {
        return saved as AIModel
      }
    }
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

      // Check if current selected model exists in the available models list
      const modelExists = models.find((m) => m.modelName === selectedModel)

      // For premium users, also check if the selected model is a premium model
      const needsFallback =
        !modelExists || (isPremium && modelExists && modelExists.paid !== true)

      if (needsFallback) {
        // Find appropriate fallback model
        const availableChatModels = models.filter(
          (model) =>
            model.type === 'chat' &&
            model.chat === true &&
            // For premium users, only consider premium models
            ((isPremium && model.paid === true) || (!isPremium && model.paid !== true)),
        )

        if (availableChatModels.length > 0) {
          const fallbackModel = availableChatModels[0].modelName as AIModel
          setSelectedModel(fallbackModel)
          localStorage.setItem('selectedModel', fallbackModel)

          logWarning(
            `Model ${selectedModel} is not appropriate for subscription level, switching to ${fallbackModel}`,
            {
              component: 'useModelManagement',
              action: 'validateModel',
              metadata: {
                previousModel: selectedModel,
                isPremium,
                reason: !modelExists
                  ? 'not_found'
                  : 'free_model_for_premium_user',
              },
            },
          )
        }
      }
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
