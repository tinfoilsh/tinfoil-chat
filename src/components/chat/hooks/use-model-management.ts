import { isModelNameAvailable, type BaseModel } from '@/app/config/models'
import { logError, logWarning } from '@/utils/error-handling'
import { useCallback, useEffect, useState } from 'react'
import { CONSTANTS } from '../constants'
import type { AIModel, LabelType } from '../types'

interface UseModelManagementProps {
  models: BaseModel[]
  isPremium: boolean
  isClient: boolean
  storeHistory: boolean
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
}: UseModelManagementProps): UseModelManagementReturn {
  // Model state
  const [selectedModel, setSelectedModel] = useState<AIModel>(() => {
    // For initial load, use the constant default
    // The effect below will update it with proper validation
    return CONSTANTS.DEFAULT_MODEL
  })

  // Add state for expanded label
  const [expandedLabel, setExpandedLabel] = useState<LabelType>(null)

  // Verification state
  const [verificationComplete, setVerificationComplete] = useState(false)
  const [verificationSuccess, setVerificationSuccess] = useState(false)

  // Effect to validate and update selected model when models are loaded
  useEffect(() => {
    if (models.length > 0 && isClient) {
      const savedModel = sessionStorage.getItem('selectedModel')

      // Try saved model first, then current selected model, then default
      const preferredModel = savedModel || selectedModel

      if (isModelNameAvailable(preferredModel, models, isPremium)) {
        // Preferred model is available, use it
        if (preferredModel !== selectedModel) {
          setSelectedModel(preferredModel)
          sessionStorage.setItem('selectedModel', preferredModel)
        }
      } else {
        // Preferred model not available, use the default
        // If default isn't available either, that's a configuration error
        if (isModelNameAvailable(CONSTANTS.DEFAULT_MODEL, models, isPremium)) {
          setSelectedModel(CONSTANTS.DEFAULT_MODEL)
          sessionStorage.setItem('selectedModel', CONSTANTS.DEFAULT_MODEL)
        } else {
          logError(
            'Default model not available - configuration error',
            undefined,
            {
              component: 'useModelManagement',
              action: 'validateModel',
              metadata: { defaultModel: CONSTANTS.DEFAULT_MODEL, isPremium },
            },
          )
          // Don't crash, but log the error - the interface should handle this gracefully
        }
      }
    }
  }, [models, isPremium, isClient, selectedModel])

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
      setVerificationComplete(false) // Reset verification state
      setVerificationSuccess(false) // Reset verification success state

      // Trigger re-verification in the sidebar by dispatching a custom event
      if (typeof window !== 'undefined') {
        const resetEvent = new CustomEvent('reset-verification')
        window.dispatchEvent(resetEvent)
      }

      // Save to session storage
      sessionStorage.setItem('selectedModel', modelName)
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
