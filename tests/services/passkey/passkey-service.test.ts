import { deriveKeyEncryptionKey } from '@/services/passkey/passkey-service'
import { describe, expect, it } from 'vitest'

describe('passkey-service', () => {
  describe('deriveKeyEncryptionKey', () => {
    it('should derive a CryptoKey from PRF output', async () => {
      const prfOutput = crypto.getRandomValues(new Uint8Array(32))
        .buffer as ArrayBuffer
      const kek = await deriveKeyEncryptionKey(prfOutput)

      expect(kek).toBeInstanceOf(CryptoKey)
      expect(kek.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 })
      expect(kek.usages).toContain('encrypt')
      expect(kek.usages).toContain('decrypt')
      expect(kek.extractable).toBe(false)
    })

    it('should derive the same key from the same PRF output', async () => {
      const prfOutput = crypto.getRandomValues(new Uint8Array(32))

      const kek1 = await deriveKeyEncryptionKey(
        prfOutput.buffer.slice(0) as ArrayBuffer,
      )
      const kek2 = await deriveKeyEncryptionKey(
        prfOutput.buffer.slice(0) as ArrayBuffer,
      )

      // Both keys are non-extractable, so we can't compare raw bytes.
      // Instead, verify they can decrypt each other's ciphertext.
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const plaintext = new TextEncoder().encode('test data')

      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        kek1,
        plaintext,
      )

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        kek2,
        ciphertext,
      )

      expect(new TextDecoder().decode(decrypted)).toBe('test data')
    })

    it('should derive different keys from different PRF outputs', async () => {
      const prf1 = crypto.getRandomValues(new Uint8Array(32))
        .buffer as ArrayBuffer
      const prf2 = crypto.getRandomValues(new Uint8Array(32))
        .buffer as ArrayBuffer

      const kek1 = await deriveKeyEncryptionKey(prf1)
      const kek2 = await deriveKeyEncryptionKey(prf2)

      // Encrypt with kek1, try to decrypt with kek2 — should fail
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const plaintext = new TextEncoder().encode('test data')

      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        kek1,
        plaintext,
      )

      await expect(
        crypto.subtle.decrypt({ name: 'AES-GCM', iv }, kek2, ciphertext),
      ).rejects.toThrow()
    })
  })
})
