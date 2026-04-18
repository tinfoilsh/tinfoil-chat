/**
 * Inference client — Vercel AI SDK implementation.
 *
 * Streams chat completions through a verified Tinfoil enclave (via
 * `SecureClient` + pinned fetch) using `streamText`. Tinfoil-specific SSE
 * events (web search, URL fetches, url_citation annotations, search_reasoning)
 * are routed through a pre-parser into a sidechannel so the AI SDK only sees
 * OpenAI-compliant chunks.
 *
 * The dev-simulator model routes to a local HTTP endpoint using the same
 * AI SDK pipeline via a fetch override.
 */
import { ChatError } from '@/components/chat/chat-utils'
import { CONSTANTS } from '@/components/chat/constants'
import type { GENUI_TOOLS as GenUIToolSet } from '@/components/chat/genui/tools'
import { GENUI_TOOLS } from '@/components/chat/genui/tools'
import {
  isReasoningModel,
  type ReasoningEffort,
} from '@/components/chat/hooks/use-reasoning-effort'
import type { Message } from '@/components/chat/types'
import type { BaseModel } from '@/config/models'
import { shouldRetryTestFail } from '@/utils/dev-simulator'
import { logError, logInfo } from '@/utils/error-handling'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel, StreamTextResult } from 'ai'
import { Output, generateText, streamText } from 'ai'
import { z } from 'zod'
import { ChatQueryBuilder } from './chat-query-builder'
import {
  getTinfoilAISdk,
  resetTinfoilAISdk,
  type TinfoilProviderHandle,
} from './tinfoil-ai-sdk'
import {
  createTinfoilSidechannel,
  type TinfoilSidechannel,
} from './tinfoil-sse-preparser'

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

/**
 * The concrete tool set used for chat streaming (the GenUI tools).
 */
export type GenUITools = typeof GenUIToolSet

/**
 * A handle returned by `sendChatStream` that exposes the AI SDK stream plus
 * Tinfoil's sidechannel for custom SSE events.
 */
export interface ChatStreamHandle {
  result: StreamTextResult<GenUITools, never>
  sidechannel: TinfoilSidechannel
}

export async function sendChatStream(
  params: SendChatStreamParams,
): Promise<ChatStreamHandle> {
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
    if (signal.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    // Wait for connection if offline (except first attempt)
    if (attempt > 0 && !isOnline()) {
      logInfo('Waiting for internet connection before retry', {
        component: 'inference-client',
        action: 'sendChatStream',
        metadata: { attempt, maxRetries },
      })
      const connectionWaitStart = Date.now()
      while (!isOnline() && Date.now() - connectionWaitStart < 10000) {
        if (signal.aborted) {
          throw new DOMException('Aborted', 'AbortError')
        }
        await delay(500)
      }
    }

    try {
      let handle: { model: LanguageModel; sidechannel: TinfoilSidechannel }

      if (model.modelName === 'dev-simulator') {
        // Dev simulator — use an OpenAI-compatible provider pointed at the
        // local simulator endpoint. We use a sidechannel for parity even
        // though the simulator does not emit Tinfoil events.
        handle = await getDevSimulatorHandle(updatedMessages)
      } else {
        const tinfoil = await getTinfoilAISdk({
          extensions: {
            webSearch: webSearchEnabled,
            piiCheck: piiCheckEnabled,
          },
        })
        handle = {
          model: tinfoil.chat(model.modelName),
          sidechannel: tinfoil.sidechannel,
        }
      }

      const providerOptions: Record<string, Record<string, string>> = {}
      if (isReasoningModel(model.modelName) && reasoningEffort) {
        providerOptions.tinfoil = { reasoningEffort }
      }

      const result = streamText({
        model: handle.model,
        messages,
        tools: GENUI_TOOLS,
        toolChoice: 'auto',
        abortSignal: signal,
        providerOptions:
          Object.keys(providerOptions).length > 0 ? providerOptions : undefined,
        onError: ({ error }) => {
          logError('streamText internal error', error, {
            component: 'inference-client',
            action: 'sendChatStream.onError',
          })
        },
      })

      return { result, sidechannel: handle.sidechannel }
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

      // On auth errors, reset the provider so the next attempt gets a fresh token.
      if (anyErr?.status === 401 || anyErr?.statusCode === 401) {
        resetTinfoilAISdk()
      }

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

        onRetry?.(attempt + 1, maxRetries, anyErr?.message)

        await delay(backoffDelay)
        continue
      }

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

      if (err instanceof ChatError) {
        throw err
      }

      const msg = anyErr?.message || 'Unknown network error'
      throw new ChatError(`Network request failed: ${msg}`, 'FETCH_ERROR')
    }
  }

  const anyErr = lastError as any
  const msg = anyErr?.message || 'Unknown network error'
  throw new ChatError(
    `Network request failed after ${maxRetries} retries: ${msg}`,
    'FETCH_ERROR',
  )
}

/**
 * Build a LanguageModel pointed at the local dev-simulator HTTP endpoint.
 * The simulator returns plain OpenAI SSE so we can reuse the AI SDK's
 * openai-compatible chat model with a fetch override.
 */
async function getDevSimulatorHandle(updatedMessages: Message[]): Promise<{
  model: LanguageModel
  sidechannel: TinfoilSidechannel
}> {
  const lastUserMessage = updatedMessages.filter((m) => m.role === 'user').pop()
  const queryText = lastUserMessage?.content || ''
  if (shouldRetryTestFail(queryText)) {
    throw new Error('Simulated network error for retry testing')
  }

  const simulatorFetch: typeof fetch = async (_input, init) => {
    return fetch('/api/dev/simulator', {
      method: init?.method ?? 'POST',
      headers: init?.headers,
      body: init?.body,
      signal: init?.signal,
    })
  }

  const provider = createOpenAICompatible({
    name: 'dev-simulator',
    baseURL: 'http://localhost/mock/v1',
    fetch: simulatorFetch,
  })

  return {
    model: provider.chatModel('dev-simulator'),
    // Simulator never emits Tinfoil events — sidechannel exists for API parity.
    sidechannel: createTinfoilSidechannel(),
  }
}

// --- Non-streaming structured completion (Vercel AI SDK) ---

export interface StructuredCompletionParams<SCHEMA extends z.ZodType> {
  model: BaseModel
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  schema: SCHEMA
  signal?: AbortSignal
}

/**
 * Run a non-streaming completion that is constrained to match `schema` and
 * return the parsed, typed payload. The schema is passed through to the
 * provider as a JSON-schema `response_format` and validated client-side via
 * Zod, so the returned value is always safe to consume without casting.
 */
export async function sendStructuredCompletion<SCHEMA extends z.ZodType>(
  params: StructuredCompletionParams<SCHEMA>,
): Promise<z.infer<SCHEMA>> {
  const { model, messages, schema, signal } = params

  const tinfoil = await getTinfoilAISdk()

  const result = await generateText({
    model: tinfoil.chat(model.modelName),
    messages,
    abortSignal: signal,
    output: Output.object({ schema }),
  })

  return result.output as z.infer<SCHEMA>
}

// Keep the handle type exported so the streaming processor can type itself
// without creating a circular import.
export type { TinfoilProviderHandle }
