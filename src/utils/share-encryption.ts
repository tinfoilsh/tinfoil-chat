import { logError } from '@/utils/error-handling'

const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const IV_LENGTH = 12

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
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return crypto.subtle.importKey('raw', bytes, { name: ALGORITHM }, false, [
    'decrypt',
  ])
}

/**
 * Encrypt data for sharing
 * Returns IV prepended to ciphertext as Uint8Array
 */
export async function encryptForShare(
  data: object,
  key: CryptoKey,
): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encoded = new TextEncoder().encode(JSON.stringify(data))

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded,
  )

  // Prepend IV to ciphertext
  const result = new Uint8Array(iv.length + ciphertext.byteLength)
  result.set(iv, 0)
  result.set(new Uint8Array(ciphertext), iv.length)

  return result
}

/**
 * Decrypt shared data
 * Expects IV prepended to ciphertext
 */
export async function decryptShare(
  ciphertext: Uint8Array,
  keyBase64url: string,
): Promise<object | null> {
  try {
    if (ciphertext.length <= IV_LENGTH) {
      logError('Ciphertext too short', new Error('Invalid ciphertext length'), {
        component: 'ShareEncryption',
        action: 'decryptShare',
      })
      return null
    }

    const key = await importKeyFromBase64url(keyBase64url)
    const iv = ciphertext.slice(0, IV_LENGTH)
    const encryptedData = ciphertext.slice(IV_LENGTH)

    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      encryptedData,
    )

    const jsonString = new TextDecoder().decode(decrypted)
    return JSON.parse(jsonString)
  } catch (error) {
    logError('Failed to decrypt share', error, {
      component: 'ShareEncryption',
      action: 'decryptShare',
    })
    return null
  }
}
