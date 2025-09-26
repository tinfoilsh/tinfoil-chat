import type { BaseModel } from '@/app/config/models'
import { ChatError } from '@/components/chat/chat-utils'
import type { Message } from '@/components/chat/types'
import { buildChatRequest } from './request-builder'

/**
 * Thin network client for chat streaming.
 * Centralizes fetch + error mapping to ChatError for consistent handling.
 */
export interface SendChatStreamParams {
  model: BaseModel
  systemPrompt: string
  rules?: string
  updatedMessages: Message[]
  maxMessages: number
  getApiKey: () => Promise<string>
  signal: AbortSignal
}

export async function sendChatStream(
  params: SendChatStreamParams,
): Promise<Response> {
  const { proxyUrl, requestInit } = await buildChatRequest(params)
  const response = await fetch(proxyUrl, requestInit)
  if (!response.ok) {
    if (response.status === 404 && params.model.modelName === 'dev-simulator') {
      throw new ChatError(
        'Dev simulator is only available in development environment',
        'FETCH_ERROR',
      )
    }
    throw new ChatError(
      `Server returned ${response.status}: ${response.statusText}`,
      'FETCH_ERROR',
    )
  }
  return response
}
