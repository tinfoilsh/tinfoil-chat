/**
 * Exec Snapshot Key Derivation
 *
 * Derives the user's X25519 keypair for encrypted /workspace snapshots from the
 * existing passkey PRF master, using HKDF-SHA256 with a distinct info label.
 *
 * This is a SIBLING derivation to `deriveKeyEncryptionKey` (chat KEK) — same
 * PRF master, different info label, fully independent output. Do not change
 * the existing chat-key derivation.
 *
 * The 32 HKDF output bytes are the X25519 private key directly (Curve25519
 * accepts any 32 bytes — the curve clamps internally). The pubkey is shared
 * freely; the privkey lives only briefly in webapp memory and is re-derived
 * on demand. Nothing private is ever persisted.
 */
import { x25519 } from '@noble/curves/ed25519.js'

const HKDF_INFO = new TextEncoder().encode('tinfoil-exec-snapshot-v1')

export interface ExecKeypair {
  /** 32-byte X25519 private key. Hold briefly; never persist or transmit. */
  privKey: Uint8Array
  /** 32-byte X25519 public key. Safe to share. */
  pubKey: Uint8Array
}

/**
 * Derive the user's X25519 exec-snapshot keypair from the PRF master.
 *
 * @param prfMaster - The raw PRF output from the WebAuthn PRF extension.
 *   Same input as the chat KEK derivation.
 */
export async function deriveExecKeypair(
  prfMaster: ArrayBuffer | Uint8Array,
): Promise<ExecKeypair> {
  const ikm =
    prfMaster instanceof Uint8Array
      ? (prfMaster.buffer.slice(
          prfMaster.byteOffset,
          prfMaster.byteOffset + prfMaster.byteLength,
        ) as ArrayBuffer)
      : prfMaster

  // Import PRF master as HKDF IKM. Non-extractable, derive-only.
  const masterKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, [
    'deriveBits',
  ])

  // 32 bytes out — used directly as the X25519 private scalar.
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      // Empty salt — high-entropy IKM, matches the existing chat KEK derivation
      // (RFC 5869 §3.1).
      salt: new Uint8Array(),
      info: HKDF_INFO,
    },
    masterKey,
    32 * 8,
  )

  const privKey = new Uint8Array(derived)
  const pubKey = x25519.getPublicKey(privKey)

  return { privKey, pubKey }
}
