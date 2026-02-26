/**
 * Passkey Key Storage
 *
 * Encrypts/decrypts the user's encryption key bundle (primary + alternatives)
 * using a passkey-derived KEK, and stores/retrieves the encrypted blobs via
 * the backend API.
 *
 * The backend is a dumb JSONB store — all crypto happens client-side.
 */

import { base64ToUint8Array, uint8ArrayToBase64 } from '@/utils/binary-codec'
import { logError, logInfo } from '@/utils/error-handling'
import { authTokenManager } from '../auth'

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.tinfoil.sh'

const AES_GCM_IV_BYTES = 12

export interface KeyBundle {
  primary: string
  alternatives: string[]
}

export interface PasskeyCredentialEntry {
  id: string
  encrypted_keys: string // base64
  iv: string // base64
  created_at: string
}

// --- Encrypt / Decrypt ---

/**
 * Encrypt a key bundle with an AES-256-GCM KEK.
 * Returns base64-encoded IV and ciphertext.
 */
export async function encryptKeyBundle(
  kek: CryptoKey,
  keys: KeyBundle,
): Promise<{ iv: string; data: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES))
  const plaintext = new TextEncoder().encode(JSON.stringify(keys))

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    kek,
    plaintext,
  )

  return {
    iv: uint8ArrayToBase64(iv),
    data: uint8ArrayToBase64(new Uint8Array(ciphertext)),
  }
}

/**
 * Decrypt a key bundle from base64-encoded IV and ciphertext.
 */
export async function decryptKeyBundle(
  kek: CryptoKey,
  encrypted: { iv: string; data: string },
): Promise<KeyBundle> {
  const iv = base64ToUint8Array(encrypted.iv)
  const ciphertext = base64ToUint8Array(encrypted.data)

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    kek,
    ciphertext as BufferSource,
  )

  const json = new TextDecoder().decode(plaintext)
  const parsed = JSON.parse(json) as KeyBundle

  if (
    typeof parsed.primary !== 'string' ||
    !Array.isArray(parsed.alternatives)
  ) {
    throw new Error('Invalid key bundle structure')
  }

  return parsed
}

// --- Backend API ---

/**
 * Load all passkey credential entries for the authenticated user.
 */
export async function loadPasskeyCredentials(): Promise<
  PasskeyCredentialEntry[]
> {
  const headers = await authTokenManager.getAuthHeaders()
  const response = await fetch(`${API_BASE_URL}/api/passkey-credentials/`, {
    method: 'GET',
    headers,
  })

  if (!response.ok) {
    if (response.status === 404) {
      return []
    }
    throw new Error(
      `Failed to load passkey credentials: ${response.statusText}`,
    )
  }

  const data = await response.json()
  if (!Array.isArray(data)) {
    return []
  }

  return data as PasskeyCredentialEntry[]
}

/**
 * Save the full array of passkey credential entries for the authenticated user.
 * The backend overwrites the entire JSONB column — the client owns the structure.
 */
export async function savePasskeyCredentials(
  entries: PasskeyCredentialEntry[],
): Promise<boolean> {
  try {
    const headers = await authTokenManager.getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/api/passkey-credentials/`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(entries),
    })

    if (!response.ok) {
      throw new Error(
        `Failed to save passkey credentials: ${response.statusText}`,
      )
    }

    return true
  } catch (error) {
    logError('Failed to save passkey credentials', error, {
      component: 'PasskeyKeyStorage',
      action: 'savePasskeyCredentials',
    })
    return false
  }
}

/**
 * Check if any passkey credentials exist for the authenticated user.
 */
export async function hasPasskeyCredentials(): Promise<boolean> {
  try {
    const entries = await loadPasskeyCredentials()
    return entries.length > 0
  } catch (error) {
    logError('Failed to check passkey credentials', error, {
      component: 'PasskeyKeyStorage',
      action: 'hasPasskeyCredentials',
    })
    return false
  }
}

// --- High-level operations ---

/**
 * Encrypt the key bundle and upsert a credential entry, then save to backend.
 * If a credential with the same ID already exists, it is replaced.
 */
export async function storeEncryptedKeys(
  credentialId: string,
  kek: CryptoKey,
  keys: KeyBundle,
): Promise<boolean> {
  try {
    const encrypted = await encryptKeyBundle(kek, keys)
    const entry: PasskeyCredentialEntry = {
      id: credentialId,
      encrypted_keys: encrypted.data,
      iv: encrypted.iv,
      created_at: new Date().toISOString(),
    }

    const existing = await loadPasskeyCredentials()
    const updated = existing.filter((e) => e.id !== credentialId)
    updated.push(entry)

    const saved = await savePasskeyCredentials(updated)
    if (saved) {
      logInfo('Stored encrypted keys for passkey credential', {
        component: 'PasskeyKeyStorage',
        action: 'storeEncryptedKeys',
        metadata: { credentialId, totalEntries: updated.length },
      })
    }
    return saved
  } catch (error) {
    logError('Failed to store encrypted keys', error, {
      component: 'PasskeyKeyStorage',
      action: 'storeEncryptedKeys',
    })
    return false
  }
}

/**
 * Decrypt the key bundle for a specific credential entry.
 */
export async function retrieveEncryptedKeys(
  credentialId: string,
  kek: CryptoKey,
): Promise<KeyBundle | null> {
  try {
    const entries = await loadPasskeyCredentials()
    const entry = entries.find((e) => e.id === credentialId)
    if (!entry) {
      return null
    }

    return await decryptKeyBundle(kek, {
      iv: entry.iv,
      data: entry.encrypted_keys,
    })
  } catch (error) {
    logError('Failed to retrieve encrypted keys', error, {
      component: 'PasskeyKeyStorage',
      action: 'retrieveEncryptedKeys',
    })
    return null
  }
}
