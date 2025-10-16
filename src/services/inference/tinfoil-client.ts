import { logError } from '@/utils/error-handling'
import { TinfoilAI } from 'tinfoil'

let clientInstance: TinfoilAI | null = null
let lastApiKey: string | null = null

export function getTinfoilClient(apiKey: string): TinfoilAI {
  if (!clientInstance || lastApiKey !== apiKey) {
    try {
      clientInstance = new TinfoilAI({
        apiKey,
        dangerouslyAllowBrowser: true,
      })
      lastApiKey = apiKey
    } catch (error) {
      logError('Failed to initialize TinfoilAI client', error, {
        component: 'tinfoil-client',
        action: 'getTinfoilClient',
      })
      throw error
    }
  }
  return clientInstance
}
