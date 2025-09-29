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
  let response: Response
  try {
    response = await fetch(proxyUrl, requestInit)
  } catch (err: unknown) {
    // Preserve abort semantics so callers that special-case AbortError still work
    const anyErr = err as any
    if (
      (typeof DOMException !== 'undefined' &&
        anyErr instanceof DOMException &&
        anyErr.name === 'AbortError') ||
      anyErr?.name === 'AbortError'
    ) {
      throw err
    }

    const msg = anyErr?.message || 'Unknown network error'
    throw new ChatError(`Network request failed: ${msg}`, 'FETCH_ERROR')
  }
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
