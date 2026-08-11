import { logError } from '@/utils/error-handling'
import { SecureClient } from 'tinfoil'
import { z } from 'zod'

const SUMMARIZER_ENCLAVE = 'https://summarizer.tinfoil.sh'
const SUMMARIZER_CONFIG_REPO = 'tinfoilsh/confidential-summarizer'
export const SUMMARY_COOLDOWN_1_MS = 15 * 1000
export const SUMMARY_COOLDOWN_2_MS = 30 * 1000
export const SUMMARY_COOLDOWN_3_MS = 60 * 1000
export const SUMMARY_COOLDOWN_4_MS = 120 * 1000
export const SUMMARY_MAX_COOLDOWN_MS = 5 * 60 * 1000
export const SUMMARY_MAX_CONCURRENCY = 2

const summaryResponseSchema = z.object({ summary: z.string().trim().min(1) })
const structuredErrorSchema = z
  .object({
    error: z
      .union([
        z.string(),
        z.object({
          message: z.string().optional(),
          code: z.string().optional(),
          retryable: z.boolean().optional(),
          transient: z.boolean().optional(),
        }),
      ])
      .optional(),
    detail: z.string().optional(),
    message: z.string().optional(),
    code: z.string().optional(),
    retryable: z.boolean().optional(),
    transient: z.boolean().optional(),
  })
  .passthrough()

let cachedClient: SecureClient | null = null

function getClient(): SecureClient {
  if (!cachedClient) {
    cachedClient = new SecureClient({
      enclaveURL: SUMMARIZER_ENCLAVE,
      configRepo: SUMMARIZER_CONFIG_REPO,
    })
  }
  return cachedClient
}

export interface SummarizeRequest {
  content: string
  style: 'default' | 'thoughts_summary' | 'title_summary'
  signal?: AbortSignal
}

export class SummaryClientError extends Error {
  constructor(
    message: string,
    public readonly kind: 'transient' | 'terminal' | 'circuit-open',
    public readonly status?: number,
    public readonly code?: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'SummaryClientError'
  }
}

const cooldowns = [
  SUMMARY_COOLDOWN_1_MS,
  SUMMARY_COOLDOWN_2_MS,
  SUMMARY_COOLDOWN_3_MS,
  SUMMARY_COOLDOWN_4_MS,
]
let consecutiveTransientFailures = 0
let openUntil = 0
let halfOpenProbeInFlight = false
let activeRequests = 0
const concurrencyWaiters: Array<() => void> = []
const activeControllers = new Set<AbortController>()
let clientGeneration = 0

export async function summarize(request: SummarizeRequest): Promise<string> {
  const probe = enterCircuit()
  const generation = clientGeneration
  const controller = new AbortController()
  const forwardAbort = () => controller.abort(request.signal?.reason)
  if (request.signal?.aborted) forwardAbort()
  else request.signal?.addEventListener('abort', forwardAbort, { once: true })
  activeControllers.add(controller)
  let acquired = false
  try {
    await acquireSlot(controller.signal)
    acquired = true
    if (!probe && Date.now() < openUntil) throw circuitOpenError()
    const response = await getClient().fetch(
      `${SUMMARIZER_ENCLAVE}/summarize`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: request.content,
          style: request.style,
        }),
        signal: controller.signal,
      },
    )
    const body = await readResponseBody(response)
    if (!response.ok) throw parseServiceError(response.status, body)
    const parsed = summaryResponseSchema.safeParse(body)
    if (!parsed.success) {
      throw new SummaryClientError(
        'Summarizer response failed validation',
        'terminal',
        response.status,
        'INVALID_RESPONSE',
        { cause: parsed.error },
      )
    }
    if (generation !== clientGeneration) throw abortReason(controller.signal)
    resetCircuitAfterSuccess()
    return parsed.data.summary
  } catch (error) {
    if (!isAbortError(error)) {
      const typed = normalizeSummaryError(error)
      if (typed.kind === 'transient') openCircuitAfterFailure()
      else if (probe) resetCircuitAfterSuccess()
      if (typed.kind !== 'circuit-open') {
        logError('Summarize request failed', typed, {
          component: 'summary-client',
          action: 'summarize',
          metadata: {
            status: typed.status,
            code: typed.code,
            style: request.style,
          },
        })
      }
      throw typed
    }
    if (probe) halfOpenProbeInFlight = false
    throw error
  } finally {
    if (acquired) releaseSlot()
    activeControllers.delete(controller)
    request.signal?.removeEventListener('abort', forwardAbort)
  }
}

