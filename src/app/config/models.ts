import { API_BASE_URL } from '@/config'
import { DEV_SIMULATOR_MODEL } from '@/utils/dev-simulator'
import { logError } from '@/utils/error-handling'

// Base model type with all possible properties
export type BaseModel = {
  modelName: string
  image: string
  name: string
  nameShort: string
  description: string
  details?: string
  parameters?: string
  contextWindow?: string
  recommendedUse?: string
  supportedLanguages?: string
  type: 'chat' | 'embedding' | 'audio' | 'tts' | 'document'
  chat?: boolean
  paid?: boolean
  multimodal?: boolean
  endpoint?: string
}

// Helper function to determine if a model is available for a given subscription status
export const isModelAvailable = (
  model: BaseModel,
  isPremium: boolean,
): boolean => {
  // If paid is undefined or false, it's a free model - always available
  if (model.paid === undefined || model.paid === false) {
    return true
  }

  // If paid is true, it's only available for premium users
  return isPremium
}

// Helper function to filter models for chat interface
export const getAvailableChatModels = (
  models: BaseModel[],
  isPremium: boolean,
): BaseModel[] => {
  return models.filter(
    (model) =>
      // Must be a chat model
      model.type === 'chat' &&
      model.chat === true &&
      // Show models that are available for the user's subscription level
      isModelAvailable(model, isPremium),
  )
}

// Helper function to validate if a specific model name is available for a user
export const isModelNameAvailable = (
  modelName: string,
  models: BaseModel[],
  isPremium: boolean,
): boolean => {
  const model = models.find((m) => m.modelName === modelName)
  if (!model) {
    return false
  }

  return (
    model.type === 'chat' &&
    model.chat === true &&
    // Use the standard availability check
    isModelAvailable(model, isPremium)
  )
}

// Helper function to check if running in local development
const isLocalDevelopment = (): boolean => {
  return (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.startsWith('192.168.') ||
      window.location.hostname.startsWith('10.'))
  )
}

// Fetch models from the API
export const getAIModels = async (paid: boolean): Promise<BaseModel[]> => {
  const isLocalDev = isLocalDevelopment()

  try {
    const endpoint = paid ? '/api/app/models?paid=true' : '/api/app/models'
    const url = `${API_BASE_URL}${endpoint}`
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`)
    }

    const models: BaseModel[] = await response.json()

    // Add Dev Simulator model when running locally
    if (isLocalDev) {
      console.log('🧪 Dev Simulator enabled for local development')
      models.unshift(DEV_SIMULATOR_MODEL)
    }

    return models
  } catch (error) {
    logError('Failed to fetch AI models', error, {
      component: 'getAIModels',
      metadata: { paid },
    })
    // Return empty array as fallback (with Dev model in development)
    if (isLocalDev) {
      return [DEV_SIMULATOR_MODEL]
    }
    return []
  }
}

// Fetch system prompt and rules from the API
export const getSystemPromptAndRules = async (): Promise<{
  systemPrompt: string
  rules: string
}> => {
  try {
    const url = `${API_BASE_URL}/api/app/system-prompt`
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Failed to fetch system prompt: ${response.status}`)
    }

    const data = await response.json()
    return {
      systemPrompt: `<system>\n${data.systemPrompt}\n</system>`,
      rules: data.rules,
    }
  } catch (error) {
    logError('Failed to fetch system prompt', error, {
      component: 'getSystemPromptAndRules',
    })
    // Return a basic fallback
    return {
      systemPrompt: `<system> You are an intelligent and helpful assistant named Tin. </system>`,
      rules: '',
    }
  }
}
