import { ChatError } from '@/components/chat/chat-utils'
import { CONSTANTS } from '@/components/chat/constants'
import { buildGenUIToolSchemas } from '@/components/chat/genui/registry'
import {
  isReasoningModel,
  supportsReasoningEffort,
  supportsThinkingToggle,
  type ReasoningEffort,
} from '@/components/chat/hooks/use-reasoning-effort'
import type { Message } from '@/components/chat/types'
import type { BaseModel } from '@/config/models'
import { AUTO_MODEL_OPTIONS_FIELD, AUTO_REQUEST_MODEL } from '@/config/models'
import { DEV_SIMULATOR_MODEL, shouldRetryTestFail } from '@/utils/dev-simulator'
import { logError, logInfo } from '@/utils/error-handling'
import {
  PERFORMANCE_METRICS,
  recordPerformanceDuration,
  startPerformanceTimer,
} from '@/utils/performance-metrics'
import { newRunStorage, runAgent, runSimulatedAgent } from './agui/client'
import {
  type AguiEventStream,
  type CodeExecutionOptions,
  type RunAgentInput,
  type RunStorage,
} from './agui/protocol'
import { ChatQueryBuilder } from './chat-query-builder'
import {
  discardRateLimitSnapshot,
  getRateLimitInfo,
  inferenceRequest,
  refreshRateLimit,
} from './tinfoil-client'

// The key a model's `reasoningConfig.params` is filed under, not a URL: the
// inference base URL already ends at the version root.
const CHAT_COMPLETIONS_ENDPOINT = '/v1/chat/completions'

const EFFORT_PLACEHOLDER = '$EFFORT'
const RESERVED_MODEL_BODY_PARAMS = new Set([
  'model',
  'messages',
  'stream',
  'signal',
  'reasoning_effort',
  'web_search_options',
  'code_execution_options',
  'pii_check_options',
  'tools',
  'tool_choice',
  'response_format',
])

/**
 * Recursively clones an object, replacing any string equal to "$EFFORT" with
 * the provided effort value. Used to splice the user-selected reasoning effort
 * into the model's declarative `reasoningConfig.params[endpoint].enable` block
 * without the inference layer needing to know which key the model expects it
 * under (top-level `reasoning_effort`, nested `chat_template_kwargs`, etc.).
 */
function substituteEffort(value: unknown, effort: string): unknown {
  if (typeof value === 'string') {
    return value === EFFORT_PLACEHOLDER ? effort : value
  }
  if (Array.isArray(value)) {
    return value.map((v) => substituteEffort(v, effort))
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = substituteEffort(v, effort)
    }
    return out
  }
  return value
}

/**
 * Builds the model-specific request-body delta for a single model: the
 * reasoning enable/disable block (with the user's effort spliced in) plus the
 * model's own `requestParams`. Shared, model-independent options (web search,
 * code execution, PII check, GenUI tools) are added to the base body by the
 * caller and are intentionally excluded here so this delta can also be sent
 * per-candidate in the Auto `auto_model_options` blob.
 */
function buildModelBodyParams(
  model: BaseModel,
  opts: { thinkingEnabled?: boolean; reasoningEffort?: ReasoningEffort },
): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  if (isReasoningModel(model)) {
    const endpointParams =
      model.reasoningConfig?.params?.[CHAT_COMPLETIONS_ENDPOINT]
    if (endpointParams) {
      const rawBlock = supportsThinkingToggle(model)
        ? opts.thinkingEnabled
          ? endpointParams.enable
          : endpointParams.disable
        : endpointParams.enable
      if (rawBlock) {
        const uiEffort =
          supportsReasoningEffort(model) && opts.reasoningEffort
            ? opts.reasoningEffort
            : 'medium'
        const effort = model.reasoningConfig?.effortMap?.[uiEffort] ?? uiEffort
        const block = substituteEffort(rawBlock, effort) as Record<
          string,
          unknown
        >
        for (const [key, value] of Object.entries(block)) {
          if (
            key === 'reasoning_effort' ||
            !RESERVED_MODEL_BODY_PARAMS.has(key)
          ) {
            out[key] = value
          }
        }
      }
    }
  }

  // Apply model-specific params, but never let them overwrite our explicit
  // or security-sensitive fields.
  if (model.requestParams) {
    for (const [key, value] of Object.entries(model.requestParams)) {
      if (!RESERVED_MODEL_BODY_PARAMS.has(key)) {
        out[key] = value
      }
    }
  }

  return out
}

function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Request timeout, lock timeout, and rate limit. 5xx is handled as a range.
const RETRYABLE_HTTP_STATUSES = new Set([408, 409, 429])
function getHttpStatus(error: unknown): number | undefined {
  const status = (error as { status?: unknown })?.status
  return typeof status === 'number' ? status : undefined
}

