import type { AIModel } from './types'

export const CONSTANTS = {
  LOADING_TIMEOUT: 500,
  MOBILE_BREAKPOINT: 1024,
  DEFAULT_MODEL: 'llama3-3-70b' as AIModel,
  DEFAULT_FREE_MODEL: 'llama3-3-70b' as AIModel,
  RATE_LIMIT_STORAGE_KEY: 'chat_messages_timestamps',
  RATE_LIMIT_WINDOW_HOURS: 12,
} as const

export const MAX_PROMPT_MESSAGES = 10
