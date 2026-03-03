import { API_BASE_URL } from '@/config'
import { logError } from '@/utils/error-handling'
import { AuthenticationError, TinfoilAI } from 'tinfoil'
import { authTokenManager } from '../auth'

export interface RateLimitInfo {
  maxRequests: number
  remaining: number
  resetsAt: string
}

const SESSION_TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000

let clientInstance: TinfoilAI | null = null
let lastSessionToken: string | null = null
let cachedSessionToken: string | null = null
let cachedSessionTokenExpiresAt: number | null = null
let cachedRateLimit: RateLimitInfo | null = null

async function fetchSessionToken(): Promise<string> {
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

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('rateLimitUpdated'))
  }

  return data.key
}

export function getRateLimitInfo(): RateLimitInfo | null {
  return cachedRateLimit ? { ...cachedRateLimit } : null
}

export function decrementRemainingRequests(): void {
  if (!cachedRateLimit) return
  cachedRateLimit = {
    ...cachedRateLimit,
    remaining: Math.max(0, cachedRateLimit.remaining - 1),
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('rateLimitUpdated'))
  }
}

export function resetTinfoilClient(): void {
  clientInstance = null
  lastSessionToken = null
  cachedSessionToken = null
  cachedSessionTokenExpiresAt = null
  cachedRateLimit = null
}

async function initClient(sessionToken: string): Promise<TinfoilAI> {
  try {
    clientInstance = new TinfoilAI({
      apiKey: sessionToken,
      dangerouslyAllowBrowser: true,
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
