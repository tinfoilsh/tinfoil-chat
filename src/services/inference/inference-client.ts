import { ChatError } from '@/components/chat/chat-utils'
import { CONSTANTS } from '@/components/chat/constants'
import {
  isReasoningModel,
  type ReasoningEffort,
} from '@/components/chat/hooks/use-reasoning-effort'
import type { Message } from '@/components/chat/types'
import type { BaseModel } from '@/config/models'
import { shouldRetryTestFail } from '@/utils/dev-simulator'
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

  // Default to not retrying - only explicitly identified conditions should trigger retries
  // This prevents unnecessary retries for client errors (4xx) which won't succeed on retry
  return false
}

export interface SendChatStreamParams {
  model: BaseModel
  systemPrompt: string
  rules?: string
  onRetry?: (attempt: number, maxRetries: number, error?: string) => void
  updatedMessages: Message[]
  maxMessages: number
  signal: AbortSignal
  reasoningEffort?: ReasoningEffort
  webSearchEnabled?: boolean
  piiCheckEnabled?: boolean
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
    webSearchEnabled,
    piiCheckEnabled,
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

    // Get the last user message for retry test check
    const lastUserMessage = updatedMessages
      .filter((m) => m.role === 'user')
      .pop()
    const queryText = lastUserMessage?.content || ''

    let lastError: unknown = null
    const maxRetries = CONSTANTS.MESSAGE_SEND_MAX_RETRIES

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (signal.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }

      try {
        // Check if this is a retry test that should fail
        if (shouldRetryTestFail(queryText)) {
          throw new Error('Simulated network error for retry testing')
        }

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
        lastError = err
        const anyErr = err as any

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

          logInfo('Retrying dev simulator request', {
            component: 'inference-client',
            action: 'sendChatStream.devSimulator',
            metadata: {
              attempt: attempt + 1,
              maxRetries,
              delayMs: backoffDelay,
              error: anyErr?.message,
            },
          })

          onRetry?.(attempt + 1, maxRetries, anyErr?.message)

          await delay(backoffDelay)
          continue
        }

        if (err instanceof ChatError) {
          throw err
        }

        const msg = anyErr?.message || 'Unknown network error'
        throw new ChatError(`Network request failed: ${msg}`, 'FETCH_ERROR')
      }
    }

    // Fallback if loop completes without returning
    const anyErr = lastError as any
    const msg = anyErr?.message || 'Unknown network error'
    throw new ChatError(
      `Network request failed after ${maxRetries} retries: ${msg}`,
      'FETCH_ERROR',
    )
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

      // Build request body
      const requestBody: Record<string, unknown> = {
        model: model.modelName,
        messages,
        stream: true,
      }
      if (isReasoningModel(model.modelName) && reasoningEffort) {
        requestBody.reasoning_effort = reasoningEffort
      }
      if (webSearchEnabled) {
        requestBody.web_search_options = {}
      }
      if (piiCheckEnabled) {
        requestBody.pii_check_options = {}
      }

      const stream = await (client.chat.completions.create as Function)(
        requestBody,
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

export interface StructuredCompletionParams {
  model: BaseModel
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  jsonSchema: Record<string, unknown>
  signal?: AbortSignal
}

export async function sendStructuredCompletion<T>(
  params: StructuredCompletionParams,
): Promise<T> {
  const { model, messages, jsonSchema, signal } = params

  const client = await getTinfoilClient()
  await client.ready()

  const response = await client.chat.completions.create(
    {
      model: model.modelName,
      messages,
      stream: false,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'response',
          schema: jsonSchema,
        },
      },
    },
    {
      signal,
    },
  )

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('No content in structured completion response')
  }

  return JSON.parse(content) as T
}
