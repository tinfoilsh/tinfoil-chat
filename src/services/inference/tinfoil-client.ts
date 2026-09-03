import { ChatError } from '@/components/chat/chat-utils'
import { API_BASE_URL, DEV_API_KEY, IS_DEV } from '@/config'
import { AUTH_ACTIVE_USER_ID } from '@/constants/storage-keys'
import { logError } from '@/utils/error-handling'
import {
  PERFORMANCE_METRICS,
  recordPerformanceDuration,
  startPerformanceTimer,
} from '@/utils/performance-metrics'
import { SecureClient } from 'tinfoil'
import { authTokenManager } from '../auth'
import { INFERENCE_CLIENT_INITIALIZATION_TIMEOUT_MS } from './constants'

export interface RateLimitInfo {
  maxRequests: number
  remaining: number
  resetsAt: string
  /**
   * Which limit this represents. Absent or `free_daily` is the anonymous/
   * free-tier daily request limit; `hourly` is the per-account hourly usage
   * cap that subscribers hit (surfaced through the same indicator channel).
   */
  kind?: 'free_daily' | 'hourly'
}

const SESSION_TOKEN_EXPIRY_BUFFER_MS = 1 * 60 * 1000
const AUTH_INIT_WAIT_MS = 3000

let inferenceBaseURL: string | null = null
let secureClient: SecureClient | null = null
let cachedSessionToken: string | null = null
let cachedSessionTokenExpiresAt: number | null = null
let cachedSessionTokenWasAuthenticated = false
let cachedRateLimit: RateLimitInfo | null = null
let remainingBeforeRequest: number | null = null
let refreshInFlight: Promise<void> | null = null
let sessionCacheGeneration = 0
let initializationInFlight: InitializationTask | null = null

class SessionCacheInvalidatedError extends Error {}

export class TinfoilClientInitializationTimeoutError extends Error {
  constructor() {
    super('Tinfoil client initialization timed out')
    this.name = 'TinfoilClientInitializationTimeoutError'
  }
}

interface InitializedClient {
  baseURL: string
  secureClient: SecureClient | null
}

interface InitializationTask {
  generation: number
  controller: AbortController
  timeoutId: ReturnType<typeof setTimeout>
  promise: Promise<void>
}

function abortInitialization(reason: unknown): void {
  const task = initializationInFlight
  if (!task) return
  initializationInFlight = null
  clearTimeout(task.timeoutId)
  task.controller.abort(reason)
}

function waitForSignal<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason)

  return new Promise<T>((resolve, reject) => {
    const handleAbort = () => reject(signal.reason)
    signal.addEventListener('abort', handleAbort, { once: true })
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', handleAbort)
    })
  })
}

function assertSessionCacheGeneration(cacheGeneration: number): void {
  if (cacheGeneration !== sessionCacheGeneration) {
    throw new SessionCacheInvalidatedError()
  }
}

function dispatchRateLimitUpdate(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('rateLimitUpdated'))
  }
}

type ServerErrorBody = {
  error?: string
  code?: string
  resets_at?: string
}

function parseErrorBody(errorText: string): ServerErrorBody | null {
  try {
    return JSON.parse(errorText) as ServerErrorBody
  } catch {
    return null
  }
}

function isHourlyLimit(
  status: number,
  parsedError: ServerErrorBody | null,
): boolean {
  return status === 429 || parsedError?.code === 'HOURLY_LIMIT_REACHED'
}

// Surfaces the per-account hourly usage cap through the shared rate-limit
// channel (so the banner renders) and throws a typed error the chat
// classifies as a rate limit rather than a generic failure. Never returns.
function surfaceHourlyLimit(parsedError: ServerErrorBody | null): never {
  cachedRateLimit = {
    maxRequests: 0,
    remaining: 0,
    resetsAt: parsedError?.resets_at ?? '',
    kind: 'hourly',
  }
  dispatchRateLimitUpdate()
  throw new ChatError(
    parsedError?.error ?? 'You have reached your hourly usage limit.',
    'HOURLY_LIMIT',
    { status: 429 },
  )
}

