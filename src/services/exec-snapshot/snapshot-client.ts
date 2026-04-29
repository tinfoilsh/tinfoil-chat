/**
 * Exec Snapshot Client
 *
 * Talks to the controlplane storage endpoint and unwraps the DEK with the
 * user's X25519 private key.
 *
 * The endpoint stores `{ciphertext, wrappedDEK}` as one bundle. On chat open
 * the webapp only needs the small wrappedDEK part — the orchestrator fetches
 * the full bundle on resume.
 *
 * wrappedDEK wire format (from the executor /snapshot response):
 *   ephPub(32) || nonce(12) || aesGcmCiphertext(includes 16-byte tag)
 *
 * Unwrap:
 *   shared = x25519(privKey, ephPub)
 *   wrappingKey = HKDF-SHA256(shared,
 *                             salt = ephPub || userPub,
 *                             info = "tinfoil-exec-snapshot-wrap-v1",
 *                             len  = 32)
 *   dek = AES-GCM-Decrypt(wrappingKey, nonce, ciphertext)
 */
import { authTokenManager } from '@/services/auth'
import { base64ToUint8Array } from '@/utils/binary-codec'
import { logError } from '@/utils/error-handling'
import { x25519 } from '@noble/curves/ed25519.js'

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.tinfoil.sh'

const HKDF_WRAP_INFO = new TextEncoder().encode('tinfoil-exec-snapshot-wrap-v1')

const EPH_PUB_LEN = 32
const NONCE_LEN = 12
const MIN_WRAPPED_LEN = EPH_PUB_LEN + NONCE_LEN + 16 // ciphertext must contain at least the GCM tag

/**
 * Thrown when a snapshot was found but its wrappedDEK could not be opened
 * (corrupt, key changed, attestation drift, etc.). Mirrors the
 * `decryptionFailed` pattern used on the chat path so callers can surface a
 * clear error rather than silently losing snapshot state.
 */
export class SnapshotDecryptionFailedError extends Error {
  constructor(message = 'Failed to unwrap exec snapshot DEK') {
    super(message)
    this.name = 'SnapshotDecryptionFailedError'
  }
}

interface SnapshotBundle {
  ciphertext: string // base64
  wrappedDEK: string // base64
}

/**
 * Fetch only the wrappedDEK portion of a snapshot bundle.
 *
 * Returns null if no snapshot exists for this chat (404). All other non-OK
 * responses throw.
 */
export async function fetchWrappedDEK(
  chatId: string,
): Promise<Uint8Array | null> {
  const headers = await authTokenManager.getAuthHeaders()
  const response = await fetch(
    `${API_BASE_URL}/api/storage/exec-snapshot/${encodeURIComponent(chatId)}`,
    {
      method: 'GET',
      headers,
    },
  )

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch exec snapshot: ${response.status} ${response.statusText}`,
    )
  }

  const bundle = (await response.json()) as Partial<SnapshotBundle>
  if (typeof bundle.wrappedDEK !== 'string') {
    throw new Error('Invalid exec snapshot bundle: missing wrappedDEK')
  }

  return base64ToUint8Array(bundle.wrappedDEK)
}

/**
 * Unwrap a wrappedDEK with the user's X25519 private key, returning the
 * 32-byte plaintext DEK.
 *
 * @throws {SnapshotDecryptionFailedError} if the bundle is malformed or AES-GCM
 *   tag verification fails.
 */
export async function unwrapDEK(
  wrapped: Uint8Array,
  privKey: Uint8Array,
  userPub: Uint8Array,
): Promise<Uint8Array> {
  if (wrapped.byteLength < MIN_WRAPPED_LEN) {
    throw new SnapshotDecryptionFailedError(
      'Wrapped DEK too short to be a valid bundle',
    )
  }

  const ephPub = wrapped.subarray(0, EPH_PUB_LEN)
  const nonce = wrapped.subarray(EPH_PUB_LEN, EPH_PUB_LEN + NONCE_LEN)
  const ciphertext = wrapped.subarray(EPH_PUB_LEN + NONCE_LEN)

  let shared: Uint8Array
  try {
    shared = x25519.getSharedSecret(privKey, ephPub)
  } catch (error) {
    throw new SnapshotDecryptionFailedError(
      `X25519 shared-secret derivation failed: ${(error as Error).message}`,
    )
  }

  // HKDF-SHA256(shared, salt = ephPub || userPub, info, 32)
  const salt = new Uint8Array(EPH_PUB_LEN + userPub.byteLength)
  salt.set(ephPub, 0)
  salt.set(userPub, EPH_PUB_LEN)

  const sharedBuf = shared.buffer.slice(
    shared.byteOffset,
    shared.byteOffset + shared.byteLength,
  ) as ArrayBuffer

  let wrappingKey: CryptoKey
  try {
    const ikm = await crypto.subtle.importKey('raw', sharedBuf, 'HKDF', false, [
      'deriveKey',
    ])
    wrappingKey = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt,
        info: HKDF_WRAP_INFO,
      },
      ikm,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    )
  } catch (error) {
    throw new SnapshotDecryptionFailedError(
      `Wrapping-key derivation failed: ${(error as Error).message}`,
    )
  }

  let plaintext: ArrayBuffer
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource },
      wrappingKey,
      ciphertext as BufferSource,
    )
  } catch (error) {
    throw new SnapshotDecryptionFailedError(
      `AES-GCM decrypt failed: ${(error as Error).message}`,
    )
  }

  return new Uint8Array(plaintext)
}

/**
 * One-shot helper: fetch the wrappedDEK for a chat and unwrap it.
 *
 * Returns null when no snapshot exists yet (first-ever code-exec for the
 * chat). Throws SnapshotDecryptionFailedError when a snapshot exists but
 * cannot be opened with the supplied keypair.
 */
export async function fetchAndUnwrapDEK(
  chatId: string,
  privKey: Uint8Array,
  userPub: Uint8Array,
): Promise<Uint8Array | null> {
  let wrapped: Uint8Array | null
  try {
    wrapped = await fetchWrappedDEK(chatId)
  } catch (error) {
    logError('Failed to fetch wrapped exec-snapshot DEK', error, {
      component: 'snapshot-client',
      action: 'fetchAndUnwrapDEK',
      metadata: { chatId },
    })
    throw error
  }

  if (!wrapped) {
    return null
  }

  return unwrapDEK(wrapped, privKey, userPub)
}
