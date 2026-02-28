import { API_BASE_URL } from '@/config'
import { logError } from '@/utils/error-handling'
import { AuthenticationError, TinfoilAI } from 'tinfoil'
import { authTokenManager } from '../auth'

const PLACEHOLDER_SESSION_TOKEN = 'tinfoil-placeholder-api-key'

const SESSION_TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000

let clientInstance: TinfoilAI | null = null
let lastSessionToken: string | null = null
let cachedSessionToken: string | null = null
let cachedSessionTokenExpiresAt: number | null = null
let hasSubscriptionFn: (() => boolean) | null = null

export function setSubscriptionChecker(hasSubscription: () => boolean): void {
  hasSubscriptionFn = hasSubscription
  resetTinfoilClient()
}

async function fetchSessionToken(): Promise<string> {
  if (hasSubscriptionFn && !hasSubscriptionFn()) {
    cachedSessionToken = null
    return PLACEHOLDER_SESSION_TOKEN
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

  if (!authTokenManager.isInitialized()) {
    logError('Auth token manager not initialized', undefined, {
      component: 'tinfoil-client',
      action: 'fetchSessionToken',
    })
    return PLACEHOLDER_SESSION_TOKEN
  }

  try {
    const token = await authTokenManager.getValidToken()

    const response = await fetch(`${API_BASE_URL}/api/keys/chat`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
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
    return data.key
  } catch (error) {
    logError('Failed to fetch session token', error, {
      component: 'tinfoil-client',
      action: 'fetchSessionToken',
    })
    return PLACEHOLDER_SESSION_TOKEN
  }
}

export function resetTinfoilClient(): void {
  clientInstance = null
  lastSessionToken = null
  cachedSessionToken = null
  cachedSessionTokenExpiresAt = null
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
