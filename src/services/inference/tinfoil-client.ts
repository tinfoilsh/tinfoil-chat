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

export async function getTinfoilClient(): Promise<TinfoilAI> {
  const apiKey = await fetchApiKey()

  if (!clientInstance || lastApiKey !== apiKey) {
    await initClient(apiKey)
  }

  return clientInstance!
}

/**
 * Executes an API call with automatic auth retry. On AuthenticationError,
 * resets the client (clears the cached key), fetches a fresh key, and
 * retries once.
 */
export async function withAuthRetry<T>(
  fn: (client: TinfoilAI) => Promise<T>,
): Promise<T> {
  const client = await getTinfoilClient()
  try {
    return await fn(client)
  } catch (err) {
    if (err instanceof AuthenticationError) {
      resetTinfoilClient()
      const freshClient = await getTinfoilClient()
      return await fn(freshClient)
    }
    throw err
  }
}