function enterCircuit(): boolean {
  const now = Date.now()
  if (now < openUntil) throw circuitOpenError()
  if (consecutiveTransientFailures > 0 && openUntil > 0) {
    if (halfOpenProbeInFlight) throw circuitOpenError()
    halfOpenProbeInFlight = true
    return true
  }
  return false
}

function openCircuitAfterFailure(): void {
  consecutiveTransientFailures++
  const indexed = cooldowns[consecutiveTransientFailures - 1]
  const extended =
    SUMMARY_COOLDOWN_4_MS *
    2 ** Math.max(0, consecutiveTransientFailures - cooldowns.length)
  const cooldown = Math.min(indexed ?? extended, SUMMARY_MAX_COOLDOWN_MS)
  openUntil = Date.now() + cooldown
  halfOpenProbeInFlight = false
}

function resetCircuitAfterSuccess(): void {
  consecutiveTransientFailures = 0
  openUntil = 0
  halfOpenProbeInFlight = false
}

function circuitOpenError(): SummaryClientError {
  return new SummaryClientError(
    'Summarizer is temporarily unavailable',
    'circuit-open',
    undefined,
    'CIRCUIT_OPEN',
  )
}

async function acquireSlot(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw abortReason(signal)
  if (activeRequests < SUMMARY_MAX_CONCURRENCY) {
    activeRequests++
    return
  }
  await new Promise<void>((resolve, reject) => {
    const ready = () => {
      signal?.removeEventListener('abort', onAbort)
      activeRequests++
      resolve()
    }
    const onAbort = () => {
      const index = concurrencyWaiters.indexOf(ready)
      if (index >= 0) concurrencyWaiters.splice(index, 1)
      reject(abortReason(signal as AbortSignal))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    concurrencyWaiters.push(ready)
  })
}

function releaseSlot(): void {
  activeRequests--
  concurrencyWaiters.shift()?.()
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function parseServiceError(status: number, body: unknown): SummaryClientError {
  const parsed = structuredErrorSchema.safeParse(body)
  const transient =
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500 ||
    (parsed.success &&
      (parsed.data.retryable === true ||
        parsed.data.transient === true ||
        (typeof parsed.data.error !== 'string' &&
          (parsed.data.error?.retryable === true ||
            parsed.data.error?.transient === true))))
  let message = typeof body === 'string' ? body.trim() : ''
  if (parsed.success) {
    const error = parsed.data.error
    message =
      (typeof error === 'string' ? error : error?.message) ||
      parsed.data.detail ||
      parsed.data.message ||
      message
  }
  return new SummaryClientError(
    message || 'Summarize request failed',
    transient ? 'transient' : 'terminal',
    status,
    parsed.success
      ? (parsed.data.code ??
          (typeof parsed.data.error === 'string'
            ? undefined
            : parsed.data.error?.code))
      : undefined,
  )
}

function normalizeSummaryError(error: unknown): SummaryClientError {
  if (error instanceof SummaryClientError) return error
  return new SummaryClientError(
    'Summarizer is unavailable',
    'transient',
    undefined,
    'NETWORK',
    { cause: error },
  )
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Aborted', 'AbortError')
}

export function resetSummaryClient(): void {
  clientGeneration++
  const resetError = new DOMException('Summary client reset', 'AbortError')
  for (const controller of activeControllers) controller.abort(resetError)
  cachedClient = null
  consecutiveTransientFailures = 0
  openUntil = 0
  halfOpenProbeInFlight = false
}
