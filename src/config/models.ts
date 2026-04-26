import { API_BASE_URL, IS_DEV } from '@/config'
import { DEV_SIMULATOR_MODEL } from '@/utils/dev-simulator'
import { logError } from '@/utils/error-handling'

const DEV_MODELS: BaseModel[] = [
  {
    modelName: 'gemma4-31b',
    image: 'google.webp',
    name: 'Gemma 4 31B',
    nameShort: 'Gemma 4',
    description: 'Google Gemma 4 31B',
    type: 'chat',
    chat: true,
    multimodal: true,
    reasoning: true,
    requestParams: { chat_template_kwargs: { enable_thinking: true } },
  },
  {
    modelName: 'kimi-k2-6',
    image: 'moonshot.png',
    name: 'Kimi K2.6',
    nameShort: 'Kimi K2.6',
    description: 'Moonshot Kimi K2.6',
    type: 'chat',
    chat: true,
    multimodal: true,
  },
]

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
  type: 'chat' | 'code' | 'embedding' | 'audio' | 'tts' | 'document' | 'title'
  chat?: boolean
  paid?: boolean
  multimodal?: boolean
  toolCalling?: boolean
  reasoning?: boolean
  endpoint?: string
  /** Extra fields merged into the chat completion request body */
  requestParams?: Record<string, unknown>
}

// Helper function to validate if a specific model name exists in the models list
export const isModelNameAvailable = (
  modelName: string,
  models: BaseModel[],
): boolean => {
  return models.some((m) => m.modelName === modelName)
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
export const getAIModels = async (): Promise<BaseModel[]> => {
  const isLocalDev = isLocalDevelopment()

  // In dev mode on localhost, return hardcoded models instead of fetching
  if (IS_DEV && isLocalDev) {
    return [...DEV_MODELS, DEV_SIMULATOR_MODEL]
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/config/models`)

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`)
    }

    const allModels: BaseModel[] = await response.json()

    // Remove free chat models — they are handled server-side via
    // free-tier API keys and should never appear in the UI.
    const models = allModels.filter(
      (m) => !(m.paid === false && m.chat === true),
    )

    // Add Dev Simulator model when running locally
    if (isLocalDev) {
      models.unshift(DEV_SIMULATOR_MODEL)
    }

    return models
  } catch (error) {
    logError('Failed to fetch AI models', error, {
      component: 'getAIModels',
    })
    return []
  }
}

// Fetch system prompt and rules from the API
export const getSystemPromptAndRules = async (): Promise<{
  systemPrompt: string
  rules: string
}> => {
  try {
    const url = `${API_BASE_URL}/api/config/system-prompt`
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Failed to fetch system prompt: ${response.status}`)
    }

    const data = await response.json()
    return {
      systemPrompt: data.systemPrompt,
      rules: data.rules,
    }
  } catch (error) {
    logError('Failed to fetch system prompt', error, {
      component: 'getSystemPromptAndRules',
    })
    // Return a basic fallback
    return {
      systemPrompt: 'You are an intelligent and helpful assistant named Tin.',
      rules: '',
    }
  }
}

// Fetch memory prompt from the API
export const getMemoryPrompt = async (): Promise<string> => {
  try {
    const url = `${API_BASE_URL}/api/config/memory-prompt`
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Failed to fetch memory prompt: ${response.status}`)
    }

    const data = await response.json()
    return data.memoryPrompt
  } catch (error) {
    logError('Failed to fetch memory prompt', error, {
      component: 'getMemoryPrompt',
    })
    return ''
  }
}
