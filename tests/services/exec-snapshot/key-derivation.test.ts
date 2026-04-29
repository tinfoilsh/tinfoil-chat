import { deriveExecKeypair } from '@/services/exec-snapshot/key-derivation'
import {
  SnapshotDecryptionFailedError,
  unwrapDEK,
} from '@/services/exec-snapshot/snapshot-client'
import { x25519 } from '@noble/curves/ed25519.js'
import { describe, expect, it } from 'vitest'

const PRF_FIXTURE = new Uint8Array(32).map((_, i) => i + 1)

async function hkdfSha256(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8,
  )
  return new Uint8Array(bits)
}

describe('exec-snapshot/key-derivation', () => {
  it('produces deterministic 32-byte X25519 keys for a fixed PRF master', async () => {
    const a = await deriveExecKeypair(PRF_FIXTURE)
    const b = await deriveExecKeypair(PRF_FIXTURE)

    expect(a.privKey.byteLength).toBe(32)
    expect(a.pubKey.byteLength).toBe(32)
    expect(Array.from(a.privKey)).toEqual(Array.from(b.privKey))
    expect(Array.from(a.pubKey)).toEqual(Array.from(b.pubKey))
  })

  it('produces a pubkey that matches direct x25519.getPublicKey', async () => {
    const { privKey, pubKey } = await deriveExecKeypair(PRF_FIXTURE)
    const direct = x25519.getPublicKey(privKey)
    expect(Array.from(direct)).toEqual(Array.from(pubKey))
  })

  it('changes when the PRF master changes', async () => {
    const other = new Uint8Array(32).map((_, i) => 0xff - i)
    const a = await deriveExecKeypair(PRF_FIXTURE)
    const b = await deriveExecKeypair(other)
    expect(Array.from(a.privKey)).not.toEqual(Array.from(b.privKey))
    expect(Array.from(a.pubKey)).not.toEqual(Array.from(b.pubKey))
  })

  it('uses a different info-label than the chat KEK derivation', async () => {
    // Sanity check: chat KEK uses info "tinfoil-chat-kek-v1"; this derivation
    // must produce a different output for the same PRF master.
    const chatKekBits = await hkdfSha256(
      PRF_FIXTURE,
      new Uint8Array(),
      new TextEncoder().encode('tinfoil-chat-kek-v1'),
      32,
    )
    const exec = await deriveExecKeypair(PRF_FIXTURE)
    expect(Array.from(chatKekBits)).not.toEqual(Array.from(exec.privKey))
  })
})

describe('exec-snapshot/unwrapDEK', () => {
  // Mirror the on-the-wire wrap format used by the executor:
  //   ephPub(32) || nonce(12) || aesGcmCiphertext(includes 16-byte tag)
  // wrappingKey = HKDF-SHA256(x25519(ephPriv, userPub),
  //                           salt = ephPub || userPub,
  //                           info = "tinfoil-exec-snapshot-wrap-v1",
  //                           len  = 32)
  async function wrapDEK(
    dek: Uint8Array,
    userPub: Uint8Array,
  ): Promise<Uint8Array> {
    const ephPriv = crypto.getRandomValues(new Uint8Array(32))
    const ephPub = x25519.getPublicKey(ephPriv)
    const shared = x25519.getSharedSecret(ephPriv, userPub)

    const salt = new Uint8Array(64)
    salt.set(ephPub, 0)
    salt.set(userPub, 32)

    const wrappingKeyBits = await hkdfSha256(
      shared,
      salt,
      new TextEncoder().encode('tinfoil-exec-snapshot-wrap-v1'),
      32,
    )
    const wrappingKey = await crypto.subtle.importKey(
      'raw',
      wrappingKeyBits,
      { name: 'AES-GCM' },
      false,
      ['encrypt'],
    )
    const nonce = crypto.getRandomValues(new Uint8Array(12))
    const ct = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce },
        wrappingKey,
        dek,
      ),
    )

    const out = new Uint8Array(32 + 12 + ct.byteLength)
    out.set(ephPub, 0)
    out.set(nonce, 32)
    out.set(ct, 44)
    return out
  }

  it('round-trips a 32-byte DEK', async () => {
    const { privKey, pubKey } = await deriveExecKeypair(PRF_FIXTURE)
    const dek = crypto.getRandomValues(new Uint8Array(32))

    const wrapped = await wrapDEK(dek, pubKey)
    const unwrapped = await unwrapDEK(wrapped, privKey, pubKey)

    expect(unwrapped.byteLength).toBe(32)
    expect(Array.from(unwrapped)).toEqual(Array.from(dek))
  })

  it('throws SnapshotDecryptionFailedError on tampered ciphertext', async () => {
    const { privKey, pubKey } = await deriveExecKeypair(PRF_FIXTURE)
    const dek = crypto.getRandomValues(new Uint8Array(32))

    const wrapped = await wrapDEK(dek, pubKey)
    // Flip a bit inside the ciphertext (after the 32-byte ephPub + 12-byte nonce).
    wrapped[50] ^= 0x01

    await expect(unwrapDEK(wrapped, privKey, pubKey)).rejects.toBeInstanceOf(
      SnapshotDecryptionFailedError,
    )
  })

  it('throws SnapshotDecryptionFailedError when the privkey is wrong', async () => {
    const a = await deriveExecKeypair(PRF_FIXTURE)
    const otherPrf = new Uint8Array(32).map((_, i) => 0xa0 ^ i)
    const b = await deriveExecKeypair(otherPrf)

    const dek = crypto.getRandomValues(new Uint8Array(32))
    const wrapped = await wrapDEK(dek, a.pubKey)

    await expect(
      unwrapDEK(wrapped, b.privKey, a.pubKey),
    ).rejects.toBeInstanceOf(SnapshotDecryptionFailedError)
  })

  it('throws on truncated input', async () => {
    const { privKey, pubKey } = await deriveExecKeypair(PRF_FIXTURE)
    const tooShort = new Uint8Array(10)
    await expect(unwrapDEK(tooShort, privKey, pubKey)).rejects.toBeInstanceOf(
      SnapshotDecryptionFailedError,
    )
  })
})
