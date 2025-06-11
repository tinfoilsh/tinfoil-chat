import { API_BASE_URL } from '@/config'
import { logError } from '@/utils/error-handling'

// Type for enclave/repo that can be either string or object with free/paid options
type EnclaveRepo = string | { free: string; paid: string }

// Base model type with all possible properties
export type BaseModel = {
  modelName: string
  image: string
  enclave: EnclaveRepo
  repo?: EnclaveRepo
  digest?: string
  name: string
  nameShort: string
  description: string
  details?: string
  parameters?: string
  contextWindow?: string
  recommendedUse?: string
  supportedLanguages?: string
  type: "chat" | "embedding" | "audio" | "tts"
  chat?: boolean
  paid?: boolean | "conditional"
  endpoint?: string
}

// Helper function to resolve enclave/repo based on subscription status
export const resolveEnclaveOrRepo = (
  value: EnclaveRepo, 
  isPaid: boolean
): string => {
  if (typeof value === 'string') {
    return value
  }
  
  // For object format, return paid if user has subscription, otherwise free
  return isPaid ? value.paid : value.free
}

// Helper function to determine if a model is available for a given subscription status
export const isModelAvailable = (model: BaseModel, isPremium: boolean): boolean => {
  // Handle different paid model types
  if (model.paid === undefined || model.paid === false) {
    // Free models - always available
    return true
  } else if (model.paid === true) {
    // Premium-only models - only available if user is premium
    return isPremium
  } else if (model.paid === 'conditional') {
    // Conditional models (available for both free and premium) - always available
    return true
  }
  
  return false
}

// Helper function to filter models for chat interface
export const getAvailableChatModels = (models: BaseModel[], isPremium: boolean): BaseModel[] => {
  return models.filter(model => 
    // Must be a chat model
    model.type === 'chat' &&
    model.chat === true &&
    // Must be available for the user's subscription level
    isModelAvailable(model, isPremium)
  )
}

// Helper function to validate if a specific model name is available for a user
export const isModelNameAvailable = (
  modelName: string, 
  models: BaseModel[], 
  isPremium: boolean
): boolean => {
  const model = models.find(m => m.modelName === modelName)
  if (!model) {
    return false
  }
  
  return model.type === 'chat' && 
         model.chat === true && 
         isModelAvailable(model, isPremium)
}



// Fetch models from the API
export const getAIModels = async (paid: boolean): Promise<BaseModel[]> => {
  try {
    const endpoint = paid ? '/api/app/models?paid=true' : '/api/app/models'
    const url = `${API_BASE_URL}${endpoint}`
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`)
    }
    
    const models: BaseModel[] = await response.json()
    return models
  } catch (error) {
    logError('Failed to fetch AI models', error, { 
      component: 'getAIModels',
      metadata: { isPremium }
    })
    // Return empty array as fallback
    return []
  }
}

// Fetch system prompt from the API
export const getSystemPrompt = async (): Promise<string> => {
  try {
    const url = `${API_BASE_URL}/api/app/system-prompt`
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch system prompt: ${response.status}`)
    }
    
    const data = await response.json()
    return `<system>\n${data.systemPrompt}\n</system>`
  } catch (error) {
    logError('Failed to fetch system prompt', error, { 
      component: 'getSystemPrompt'
    })
    // Return a basic fallback system prompt
    return `<system> You are an intelligent and helpful assistant named Tin. </system>`
  }
}
