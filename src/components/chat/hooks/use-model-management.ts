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
  // Track the last known premium status to detect changes
  const [lastKnownPremiumStatus, setLastKnownPremiumStatus] = useState<
    boolean | null
  >(null)

  // Add state for expanded label
  const [expandedLabel, setExpandedLabel] = useState<LabelType>(null)

  // Verification state
  const [verificationComplete, setVerificationComplete] = useState(false)
  const [verificationSuccess, setVerificationSuccess] = useState(false)

  // Effect to validate selected model when models are available and subscription status is loaded
  useEffect(() => {
    // Check if premium status has changed
    const premiumStatusChanged =
      lastKnownPremiumStatus !== null && lastKnownPremiumStatus !== isPremium

    if (
      models.length > 0 &&
      isClient &&
      (!hasValidated || premiumStatusChanged) &&
      !subscriptionLoading
    ) {
      setHasValidated(true)
      setLastKnownPremiumStatus(isPremium)

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

      // Determine the best model for this user
      let targetModel: AIModel = selectedModel

      // For premium users, always prefer premium models
      if (isPremium) {
        const currentModelData = models.find(
          (m) => m.modelName === selectedModel,
        )

        // Check if current model is free (including when paid field is undefined or false)
        const isCurrentModelFree =
          !currentModelData || currentModelData.paid !== true

        // Upgrade to premium model if currently using a free model
        if (
          isCurrentModelFree ||
          !isModelNameAvailable(selectedModel, models, isPremium)
        ) {
          const premiumModels = availableChatModels.filter(
            (m) => m.paid === true,
          )
          if (premiumModels.length > 0) {
            targetModel = premiumModels[0].modelName as AIModel
            logWarning(
              `Premium user detected with free model, upgrading to premium model`,
              {
                component: 'useModelManagement',
                action: 'validateModel',
                metadata: {
                  previousModel: selectedModel,
                  newModel: targetModel,
                  isPremium,
                  isCurrentModelFree,
                  currentModelData,
                },
              },
            )
          } else {
            // Fallback to first available model if no premium models
            targetModel = availableChatModels[0].modelName as AIModel
          }
        }
      } else {
        // For free users, validate current model or use first available
        if (!isModelNameAvailable(selectedModel, models, isPremium)) {
          targetModel = availableChatModels[0].modelName as AIModel
        }
      }

      // Update model if changed
      if (targetModel !== selectedModel) {
        setSelectedModel(targetModel)
        logWarning(
          `Model ${selectedModel} is not optimal, switching to ${targetModel}`,
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

      // Always save the validated model
      localStorage.setItem('selectedModel', targetModel)
    }
  }, [
    models,
    isPremium,
    isClient,
    hasValidated,
    selectedModel,
    subscriptionLoading,
    lastKnownPremiumStatus,
  ])

  // Handle model selection
  const handleModelSelect = useCallback(
    (modelName: AIModel) => {
      // Allow Dev Simulator for all users in development
      const isDevSimulator = modelName === 'dev-simulator'

      // Prevent free users from changing models (except Dev Simulator)
      if (!storeHistory && !isDevSimulator) return

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
