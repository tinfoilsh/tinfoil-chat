// Base model type with all possible properties
export type BaseModel = {
  modelName: string
  image: string
  enclave: string
  repo?: string
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
  paid?: boolean
  endpoint?: string
}

// Define the return type of getAIModels
export type AIModel = BaseModel


// Fetch models from the API
export const getAIModels = async (paid: boolean): Promise<AIModel[]> => {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || ''
    const endpoint = paid ? '/api/app/models?paid=true' : '/api/app/models'
    const url = `${baseUrl}${endpoint}`
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`)
    }
    
    const models: AIModel[] = await response.json()
    return models
  } catch (error) {
    console.error('Error fetching models:', error)
    // Return empty array as fallback
    return []
  }
}

// Fetch system prompt from the API
export const getSystemPrompt = async (): Promise<string> => {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || ''
    const url = `${baseUrl}/api/app/system-prompt`
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch system prompt: ${response.status}`)
    }
    
    const data = await response.json()
    return `<system>\n${data.systemPrompt}\n</system>`
  } catch (error) {
    console.error('Error fetching system prompt:', error)
    // Return a basic fallback system prompt
    return `<system> You are an intelligent and helpful assistant named Tin. </system>`
  }
}
