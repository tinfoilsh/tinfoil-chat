/**
 * Passkey Service — WebAuthn PRF Create/Authenticate + HKDF Key Derivation
 *
 * Uses the WebAuthn PRF extension to derive deterministic 32-byte secrets from
 * a passkey's built-in pseudo-random function. These secrets are then processed
 * through HKDF-SHA256 to produce an AES-256-GCM Key Encryption Key (KEK).
 *
 * References:
 * - W3C WebAuthn Level 3, §10.1.4 (PRF extension): https://w3c.github.io/webauthn/#prf-extension
 * - RFC 5869 (HKDF): https://tools.ietf.org/html/rfc5869
 */

import { logError, logInfo } from '@/utils/error-handling'

// Salt passed to PRF eval.first — the client internally computes:
// SHA-256("WebAuthn PRF" || 0x00 || PRF_EVAL_FIRST)
const PRF_EVAL_FIRST = new TextEncoder().encode('tinfoil-chat-key-encryption')

// HKDF info string for domain separation when deriving the KEK
const HKDF_INFO = new TextEncoder().encode('tinfoil-chat-kek-v1')

const RP_NAME = 'Tinfoil Chat'

export interface PrfPasskeyResult {
  credentialId: string
  prfOutput: ArrayBuffer
}

const RP_ID =
  typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'localhost'
    : 'tinfoil.sh'

/**
 * Base64url-encode a Uint8Array (no padding, URL-safe alphabet).
 */
function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Decode a base64url string back to a Uint8Array.
 */
function fromBase64Url(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Convert a BufferSource (ArrayBuffer or ArrayBufferView) to a plain ArrayBuffer.
 */
function toArrayBuffer(source: BufferSource): ArrayBuffer {
  if (source instanceof ArrayBuffer) {
    return source
  }
  // ArrayBufferView (e.g. Uint8Array)
  return source.buffer.slice(
    source.byteOffset,
    source.byteOffset + source.byteLength,
  ) as ArrayBuffer
}

/**
 * Create a new PRF-capable passkey for the given user.
 *
 * Returns the credential ID and PRF output, or null if PRF is not supported
 * by the authenticator or the user cancels.
 */
export async function createPrfPasskey(
  userId: string,
  userEmail: string,
  displayName: string,
): Promise<PrfPasskeyResult | null> {
  const userIdBytes = new TextEncoder().encode(userId)

  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { id: RP_ID, name: RP_NAME },
        user: {
          id: userIdBytes,
          name: userEmail,
          displayName: displayName || userEmail,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256 (broader compat)
        ],
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'required',
        },
        extensions: {
          prf: { eval: { first: PRF_EVAL_FIRST } },
        },
      },
    })) as PublicKeyCredential | null

    if (!credential) {
      return null
    }

    const extensionResults = credential.getClientExtensionResults()
    const prfResults = extensionResults.prf

    if (!prfResults?.enabled) {
      logInfo('Authenticator does not support PRF', {
        component: 'PasskeyService',
        action: 'createPrfPasskey',
      })
      return null
    }

    const credentialId = toBase64Url(credential.rawId)

    // Some authenticators return PRF results during creation, others don't.
    // "Not all authenticators support evaluating the PRFs during credential
    // creation so outputs may, or may not, be provided."
    // — https://w3c.github.io/webauthn/#prf-extension (eval description)
    if (prfResults.results?.first) {
      return {
        credentialId,
        prfOutput: toArrayBuffer(prfResults.results.first),
      }
    }

    // PRF enabled but no results during create — do an immediate get()
    logInfo(
      'PRF enabled but no results during creation, doing immediate auth',
      {
        component: 'PasskeyService',
        action: 'createPrfPasskey',
      },
    )
    return await authenticatePrfPasskey([credentialId])
  } catch (error) {
    // DOMException with name "NotAllowedError" means the user cancelled
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      logInfo('User cancelled passkey creation', {
        component: 'PasskeyService',
        action: 'createPrfPasskey',
      })
      return null
    }

    logError('Failed to create PRF passkey', error, {
      component: 'PasskeyService',
      action: 'createPrfPasskey',
    })
    return null
  }
}

/**
 * Authenticate with an existing PRF passkey to derive the PRF output.
 *
 * @param credentialIds - base64url-encoded credential IDs to allow. Pass all
 *   known PRF credential IDs so the browser can select the right one.
 * @returns The matched credential ID and PRF output, or null on failure/cancel.
 */
export async function authenticatePrfPasskey(
  credentialIds: string[],
): Promise<PrfPasskeyResult | null> {
  const allowCredentials: PublicKeyCredentialDescriptor[] = credentialIds.map(
    (id) => ({
      id: fromBase64Url(id),
      type: 'public-key',
    }),
  )

  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: RP_ID,
        allowCredentials,
        userVerification: 'required',
        extensions: {
          prf: { eval: { first: PRF_EVAL_FIRST } },
        },
      },
    })) as PublicKeyCredential | null

    if (!assertion) {
      return null
    }

    const extensionResults = assertion.getClientExtensionResults()
    const prfOutput = extensionResults.prf?.results?.first

    if (!prfOutput) {
      logError('PRF output missing from assertion', undefined, {
        component: 'PasskeyService',
        action: 'authenticatePrfPasskey',
      })
      return null
    }

    return {
      credentialId: toBase64Url(assertion.rawId),
      prfOutput: toArrayBuffer(prfOutput),
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      logInfo('User cancelled passkey authentication', {
        component: 'PasskeyService',
        action: 'authenticatePrfPasskey',
      })
      return null
    }

    logError('Failed to authenticate with PRF passkey', error, {
      component: 'PasskeyService',
      action: 'authenticatePrfPasskey',
    })
    return null
  }
}

/**
 * Derive an AES-256-GCM Key Encryption Key (KEK) from PRF output using HKDF.
 *
 * Raw PRF output is treated as Input Keying Material (IKM), not used directly as a key.
 * HKDF with a purpose-binding info string produces the final non-extractable CryptoKey.
 */
export async function deriveKeyEncryptionKey(
  prfOutput: ArrayBuffer,
): Promise<CryptoKey> {
  // Import PRF output as HKDF master key — non-extractable, derive-only
  const masterKey = await crypto.subtle.importKey(
    'raw',
    prfOutput,
    'HKDF',
    false, // non-extractable
    ['deriveKey'],
  )

  // Derive AES-256-GCM KEK with purpose-binding info string
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(), // empty salt is fine for high-entropy IKM (RFC 5869 §3.1)
      info: HKDF_INFO,
    },
    masterKey,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable
    ['encrypt', 'decrypt'],
  )
}
