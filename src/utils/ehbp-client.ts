import { VERIFIER_CONSTANTS } from '@/components/verifier/constants'
import { Identity, Transport } from 'ehbp'

const IDENTITY_STORAGE_KEY = 'ehbp:client-identity'

let identityPromise: Promise<Identity> | null = null
const transportPromises = new Map<string, Promise<Transport>>()
const serverKeyPromises = new Map<string, Promise<CryptoKey>>()

type GoInterface = {
  run(instance: WebAssembly.Instance): void
  importObject: WebAssembly.Imports
}

type VerifyEnclaveResult = {
  certificate: string
  measurement: string
  hpke_public_key?: string
}

declare global {
  interface Window {
    Go: new () => GoInterface
    verifyEnclave?: (enclaveHostname: string) => Promise<VerifyEnclaveResult>
  }
}

const isBrowser = () => typeof window !== 'undefined'

let verifierLoadPromise: Promise<void> | null = null

async function ensureVerifierLoaded(): Promise<void> {
  if (!isBrowser()) {
    throw new Error('Verifier can only be loaded in the browser environment')
  }

  if (!verifierLoadPromise) {
    verifierLoadPromise = (async () => {
      try {
        await import('@/components/verifier/wasm_exec.js')
        const go = new window.Go()
        const response = await fetch(VERIFIER_CONSTANTS.WASM_URL)
        if (!response.ok) {
          throw new Error(`Failed to fetch verifier WASM: ${response.status}`)
        }
        const bytes = await response.arrayBuffer()
        const { instance } = await WebAssembly.instantiate(
          bytes,
          go.importObject,
        )
        go.run(instance)
      } catch (error) {
        verifierLoadPromise = null
        throw error
      }
    })()
  }

  return verifierLoadPromise
}

function hexToUint8Array(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string length')
  }

  const array = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    array[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return array
}

async function getServerPublicKeyFromAttestation(
  origin: string,
): Promise<CryptoKey> {
  if (!serverKeyPromises.has(origin)) {
    serverKeyPromises.set(
      origin,
      (async () => {
        await ensureVerifierLoaded()

        const verifyEnclave = window.verifyEnclave
        if (!verifyEnclave) {
          throw new Error('Verifier runtime unavailable')
        }

        const host = new URL(origin).host
        const verification = await verifyEnclave(host)

        const hpkeKeyHex = verification.hpke_public_key

        if (!hpkeKeyHex) {
          throw new Error(
            'HPKE public key missing from attestation verification',
          )
        }

        const keyBytes = hexToUint8Array(hpkeKeyHex)
        return crypto.subtle.importKey(
          'raw',
          keyBytes,
          { name: 'X25519' },
          false,
          [],
        )
      })(),
    )
  }

  return serverKeyPromises.get(origin) as Promise<CryptoKey>
}

async function getClientIdentity(): Promise<Identity> {
  if (!isBrowser()) {
    throw new Error(
      'EHBP transport is only available in the browser environment',
    )
  }

  if (!identityPromise) {
    identityPromise = (async () => {
      let storedIdentity: string | null = null

      try {
        storedIdentity = window.localStorage.getItem(IDENTITY_STORAGE_KEY)
      } catch (error) {
        console.warn('Unable to read EHBP identity from storage', error)
      }

      if (storedIdentity) {
        try {
          return await Identity.fromJSON(storedIdentity)
        } catch (error) {
          console.warn(
            'Failed to restore EHBP identity, generating a new one',
            error,
          )
        }
      }

      const identity = await Identity.generate()

      try {
        const serialized = await identity.toJSON()
        window.localStorage.setItem(IDENTITY_STORAGE_KEY, serialized)
      } catch (error) {
        console.warn('Unable to persist EHBP identity', error)
      }

      return identity
    })()
  }

  return identityPromise
}

async function getTransport(origin: string): Promise<Transport> {
  if (!transportPromises.has(origin)) {
    transportPromises.set(
      origin,
      (async () => {
        const identity = await getClientIdentity()
        try {
          const serverPublicKey =
            await getServerPublicKeyFromAttestation(origin)
          const { host } = new URL(origin)
          return new Transport(identity, host, serverPublicKey)
        } catch (error) {
          // If attestation-based retrieval fails, propagate error to caller
          throw error
        }
      })(),
    )
  }

  return transportPromises.get(origin) as Promise<Transport>
}

export async function ehbpRequest(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  if (!isBrowser()) {
    throw new Error('ehbpRequest must be called in the browser')
  }

  const { origin } = new URL(url)
  const transport = await getTransport(origin)
  return transport.request(url, init)
}
