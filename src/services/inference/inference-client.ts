import { ChatError } from '@/components/chat/chat-utils'
import { CONSTANTS } from '@/components/chat/constants'
import {
  isReasoningModel,
  type ReasoningEffort,
} from '@/components/chat/hooks/use-reasoning-effort'
import type { Message } from '@/components/chat/types'
import type { BaseModel } from '@/config/models'
import { logError, logInfo } from '@/utils/error-handling'
import { ChatQueryBuilder } from './chat-query-builder'
import { getTinfoilClient } from './tinfoil-client'

function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableError(error: unknown): boolean {
  const anyErr = error as any

  // Don't retry user-initiated aborts
  if (
    (typeof DOMException !== 'undefined' &&
      anyErr instanceof DOMException &&
      anyErr.name === 'AbortError') ||
    anyErr?.name === 'AbortError'
  ) {
    return false
  }

  // Retry network errors
  if (
    anyErr?.message?.includes('network') ||
    anyErr?.message?.includes('fetch')
  ) {
    return true
  }

  // Retry connection errors
  if (
    anyErr?.message?.includes('connection') ||
    anyErr?.message?.includes('ECONNRESET')
  ) {
    return true
  }

  // Retry timeout errors
  if (
    anyErr?.message?.includes('timeout') ||
    anyErr?.message?.includes('ETIMEDOUT')
  ) {
    return true
  }

  // Retry 5xx server errors
  if (anyErr?.status >= 500 && anyErr?.status < 600) {
    return true
  }

  // Retry 429 rate limit errors
  if (anyErr?.status === 429) {
    return true
  }

  // Default to retrying for unknown errors (network issues often don't have clear types)
  return true
}

export interface SendChatStreamParams {
  model: BaseModel
  systemPrompt: string
  rules?: string
  onRetry?: (attempt: number, maxRetries: number) => void
  updatedMessages: Message[]
  maxMessages: number
  signal: AbortSignal
  reasoningEffort?: ReasoningEffort
}

export async function sendChatStream(
  params: SendChatStreamParams,
): Promise<Response> {
  const {
    model,
    systemPrompt,
    rules,
    onRetry,
    updatedMessages,
    maxMessages,
    signal,
    reasoningEffort,
  } = params

  if (model.modelName === 'dev-simulator') {
    const simulatorUrl = '/api/dev/simulator'
    const messages = ChatQueryBuilder.buildMessages({
      model,
      systemPrompt,
      rules,
      messages: updatedMessages,
      maxMessages,
    })

    try {
      const response = await fetch(simulatorUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model.modelName,
          messages,
          stream: true,
        }),
        signal,
      })

      if (!response.ok) {
        if (response.status === 404) {
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
    } catch (err: unknown) {
      const anyErr = err as any
      if (
        (typeof DOMException !== 'undefined' &&
          anyErr instanceof DOMException &&
          anyErr.name === 'AbortError') ||
        anyErr?.name === 'AbortError'
      ) {
        throw err
      }

      if (err instanceof ChatError) {
        throw err
      }

      const msg = anyErr?.message || 'Unknown network error'
      throw new ChatError(`Network request failed: ${msg}`, 'FETCH_ERROR')
    }
  }

  const messages = ChatQueryBuilder.buildMessages({
    model,
    systemPrompt,
    rules,
    messages: updatedMessages,
    maxMessages,
  })

  let lastError: unknown = null
  const maxRetries = CONSTANTS.MESSAGE_SEND_MAX_RETRIES

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check if aborted before attempting
    if (signal.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    // Wait for connection if offline (except for first attempt)
    if (attempt > 0 && !isOnline()) {
      logInfo('Waiting for internet connection before retry', {
        component: 'inference-client',
        action: 'sendChatStream',
        metadata: { attempt, maxRetries },
      })
      // Wait up to 10 seconds for connection to return
      const connectionWaitStart = Date.now()
      while (!isOnline() && Date.now() - connectionWaitStart < 10000) {
        if (signal.aborted) {
          throw new DOMException('Aborted', 'AbortError')
        }
        await delay(500)
      }
    }

    try {
      const client = await getTinfoilClient()
      await client.ready()

      const stream = await client.chat.completions.create(
        {
          model: model.modelName,
          messages,
          stream: true,
          // Only include reasoning_effort for gpt-oss models
          ...(isReasoningModel(model.modelName) &&
            reasoningEffort && { reasoning_effort: reasoningEffort }),
        },
        { signal },
      )

      const encoder = new TextEncoder()
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of stream) {
              if (signal.aborted) {
                controller.close()
                return
              }
              const sseData = `data: ${JSON.stringify(chunk)}\n\n`
              controller.enqueue(encoder.encode(sseData))
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
          } catch (error) {
            logError('Stream processing error', error, {
              component: 'inference-client',
              action: 'sendChatStream',
            })
            controller.error(error)
          }
        },
      })

      return new Response(readableStream, {
        headers: { 'Content-Type': 'text/event-stream' },
      })
    } catch (err: unknown) {
      lastError = err
      const anyErr = err as any

      // Don't retry aborted requests
      if (
        (typeof DOMException !== 'undefined' &&
          anyErr instanceof DOMException &&
          anyErr.name === 'AbortError') ||
        anyErr?.name === 'AbortError'
      ) {
        throw err
      }

      // Check if we should retry
      if (attempt < maxRetries && isRetryableError(err)) {
        const backoffDelay =
          CONSTANTS.MESSAGE_SEND_RETRY_DELAY_MS * Math.pow(2, attempt)

        logInfo('Retrying chat stream request', {
          component: 'inference-client',
          action: 'sendChatStream',
          metadata: {
            attempt: attempt + 1,
            maxRetries,
            delayMs: backoffDelay,
            error: anyErr?.message,
          },
        })

        // Notify caller that we're retrying
        onRetry?.(attempt + 1, maxRetries)

        await delay(backoffDelay)
        continue
      }

      // Log final failure
      logError('Chat stream request failed after retries', err, {
        component: 'inference-client',
        action: 'sendChatStream',
        metadata: {
          model: model.modelName,
          attempts: attempt + 1,
          error: anyErr?.message,
          stack: anyErr?.stack,
        },
      })

      const msg = anyErr?.message || 'Unknown network error'
      throw new ChatError(`Network request failed: ${msg}`, 'FETCH_ERROR')
    }
  }

  // This should not be reached, but just in case
  const anyErr = lastError as any
  const msg = anyErr?.message || 'Unknown network error'
  throw new ChatError(
    `Network request failed after ${maxRetries} retries: ${msg}`,
    'FETCH_ERROR',
  )
}