/**
 * A 429 can mean transient per-request throttling (worth retrying) or an
 * exhausted usage quota (which cannot succeed until the window resets).
 * Distinguishes the two by refreshing the quota from the server: returns a
 * terminal ChatError when the quota is exhausted, or null when the 429 looks
 * transient and the caller may retry.
 */
async function classifyQuotaExhausted429(
  error: unknown,
): Promise<ChatError | null> {
  // The 429 means the server rejected the request without consuming quota,
  // so its refreshed count is authoritative. Drop the optimistic-decrement
  // snapshot first: reconciling against it would force `remaining` to 0 for
  // a user whose last request was merely throttled, misclassifying a
  // transient 429 as exhaustion.
  discardRateLimitSnapshot()
  await refreshRateLimit(true)
  const limit = getRateLimitInfo()
  if (!limit || limit.remaining > 0) {
    return null
  }
  const message =
    (error as { message?: string })?.message ?? 'Rate limit reached'
  return new ChatError(
    message,
    limit.kind === 'hourly' ? 'HOURLY_LIMIT' : 'RATE_LIMIT',
    { status: 429 },
  )
}

// Typed classification only — never inspect error message strings, which
// vary across browsers, SDK versions, and locales.
export function isRetryableError(error: unknown): boolean {
  // "AbortError" is the spec-defined DOMException name for a user-initiated
  // abort, which is what our AbortSignal produces on every request path.
  if ((error as { name?: unknown })?.name === 'AbortError') {
    return false
  }

  if (error instanceof ChatError) {
    if (error.code === 'HOURLY_LIMIT' || error.status === undefined) {
      return false
    }
    return error.status >= 500 || RETRYABLE_HTTP_STATUSES.has(error.status)
  }

  // fetch() signals a network failure by rejecting with a TypeError.
  if (error instanceof TypeError) {
    return true
  }

  // Retry 5xx server errors, timeouts, and rate limits by HTTP status
  const status = (error as { status?: unknown })?.status
  if (typeof status === 'number') {
    return status >= 500 || RETRYABLE_HTTP_STATUSES.has(status)
  }

  // Default to not retrying - only explicitly identified conditions should trigger retries
  // This prevents unnecessary retries for client errors (4xx) which won't succeed on retry
  return false
}

export interface SendChatStreamParams {
  model: BaseModel
  autoCandidates?: BaseModel[]
  systemPrompt: string
  rules?: string
  onRetry?: (attempt: number, maxRetries: number, error?: string) => void
  updatedMessages: Message[]
  signal: AbortSignal
  reasoningEffort?: ReasoningEffort
  thinkingEnabled?: boolean
  genUIEnabled?: boolean
  webSearchEnabled?: boolean
  piiCheckEnabled?: boolean
  codeExecution?: CodeExecutionOptions
  threadId: string
  runId: string
  recovery?: ChatRecoveryCallbacks
}

/**
 * How a caller that means to be able to come back to this run is told about
 * the pair it may come back with. The run becomes recoverable only once it is
 * under way, and only for as long as nobody drops its log.
 */
export interface ChatRecoveryCallbacks {
  onAttemptStarted: (storage: RunStorage) => void
  onRunRecoverable: (storage: RunStorage) => Promise<void>
  onAttemptAbandoned: (storage: RunStorage, spilled?: boolean) => Promise<void>
}

