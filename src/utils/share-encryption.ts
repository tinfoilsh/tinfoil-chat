import { base64ToUint8Array, uint8ArrayToBase64 } from '@/utils/binary-codec'
import { logError } from '@/utils/error-handling'
import pako from 'pako'

const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256

/**
 * Encrypted share data format (stored on server as JSON)
 * Matches the pattern used by EncryptionService for regular chat storage
 */
export interface EncryptedShareData {
  v: 1 // Format version
  iv: string // Base64 encoded IV
  ct: string // Base64 encoded ciphertext (of gzipped JSON)
}

/**
 * Generate a throwaway AES-256 key for share encryption
 */
export async function generateShareKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Export a CryptoKey to base64url string for URL fragment
 */
export async function exportKeyToBase64url(key: CryptoKey): Promise<string> {
  const rawKey = await crypto.subtle.exportKey('raw', key)
  const bytes = new Uint8Array(rawKey)
  // Convert to base64url (URL-safe base64)
  const base64 = btoa(String.fromCharCode(...bytes))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Import a base64url key string back to CryptoKey
 */
export async function importKeyFromBase64url(
  keyBase64url: string,
): Promise<CryptoKey> {
  // Convert from base64url to standard base64
  let base64 = keyBase64url.replace(/-/g, '+').replace(/_/g, '/')
  // Add padding if needed
  while (base64.length % 4) {
    base64 += '='
  }
  const bytes = base64ToUint8Array(base64)
  return crypto.subtle.importKey('raw', bytes, { name: ALGORITHM }, false, [
    'decrypt',
  ])
}

/**
 * Encrypt data for sharing
 * Returns JSON structure: { v: 1, iv: base64, ct: base64 }
 * Plaintext is gzipped JSON for compression
 */
export async function encryptForShare(
  data: object,
  key: CryptoKey,
): Promise<EncryptedShareData> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const jsonString = JSON.stringify(data)
  const compressed = pako.gzip(jsonString)

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    compressed,
  )

  return {
    v: 1,
    iv: uint8ArrayToBase64(iv),
    ct: uint8ArrayToBase64(new Uint8Array(ciphertext)),
  }
}

/**
 * Decrypt shared data from JSON format
 */
export async function decryptShare(
  data: EncryptedShareData,
  keyBase64url: string,
): Promise<object | null> {
  try {
    if (data.v !== 1) {
      logError(
        'Unsupported share format version',
        new Error(`Unknown version: ${data.v}`),
        {
          component: 'ShareEncryption',
          action: 'decryptShare',
        },
      )
      return null
    }

    if (!data.iv || !data.ct) {
      logError('Missing iv or ct', new Error('Invalid share data'), {
        component: 'ShareEncryption',
        action: 'decryptShare',
      })
      return null
    }

    const key = await importKeyFromBase64url(keyBase64url)
    const iv = base64ToUint8Array(data.iv)
    const ciphertext = base64ToUint8Array(data.ct)

    const decrypted = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv: iv.buffer.slice(
          iv.byteOffset,
          iv.byteOffset + iv.byteLength,
        ) as ArrayBuffer,
      },
      key,
      ciphertext.buffer.slice(
        ciphertext.byteOffset,
        ciphertext.byteOffset + ciphertext.byteLength,
      ) as ArrayBuffer,
    )

    // Decompress gzipped data
    const jsonString = pako.ungzip(new Uint8Array(decrypted), { to: 'string' })
    return JSON.parse(jsonString)
  } catch (error) {
    logError('Failed to decrypt share', error, {
      component: 'ShareEncryption',
      action: 'decryptShare',
    })
    return null
  }
}
