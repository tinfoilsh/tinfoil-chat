import { API_BASE_URL } from '@/config'
import { logError } from '@/utils/error-handling'
import { AuthenticationError, TinfoilAI } from 'tinfoil'
import { authTokenManager } from '../auth'

const PLACEHOLDER_API_KEY = 'tinfoil-placeholder-api-key'

let clientInstance: TinfoilAI | null = null
let lastApiKey: string | null = null
let cachedApiKey: string | null = null
let hasSubscriptionFn: (() => boolean) | null = null

export function setSubscriptionChecker(hasSubscription: () => boolean): void {
  hasSubscriptionFn = hasSubscription
  resetTinfoilClient()
}

async function fetchApiKey(): Promise<string> {
  if (hasSubscriptionFn && !hasSubscriptionFn()) {
    cachedApiKey = null
    return PLACEHOLDER_API_KEY
  }

  if (cachedApiKey) {
    return cachedApiKey
  }

  if (!authTokenManager.isInitialized()) {
    logError('Auth token manager not initialized', undefined, {
      component: 'tinfoil-client',
      action: 'fetchApiKey',
    })
    return PLACEHOLDER_API_KEY
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
      logError('Failed to fetch API key from server', undefined, {
        component: 'tinfoil-client',
        action: 'fetchApiKey',
        metadata: {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        },
      })
      throw new Error(`Failed to get API key: ${response.status}`)
    }

    const data = await response.json()
    cachedApiKey = data.key
    return data.key
  } catch (error) {
    logError('Failed to fetch API key', error, {
      component: 'tinfoil-client',
      action: 'fetchApiKey',
    })
    return PLACEHOLDER_API_KEY
  }
}

export function resetTinfoilClient(): void {
  clientInstance = null
  lastApiKey = null
  cachedApiKey = null
}

async function initClient(apiKey: string): Promise<TinfoilAI> {
  try {
    clientInstance = new TinfoilAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true,
    })
    lastApiKey = apiKey
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
  const apiKey = await fetchApiKey()

  if (!clientInstance || lastApiKey !== apiKey) {
    await initClient(apiKey)
  }

  return clientInstance!
}

/**
 * Returns a proxy that behaves like TinfoilAI but automatically retries
 * once on AuthenticationError (refreshing the API key in between).
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
