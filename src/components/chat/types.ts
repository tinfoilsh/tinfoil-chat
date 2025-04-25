export type Message = {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  thoughts?: string
  isThinking?: boolean
  isError?: boolean
}

export type Chat = {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
}

export type LoadingState = 'idle' | 'loading' | 'streaming'

export type AIModel = string

export type ModelInfo = {
  name: string
  modelNameSimple: string
  description: string
  image: string
  repo?: string
  enclave: string
  endpoint?: string
  digest?: string
}

export type LabelType = 'verify' | 'model' | 'info' | null