// Mints a stateless JWT inference token for a signed-in user via
// /api/chat/token. Returns the token on success, or null on any non-rate-limit
// failure (no active subscription, endpoint disabled, network error) so the
// caller falls back to the opaque /api/keys/chat path. A subscriber over the
// hourly cap is surfaced here and not fallen back, so the cap cannot be bypassed
// through the opaque path.
async function fetchChatJWT(
  authBearer: string,
  cacheGeneration: number,
  signal?: AbortSignal,
): Promise<{ key: string; expiresAt: number | null } | null> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/api/chat/token`, {
      headers: { Authorization: `Bearer ${authBearer}` },
      signal,
    })
  } catch {
    return null
  }

  if (response.ok) {
    try {
      const data = await response.json()
      if (typeof data?.key === 'string' && data.key !== '') {
        const expiresAtMs = data.expires_at
          ? new Date(data.expires_at).getTime()
          : null
        return {
          key: data.key,
          expiresAt:
            expiresAtMs !== null && !Number.isNaN(expiresAtMs)
              ? expiresAtMs
              : null,
        }
      }
    } catch {
      // Malformed / non-JSON 200 body: treat as a miss and fall back to the
      // opaque /api/keys/chat path rather than throwing.
    }
    return null
  }

  const parsedError = parseErrorBody(await response.text())
  if (isHourlyLimit(response.status, parsedError)) {
    assertSessionCacheGeneration(cacheGeneration)
    surfaceHourlyLimit(parsedError)
  }
  return null
}

async function fetchSessionTokenForGeneration(
  cacheGeneration: number,
  signal?: AbortSignal,
): Promise<string> {
  if (IS_DEV) {
    return DEV_API_KEY
  }

  assertSessionCacheGeneration(cacheGeneration)

  // If the user was previously signed in, wait for Clerk to initialize
  // the auth token manager before fetching — otherwise we'd get an
  // anonymous free-tier key that gets cached until expiry.
  if (
    !authTokenManager.isInitialized() &&
    typeof window !== 'undefined' &&
    localStorage.getItem(AUTH_ACTIVE_USER_ID) !== null
  ) {
    const authInitialization = authTokenManager.waitForInit(AUTH_INIT_WAIT_MS)
    await (signal
      ? waitForSignal(authInitialization, signal)
      : authInitialization)
  }

  // Resolve the auth bearer (if any) up front so the cache-validity
  // check and the actual request use the same authenticated/anonymous
  // decision.  This avoids a stale-cache loop when getValidToken()
  // intermittently fails for a signed-in user.
  let authBearer: string | null = null
  if (authTokenManager.isInitialized()) {
    try {
      const validToken = authTokenManager.getValidToken()
      authBearer = await (signal
        ? waitForSignal(validToken, signal)
        : validToken)
    } catch (error) {
      logError(
        'Failed to get auth token, falling back to anonymous key',
        error,
        {
          component: 'tinfoil-client',
          action: 'fetchSessionToken',
        },
      )
    }
  }
  assertSessionCacheGeneration(cacheGeneration)
  const usedAuthHeader = authBearer !== null

  // If the cached token was fetched anonymously but we now have an
  // authenticated bearer, discard it so the next fetch goes out with
  // the user's token and returns the correct (possibly premium) rate
  // limit info.
  if (
    cachedSessionToken &&
    !cachedSessionTokenWasAuthenticated &&
    usedAuthHeader
  ) {
    cachedSessionToken = null
    cachedSessionTokenExpiresAt = null
    cachedRateLimit = null
    dispatchRateLimitUpdate()
  }

  if (cachedSessionToken) {
    const isExpired =
      cachedSessionTokenExpiresAt !== null &&
      Date.now() > cachedSessionTokenExpiresAt - SESSION_TOKEN_EXPIRY_BUFFER_MS
    if (!isExpired) {
      return cachedSessionToken
    }
    cachedSessionToken = null
    cachedSessionTokenExpiresAt = null
  }

  // Signed-in clients mint a stateless JWT inference token via /api/chat/token.
  // Anonymous users (and signed-in users without an active subscription) fall
  // back to the opaque /api/keys/chat path below.
  if (authBearer) {
    const jwt = await fetchChatJWT(authBearer, cacheGeneration, signal)
    assertSessionCacheGeneration(cacheGeneration)
    if (jwt !== null) {
      cachedSessionToken = jwt.key
      cachedSessionTokenWasAuthenticated = true
      cachedSessionTokenExpiresAt = jwt.expiresAt
      cachedRateLimit = null
      dispatchRateLimitUpdate()
      return jwt.key
    }
  }

  // Build request headers: include auth if we resolved a bearer above
  const headers: Record<string, string> = {}
  if (authBearer) {
    headers['Authorization'] = `Bearer ${authBearer}`
  }

  const response = await fetch(`${API_BASE_URL}/api/keys/chat`, {
    headers,
    signal,
  })
  assertSessionCacheGeneration(cacheGeneration)

  if (!response.ok) {
    const errorText = await response.text()
    assertSessionCacheGeneration(cacheGeneration)
    logError('Failed to fetch session token from server', undefined, {
      component: 'tinfoil-client',
      action: 'fetchSessionToken',
      metadata: {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      },
    })

    const parsedError = parseErrorBody(errorText)

    // Per-account hourly usage cap: surface it through the shared rate-limit
    // channel so the existing banner renders, and throw a message the chat
    // recognizes as a rate limit rather than a generic failure.
    if (isHourlyLimit(response.status, parsedError)) {
      surfaceHourlyLimit(parsedError)
    }

    throw new Error(`Failed to get session token: ${response.status}`)
  }

  const data = await response.json()
  assertSessionCacheGeneration(cacheGeneration)
  cachedSessionToken = data.key
  cachedSessionTokenWasAuthenticated = usedAuthHeader
  if (data.expires_at) {
    cachedSessionTokenExpiresAt = new Date(data.expires_at).getTime()
  }

  if (data.is_free_tier && data.rate_limit) {
    cachedRateLimit = {
      maxRequests: data.rate_limit.max_requests,
      remaining: data.rate_limit.remaining,
      resetsAt: data.rate_limit.resets_at,
      kind: 'free_daily',
    }
  } else {
    cachedRateLimit = null
  }

  dispatchRateLimitUpdate()

  return data.key
}

async function fetchSessionToken(signal?: AbortSignal): Promise<string> {
  const startedAt = startPerformanceTimer()
  try {
    while (true) {
      try {
        return await fetchSessionTokenForGeneration(
          sessionCacheGeneration,
          signal,
        )
      } catch (error) {
        if (!(error instanceof SessionCacheInvalidatedError)) throw error
      }
    }
  } finally {
    recordPerformanceDuration(
      PERFORMANCE_METRICS.INFERENCE_SESSION_TOKEN,
      startedAt,
    )
  }
}

export function getRateLimitInfo(): RateLimitInfo | null {
  return cachedRateLimit ? { ...cachedRateLimit } : null
}

/**
 * Snapshots the current remaining count and optimistically decrements it.
 * Called when a request starts so the UI updates immediately and
 * refreshRateLimit can later detect stale server responses.
 */
export function snapshotAndDecrementRemaining(): void {
  if (!cachedRateLimit) return
  remainingBeforeRequest = cachedRateLimit.remaining
  cachedRateLimit = {
    ...cachedRateLimit,
    remaining: Math.max(0, cachedRateLimit.remaining - 1),
  }
  dispatchRateLimitUpdate()
}

/**
 * Drops the pending optimistic-decrement snapshot so the next
 * refreshRateLimit treats the server's count as authoritative. Called when
 * a request was rejected outright (e.g. a 429): the server never consumed
 * it, so reconciling against the snapshot would undercount by one.
 */
export function discardRateLimitSnapshot(): void {
  remainingBeforeRequest = null
}

/**
 * Forces a fresh fetch of the session token (and rate limit info) from
 * the server, bypassing the local cache.  Called after each stream
 * completes so the UI reflects the server's actual remaining count.
 *
 * If the server returns a stale count (>= the pre-request snapshot),
 * falls back to snapshot - 1 so the UI stays accurate.
 * Concurrent calls are coalesced into a single in-flight request.
 */
export async function refreshRateLimit(force = false): Promise<void> {
  if (refreshInFlight) return refreshInFlight
  if (!force && cachedSessionToken && cachedRateLimit?.kind !== 'free_daily') {
    return
  }

  const refresh = (async () => {
    const refreshGeneration = sessionCacheGeneration
    const snapshot = remainingBeforeRequest
    remainingBeforeRequest = null
    cachedSessionToken = null
    cachedSessionTokenExpiresAt = null
    try {
      await fetchSessionTokenForGeneration(refreshGeneration)
      if (
        refreshGeneration === sessionCacheGeneration &&
        snapshot !== null &&
        cachedRateLimit &&
        cachedRateLimit.remaining >= snapshot
      ) {
        cachedRateLimit = {
          ...cachedRateLimit,
          remaining: Math.max(0, snapshot - 1),
        }
        dispatchRateLimitUpdate()
      }
    } catch (error) {
      if (error instanceof SessionCacheInvalidatedError) return
      logError('Failed to refresh rate limit from server', error, {
        component: 'tinfoil-client',
        action: 'refreshRateLimit',
      })
    }
  })()
  refreshInFlight = refresh

  try {
    await refresh
  } finally {
    if (refreshInFlight === refresh) {
      refreshInFlight = null
    }
  }
}

export function resetTinfoilClient(): void {
  sessionCacheGeneration++
  // Abort with the same retryable error as invalidateSessionCache so
  // concurrent waiters in ensureInitialized re-initialize against the new
  // generation instead of surfacing what downstream would classify as a
  // user abort.
  abortInitialization(new SessionCacheInvalidatedError())
  inferenceBaseURL = null
  secureClient = null
  cachedSessionToken = null
  cachedSessionTokenExpiresAt = null
  cachedSessionTokenWasAuthenticated = false
  cachedRateLimit = null
  remainingBeforeRequest = null
  refreshInFlight = null
}

export function invalidateSessionCache(): void {
  sessionCacheGeneration++
  abortInitialization(new SessionCacheInvalidatedError())
  refreshInFlight = null
  cachedSessionToken = null
  cachedSessionTokenExpiresAt = null
  cachedSessionTokenWasAuthenticated = false
  remainingBeforeRequest = null
  if (cachedRateLimit !== null) {
    cachedRateLimit = null
    dispatchRateLimitUpdate()
  }
}

async function initClient(signal: AbortSignal): Promise<InitializedClient> {
  try {
    if (IS_DEV) {
      return {
        secureClient: null,
        baseURL: `${window.location.origin}/api/local-router/v1`,
      }
    }

    const candidateSecureClient = new SecureClient({})
    const attestationStartedAt = startPerformanceTimer()
    await waitForSignal(candidateSecureClient.ready(), signal)
    recordPerformanceDuration(
      PERFORMANCE_METRICS.INFERENCE_ATTESTATION,
      attestationStartedAt,
    )
    // An attested client with no endpoint to report has nothing to talk to;
    // the OpenAI SDK used to paper over this by falling back to its own
    // default host, which is the last place these requests should go.
    const baseURL = candidateSecureClient.getBaseURL()
    if (!baseURL) {
      throw new ChatError(
        'Attested enclave did not report an inference endpoint',
        'FETCH_ERROR',
      )
    }
    return { secureClient: candidateSecureClient, baseURL }
  } catch (error) {
    logError('Failed to initialize Tinfoil client', error, {
      component: 'tinfoil-client',
      action: 'initClient',
    })
    throw error
  }
}

export async function getSessionToken(signal?: AbortSignal): Promise<string> {
  return fetchSessionToken(signal)
}

/**
 * Returns a fetch bound to the shared attested SecureClient so callers
 * outside the OpenAI SDK (e.g. document upload) can reuse the same
 * verified channel instead of running attestation a second time.
 *
 * Falls back to the global fetch in dev mode, where requests are routed
 * through the local proxy and SecureClient is intentionally not created.
 */
export async function getSecureFetch(): Promise<typeof fetch> {
  await ensureInitialized()
  if (!secureClient) {
    return fetch
  }
  return secureClient.fetch
}

export function isChatRecoveryAvailable(): boolean {
  return !IS_DEV
}

/**
 * Resolve the inference endpoint (attesting the enclave on prod) the first
 * time anything needs it, and again on session-token rotation.
 */
async function ensureInitialized(): Promise<void> {
  while (true) {
    const generation = sessionCacheGeneration
    let task = initializationInFlight

    if (!task || task.generation !== generation) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        controller.abort(new TinfoilClientInitializationTimeoutError())
      }, INFERENCE_CLIENT_INITIALIZATION_TIMEOUT_MS)
      const promise = (async () => {
        // Fetched here, not carried: every request reads the current key, so
        // the endpoint this resolves does not depend on which key is cached
        // and a rotated key costs no second attestation.
        await fetchSessionTokenForGeneration(generation, controller.signal)
        assertSessionCacheGeneration(generation)
        if (inferenceBaseURL) return

        const initialized = await initClient(controller.signal)
        assertSessionCacheGeneration(generation)
        inferenceBaseURL = initialized.baseURL
        secureClient = initialized.secureClient
      })()
      task = { generation, controller, timeoutId, promise }
      initializationInFlight = task
    }

    try {
      await task.promise
      return
    } catch (error) {
      if (error instanceof SessionCacheInvalidatedError) continue
      throw error
    } finally {
      if (initializationInFlight === task) {
        clearTimeout(task.timeoutId)
        initializationInFlight = null
      }
    }
  }
}

/**
 * POST to the inference API over the attested channel, replaying once if the
 * session key expired in flight. Callers hand over a ready body and read the
 * raw Response: a JSON completion and a multipart upload share the transport
 * and nothing else.
 */
export async function inferenceRequest(
  path: string,
  body: BodyInit,
  options: { headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<Response> {
  const send = async (): Promise<Response> => {
    await ensureInitialized()
    const apiKey = await getSessionToken(options.signal)
    return (secureClient?.fetch ?? fetch)(`${inferenceBaseURL}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...options.headers,
      },
      body,
      signal: options.signal,
    })
  }

  const response = await send()
  if (response.status !== 401) return response
  // A response nobody reads holds its connection open until it is collected.
  await response.body?.cancel().catch(() => undefined)
  invalidateSessionCache()
  return send()
}
