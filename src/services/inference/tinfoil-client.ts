import { TinfoilAI } from 'tinfoil'

let clientInstance: TinfoilAI | null = null

export function getTinfoilClient(apiKey: string): TinfoilAI {
  if (!clientInstance || clientInstance.apiKey !== apiKey) {
    clientInstance = new TinfoilAI({
      apiKey,
      dangerouslyAllowBrowser: true,
    })
  }
  return clientInstance
}