export async function sendChatStream(
  params: SendChatStreamParams,
): Promise<AguiEventStream> {
  const {
    model,
    autoCandidates,
    systemPrompt,
    rules,
    onRetry,
    updatedMessages,
    signal,
    reasoningEffort,
    thinkingEnabled,
    genUIEnabled,
    webSearchEnabled,
    piiCheckEnabled,
    codeExecution,
    threadId,
    runId,
    recovery,
  } = params

  const routed = (autoCandidates?.length ?? 0) > 1

  // For Auto, the router may pick any candidate, so the single built message
  // set must be valid for all of them. Only a candidate that genuinely cannot
  // take a system role (e.g. DeepSeek) forces the prompt down into a leading
  // user message; doing it for every routed request would weaken the prompt
  // for models that accept it as a system message perfectly well.
  const forcePrependSystemPrompt = Boolean(
    autoCandidates?.some(
      (candidate) => !ChatQueryBuilder.shouldUseSystemRole(candidate.modelName),
    ),
  )

  const genUITools = genUIEnabled ? buildGenUIToolSchemas() : []

  const messages = ChatQueryBuilder.buildMessages({
    model,
    autoCandidates,
    systemPrompt,
    rules,
    messages: updatedMessages,
    includeGenUIHint: genUIEnabled,
    forcePrependSystemPrompt,
    includeTimeReminder: true,
  })

  const input: RunAgentInput = {
    threadId,
    runId,
    messages,
    tools: genUITools.length > 0 ? genUITools : undefined,
    forwardedProps: {
      model: routed ? AUTO_REQUEST_MODEL : model.modelName,
      reasoningEffort,
      thinking: thinkingEnabled,
      webSearch: webSearchEnabled,
      piiCheck: piiCheckEnabled,
      codeExecution,
    },
  }

  const simulated = model.modelName === DEV_SIMULATOR_MODEL.modelName
  let lastError: unknown = null
  const maxRetries = CONSTANTS.MESSAGE_SEND_MAX_RETRIES

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

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

    // A fresh pair per attempt: a session id belongs to exactly one run, and
    // an attempt that failed may still own the one it was given.
    const storage = recovery && !simulated ? newRunStorage() : null
    if (storage) recovery?.onAttemptStarted(storage)
    const attemptInput: RunAgentInput = storage
      ? { ...input, ...storage }
      : input

    try {
      if (simulated && shouldRetryTestFail(lastUserText(updatedMessages))) {
        throw new TypeError('Simulated network error for retry testing')
      }
      const streamStartedAt = startPerformanceTimer()
      const stream = simulated
        ? await runSimulatedAgent(attemptInput, signal)
        : await runAgent(attemptInput, signal)
      recordPerformanceDuration(
        PERFORMANCE_METRICS.INFERENCE_STREAM_READY,
        streamStartedAt,
      )
      if (!recovery || !storage) return stream
      // The pair was minted before the request, but the run only exists once
      // the harness has answered: registering it any earlier would leave an
      // envelope pointing at a run that was never started.
      const attemptStorage = storage
      let abandonment: Promise<void> | null = null
      const abandonRecovery = () =>
        (abandonment ??= recovery.onAttemptAbandoned(attemptStorage))
      const recoveryReady = recovery
        .onRunRecoverable(attemptStorage)
        .catch(async (error: unknown) => {
          try {
            await abandonRecovery()
          } catch (cleanupError) {
            logError(
              'Failed to clean up recovery after registration error',
              cleanupError,
              {
                component: 'inference-client',
                action: 'sendChatStream.recoveryCleanup',
                metadata: { sessionId: attemptStorage.sessionId },
              },
            )
          }
          throw error
        })
      void recoveryReady.catch(() => undefined)
      return Object.assign(stream, { recoveryReady, abandonRecovery })
    } catch (err: unknown) {
      if (storage && recovery) {
        try {
          await recovery.onAttemptAbandoned(storage, false)
        } catch (cleanupError) {
          logError('Failed to abandon chat recovery attempt', cleanupError, {
            component: 'inference-client',
            action: 'sendChatStream.recoveryCleanup',
            metadata: { sessionId: storage.sessionId },
          })
        }
      }
      lastError = err

      if ((err as { name?: unknown })?.name === 'AbortError') {
        throw err
      }

      // A 429 caused by an exhausted quota cannot succeed on retry; surface
      // it immediately so the paywall/limit UI shows instead of a retry loop.
      if (getHttpStatus(err) === 429) {
        const quotaError = await classifyQuotaExhausted429(err)
        if (quotaError) {
          throw quotaError
        }
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
            error: (err as { message?: string })?.message,
          },
        })

        onRetry?.(attempt + 1, maxRetries)

        await delay(backoffDelay)
        continue
      }

      logError('Chat stream request failed after retries', err, {
        component: 'inference-client',
        action: 'sendChatStream',
        metadata: {
          model: model.modelName,
          attempts: attempt + 1,
          error: (err as { message?: string })?.message,
        },
      })

      throw toTerminalChatError(err)
    }
  }

  // Fallback: every branch above should already have thrown, but if the
  // retry loop exits without doing so we still need to surface an error.
  throw toTerminalChatError(lastError, maxRetries)
}

function lastUserText(messages: Message[]): string {
  return (
    messages.filter((message) => message.role === 'user').pop()?.content ?? ''
  )
}

/**
 * Wraps a failed request's error into a typed ChatError, preserving any
 * classification already attached (our own ChatErrors pass through, HTTP
 * 429 maps to RATE_LIMIT). FETCH_ERROR is reserved for failures with no
 * HTTP response at all — a request that reached the server and got an
 * error status is a SERVER_ERROR, and telling the user to check their
 * internet for a 500 would be misleading.
 */
