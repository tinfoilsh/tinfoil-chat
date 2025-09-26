import { Identity, Transport, createTransport } from 'ehbp'

const HEXKEY =
  '4580b13f361a57937a83491561aaa1c3ecdbe71081043c796207b1a97f2c1d20'
const IDENTITY_STORAGE_KEY = 'ehbp:client-identity'

let identityPromise: Promise<Identity> | null = null
const transportPromises = new Map<string, Promise<Transport>>()
let serverPublicKeyPromise: Promise<CryptoKey> | null = null

const isBrowser = () => typeof window !== 'undefined'

export async function ehbpRequest(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  if (!isBrowser()) {
    throw new Error('ehbpRequest must be called in the browser')
  }

  const { origin } = new URL(url)
  const clientIdentity = await Identity.generate()
  const transport = await createTransport(origin, clientIdentity)
  if ((await transport.getServerPublicKeyHex()) !== HEXKEY) {
    console.error('comparison failed')
  }
  return transport.request(url, init)
}
