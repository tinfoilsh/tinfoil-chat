import { API_BASE_URL } from '@/config'
import { logError } from '@/utils/error-handling'
import { TinfoilAI } from 'tinfoil'

const PLACEHOLDER_API_KEY = 'tinfoil-placeholder-api-key'

let clientInstance: TinfoilAI | null = null
let lastApiKey: string | null = null
let cachedApiKey: string | null = null
let getTokenFn: (() => Promise<string | null>) | null = null
let hasSubscriptionFn: (() => boolean) | null = null

export function setAuthTokenGetter(
  getToken: () => Promise<string | null>,
  hasSubscription?: () => boolean,
): void {
  getTokenFn = getToken
  hasSubscriptionFn = hasSubscription ?? null
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

  if (!getTokenFn) {
    logError('No auth token getter available', undefined, {
      component: 'tinfoil-client',
      action: 'fetchApiKey',
    })
    return PLACEHOLDER_API_KEY
  }

  try {
    const token = await getTokenFn()
    if (!token) {
      return PLACEHOLDER_API_KEY
    }

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

function resetTinfoilClient(): void {
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

export async function initializeTinfoilClient(): Promise<void> {
  const client = await getTinfoilClient()
  try {
    await (client as any).ready?.()
  } catch (error) {
    logError('Tinfoil client verification failed', error, {
      component: 'tinfoil-client',
      action: 'initializeTinfoilClient',
    })
  }
}
