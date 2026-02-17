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
 * The proxy resolves the client lazily on each call so it always
 * delegates to the current clientInstance.
 */
export async function getTinfoilClient(): Promise<TinfoilAI> {
  // Ensure the client is initialized before returning the proxy
  await getRawClient()

  function resolve(path: PropertyKey[]): { target: any; parent: any } {
    let parent: any = clientInstance
    let target: any = clientInstance
    for (const p of path) {
      parent = target
      target = target[p]
    }
    return { target, parent }
  }

  function proxyWithRetry(pathFromRoot: PropertyKey[]): any {
    return new Proxy(Object.create(null), {
      get(_, prop) {
        // Avoid interfering with Promise resolution or inspection
        if (
          prop === 'then' ||
          prop === Symbol.toPrimitive ||
          prop === Symbol.toStringTag
        ) {
          const { target } = resolve(pathFromRoot)
          return Reflect.get(target, prop)
        }

        const { target } = resolve(pathFromRoot)
        const value = Reflect.get(target, prop)

        if (typeof value === 'function') {
          const currentPath = [...pathFromRoot, prop]
          return (...args: any[]) => {
            const { target: thisArg } = resolve(pathFromRoot)
            const result = thisArg[prop].apply(thisArg, args)
            // Only wrap thenables (async API calls), not sync helpers
            if (result && typeof result.then === 'function') {
              return result.catch(async (err: unknown) => {
                if (err instanceof AuthenticationError) {
                  resetTinfoilClient()
                  await getRawClient()
                  const { target: freshThis } = resolve(pathFromRoot)
                  return freshThis[prop].apply(freshThis, args)
                }
                throw err
              })
            }
            return result
          }
        }

        if (typeof value === 'object' && value !== null) {
          return proxyWithRetry([...pathFromRoot, prop])
        }

        return value
      },
    })
  }

  return proxyWithRetry([]) as TinfoilAI
}
