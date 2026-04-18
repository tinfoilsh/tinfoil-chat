import { API_BASE_URL } from '@/config'
import { AUTH_ACTIVE_USER_ID } from '@/constants/storage-keys'
import { logError } from '@/utils/error-handling'
import {
  TINFOIL_EVENTS_HEADER,
  TINFOIL_EVENTS_VALUE_WEB_SEARCH,
} from '@/utils/tinfoil-events'
import { AuthenticationError, TinfoilAI } from 'tinfoil'
import { authTokenManager } from '../auth'

export interface RateLimitInfo {
  maxRequests: number
  remaining: number
  resetsAt: string
}

const SESSION_TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000
const AUTH_INIT_WAIT_MS = 3000

let clientInstance: TinfoilAI | null = null
let lastSessionToken: string | null = null
let cachedSessionToken: string | null = null
let cachedSessionTokenExpiresAt: number | null = null
let cachedRateLimit: RateLimitInfo | null = null
let remainingBeforeRequest: number | null = null
let refreshInFlight: Promise<void> | null = null

function dispatchRateLimitUpdate(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('rateLimitUpdated'))
  }
}

export async function fetchSessionToken(): Promise<string> {
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

  // If the user was previously signed in, wait for Clerk to initialize
  // the auth token manager before fetching — otherwise we'd get an
  // anonymous free-tier key that gets cached until expiry.
  if (
    !authTokenManager.isInitialized() &&
    typeof window !== 'undefined' &&
    localStorage.getItem(AUTH_ACTIVE_USER_ID) !== null
  ) {
    await authTokenManager.waitForInit(AUTH_INIT_WAIT_MS)
  }

  // Build request headers: include auth if signed in, omit for anonymous users
  const headers: Record<string, string> = {}
  if (authTokenManager.isInitialized()) {
    try {
      const token = await authTokenManager.getValidToken()
      headers['Authorization'] = `Bearer ${token}`
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

  const response = await fetch(`${API_BASE_URL}/api/keys/chat`, {
    headers,
  })

  if (!response.ok) {
    const errorText = await response.text()
    logError('Failed to fetch session token from server', undefined, {
      component: 'tinfoil-client',
      action: 'fetchSessionToken',
      metadata: {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      },
    })
    throw new Error(`Failed to get session token: ${response.status}`)
  }

  const data = await response.json()
  cachedSessionToken = data.key
  if (data.expires_at) {
    cachedSessionTokenExpiresAt = new Date(data.expires_at).getTime()
  }

  if (data.is_free_tier && data.rate_limit) {
    cachedRateLimit = {
      maxRequests: data.rate_limit.max_requests,
      remaining: data.rate_limit.remaining,
      resetsAt: data.rate_limit.resets_at,
    }
  } else {
    cachedRateLimit = null
  }

  dispatchRateLimitUpdate()

  return data.key
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
 * Forces a fresh fetch of the session token (and rate limit info) from
 * the server, bypassing the local cache.  Called after each stream
 * completes so the UI reflects the server's actual remaining count.
 *
 * If the server returns a stale count (>= the pre-request snapshot),
 * falls back to snapshot - 1 so the UI stays accurate.
 * Concurrent calls are coalesced into a single in-flight request.
 */
export async function refreshRateLimit(): Promise<void> {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    const snapshot = remainingBeforeRequest
    remainingBeforeRequest = null
    cachedSessionToken = null
    cachedSessionTokenExpiresAt = null
    try {
      await fetchSessionToken()
      if (
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
      logError('Failed to refresh rate limit from server', error, {
        component: 'tinfoil-client',
        action: 'refreshRateLimit',
      })
    } finally {
      refreshInFlight = null
    }
  })()

  return refreshInFlight
}

export function resetTinfoilClient(): void {
  clientInstance = null
  lastSessionToken = null
  cachedSessionToken = null
  cachedSessionTokenExpiresAt = null
  cachedRateLimit = null
  remainingBeforeRequest = null
  refreshInFlight = null
}

async function initClient(sessionToken: string): Promise<TinfoilAI> {
  try {
    clientInstance = new TinfoilAI({
      apiKey: sessionToken,
      dangerouslyAllowBrowser: true,
      // Opt into the router's inline progress-marker stream so the
      // chat UI can surface live web_search and URL-fetch status while
      // the underlying SSE stream stays spec-conformant for any other
      // OpenAI-compatible consumer.
      defaultHeaders: {
        [TINFOIL_EVENTS_HEADER]: TINFOIL_EVENTS_VALUE_WEB_SEARCH,
      },
    })
    lastSessionToken = sessionToken
    return clientInstance
  } catch (error) {
    logError('Failed to initialize TinfoilAI client', error, {
      component: 'tinfoil-client',
      action: 'initClient',
    })
    throw error
  }
}

export async function getSessionToken(): Promise<string> {
  return fetchSessionToken()
}

async function getRawClient(): Promise<TinfoilAI> {
  const sessionToken = await fetchSessionToken()

  if (!clientInstance || lastSessionToken !== sessionToken) {
    await initClient(sessionToken)
  }

  return clientInstance!
}

/**
 * Returns a proxy that behaves like TinfoilAI but automatically retries
 * once on AuthenticationError (refreshing the session token in between).
 *
 * Property accesses build up a path (e.g. ['chat','completions','create']).
 * The actual call is intercepted in the `apply` trap, which resolves the
 * full path on the live clientInstance, invokes the method, and retries
 * with a fresh client on AuthenticationError.
 */
export async function getTinfoilClient(): Promise<TinfoilAI> {
  await getRawClient()

  function resolvePath(path: PropertyKey[]): { fn: any; thisArg: any } {
    let thisArg: any = clientInstance
    let fn: any = clientInstance
    for (const p of path) {
      thisArg = fn
      fn = fn[p]
    }
    return { fn, thisArg }
  }

  function proxyWithRetry(pathFromRoot: PropertyKey[]): any {
    // Target must be a function so the `apply` trap can fire
    return new Proxy(function () {}, {
      get(_, prop) {
        if (
          prop === 'then' ||
          prop === Symbol.toPrimitive ||
          prop === Symbol.toStringTag
        ) {
          return undefined
        }
        return proxyWithRetry([...pathFromRoot, prop])
      },
      apply(_, __, args) {
        const { fn, thisArg } = resolvePath(pathFromRoot)
        const result = fn.apply(thisArg, args)
        if (result && typeof result.then === 'function') {
          return result.catch(async (err: unknown) => {
            if (err instanceof AuthenticationError) {
              resetTinfoilClient()
              await getRawClient()
              const { fn: freshFn, thisArg: freshThis } =
                resolvePath(pathFromRoot)
              return freshFn.apply(freshThis, args)
            }
            throw err
          })
        }
        return result
      },
    })
  }

  return proxyWithRetry([]) as TinfoilAI
}
