import { logError } from '@/utils/error-handling'
import { SecureClient } from 'tinfoil'

const OPENGRAPH_ENCLAVE = 'https://opengraph-metadata.tinfoil.sh'
const OPENGRAPH_CONFIG_REPO = 'tinfoilsh/confidential-website-metadata-fetcher'

let cachedClient: SecureClient | null = null

function getClient(): SecureClient {
  if (!cachedClient) {
    cachedClient = new SecureClient({
      enclaveURL: OPENGRAPH_ENCLAVE,
      configRepo: OPENGRAPH_CONFIG_REPO,
    })
  }
  return cachedClient
}

interface MetadataResponse {
  url: string
  image: string | null
  cached: boolean
}

const inFlight = new Map<string, Promise<string | null>>()

export async function fetchOpenGraphImage(url: string): Promise<string | null> {
  if (!url) return null

  const existing = inFlight.get(url)
  if (existing) return existing

  const pending = (async (): Promise<string | null> => {
    try {
      const client = getClient()
      const response = await client.fetch(`${OPENGRAPH_ENCLAVE}/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })

      if (!response.ok) {
        logError(
          `OpenGraph metadata request failed with status: ${response.status}`,
          undefined,
          {
            component: 'opengraph-client',
            action: 'fetchOpenGraphImage',
            metadata: { status: response.status, url },
          },
        )
        return null
      }

      const data: MetadataResponse = await response.json()
      return data.image ?? null
    } catch (error) {
      logError('OpenGraph metadata request threw', error, {
        component: 'opengraph-client',
        action: 'fetchOpenGraphImage',
        metadata: { url },
      })
      return null
    } finally {
      inFlight.delete(url)
    }
  })()

  inFlight.set(url, pending)
  return pending
}