function toTerminalChatError(err: unknown, retries?: number): ChatError {
  if (err instanceof ChatError) {
    return err
  }
  const anyErr = err as { message?: string; status?: unknown }
  const msg = anyErr?.message || 'Unknown network error'
  const status = typeof anyErr?.status === 'number' ? anyErr.status : undefined
  if (status === 429) {
    return new ChatError(msg, 'RATE_LIMIT', { status })
  }
  if (status !== undefined) {
    return new ChatError(msg, 'SERVER_ERROR', { status })
  }
  const suffix = retries !== undefined ? ` after ${retries} retries` : ''
  return new ChatError(`Network request failed${suffix}: ${msg}`, 'FETCH_ERROR')
}

export interface StructuredCompletionParams {
  model: BaseModel
  autoCandidates?: BaseModel[]
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  jsonSchema: Record<string, unknown>
  signal?: AbortSignal
  reasoningEffort?: ReasoningEffort
  thinkingEnabled?: boolean
}

export type StructuredCompletionErrorCode =
  | 'request_failed'
  | 'incomplete_response'
  | 'refused_response'
  | 'empty_response'
  | 'invalid_json_response'

export class StructuredCompletionError extends Error {
  readonly code: StructuredCompletionErrorCode
  readonly status?: number
  readonly requestCode?: string
  readonly finishReason?: string

  constructor(
    code: StructuredCompletionErrorCode,
    options: {
      cause?: unknown
      status?: number
      requestCode?: string
      finishReason?: string
    } = {},
  ) {
    super(code, { cause: options.cause })
    this.name = 'StructuredCompletionError'
    this.code = code
    this.status = options.status
    this.requestCode = options.requestCode
    this.finishReason = options.finishReason
  }
}

export async function sendStructuredCompletion<T>(
  params: StructuredCompletionParams,
): Promise<T> {
  const {
    model,
    autoCandidates,
    messages,
    jsonSchema,
    signal,
    reasoningEffort,
    thinkingEnabled,
  } = params
  const selectedCandidates = autoCandidates ?? [model]
  const requestMessages = selectedCandidates.some(
    (candidate) => !ChatQueryBuilder.shouldUseSystemRole(candidate.modelName),
  )
    ? messages.map((message) =>
        message.role === 'system'
          ? { ...message, role: 'user' as const }
          : message,
      )
    : messages

  const requestBody: Record<string, unknown> = {
    model: model.modelName,
    messages: requestMessages,
    stream: false,
  }
  const modelParamOpts = { thinkingEnabled, reasoningEffort }
  if (autoCandidates && autoCandidates.length > 0) {
    requestBody.model = AUTO_REQUEST_MODEL
    requestBody[AUTO_MODEL_OPTIONS_FIELD] = autoCandidates.map((candidate) => ({
      model: candidate.modelName,
      params: buildModelBodyParams(candidate, modelParamOpts),
    }))
  } else {
    Object.assign(requestBody, buildModelBodyParams(model, modelParamOpts))
  }
  requestBody.response_format = {
    type: 'json_schema',
    json_schema: {
      name: 'response',
      schema: jsonSchema,
    },
  }

  let response: Response
  try {
    response = await inferenceRequest(
      '/chat/completions',
      JSON.stringify(requestBody),
      { headers: { 'Content-Type': 'application/json' }, signal },
    )
  } catch (error) {
    if (
      typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError'
    ) {
      throw error
    }
    throw new StructuredCompletionError('request_failed', {
      cause: error,
      status: getHttpStatus(error),
    })
  }

  if (!response.ok) {
    // Classify by status and the server's own code; never by message text,
    // which varies with locale and deployment.
    const body = await response.json().catch(() => null)
    const requestCode = (body as { error?: { code?: unknown } })?.error?.code
    throw new StructuredCompletionError('request_failed', {
      status: response.status,
      requestCode: typeof requestCode === 'string' ? requestCode : undefined,
    })
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      finish_reason?: string | null
      message?: { content?: string | null; refusal?: string | null }
    }>
  }
  const choice = payload.choices?.[0]
  const finishReason =
    typeof choice?.finish_reason === 'string' ? choice.finish_reason : undefined
  if (choice?.message?.refusal) {
    throw new StructuredCompletionError('refused_response', { finishReason })
  }
  if (finishReason && finishReason !== 'stop') {
    throw new StructuredCompletionError('incomplete_response', { finishReason })
  }
  const content = choice?.message?.content
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new StructuredCompletionError('empty_response', { finishReason })
  }

  try {
    return JSON.parse(content) as T
  } catch (error) {
    throw new StructuredCompletionError('invalid_json_response', {
      cause: error,
      finishReason,
    })
  }
}
