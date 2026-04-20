import {
  authenticatePrfPasskey,
  createPrfPasskey,
  deriveKeyEncryptionKey,
  PasskeyTimeoutError,
  PrfNotSupportedError,
} from '@/services/passkey/passkey-service'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

  describe('PRF failure handling', () => {
    const originalCredentials = navigator.credentials

    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
      Object.defineProperty(navigator, 'credentials', {
        value: originalCredentials,
        writable: true,
        configurable: true,
      })
    })

    function installCredentialsMock(stub: {
      create?: (...args: any[]) => unknown
      get?: (...args: any[]) => unknown
    }): void {
      Object.defineProperty(navigator, 'credentials', {
        value: stub,
        writable: true,
        configurable: true,
      })
    }

    function fakePublicKeyCredential(options?: {
      prfEnabled?: boolean
      prfFirst?: ArrayBuffer | null
    }): any {
      const rawId = crypto.getRandomValues(new Uint8Array(16)).buffer
      return {
        rawId,
        getClientExtensionResults: () => {
          if (!options?.prfEnabled) return {}
          const prf: {
            enabled: boolean
            results?: { first: ArrayBuffer }
          } = { enabled: true }
          if (options.prfFirst) {
            prf.results = { first: options.prfFirst }
          }
          return { prf }
        },
      }
    }

    it('createPrfPasskey throws PrfNotSupportedError when prf.enabled is false', async () => {
      installCredentialsMock({
        create: vi.fn(async () =>
          fakePublicKeyCredential({ prfEnabled: false }),
        ),
      })

      await expect(
        createPrfPasskey('user-id', 'user@example.com', 'Test User'),
      ).rejects.toBeInstanceOf(PrfNotSupportedError)
    })

    it('createPrfPasskey throws PrfNotSupportedError when the post-create assertion yields no PRF output', async () => {
      installCredentialsMock({
        create: vi.fn(async () =>
          fakePublicKeyCredential({ prfEnabled: true, prfFirst: null }),
        ),
        get: vi.fn(async () => fakePublicKeyCredential({ prfEnabled: false })),
      })

      await expect(
        createPrfPasskey('user-id', 'user@example.com', 'Test User'),
      ).rejects.toBeInstanceOf(PrfNotSupportedError)
    })

    it('createPrfPasskey returns the result when PRF output is provided on creation', async () => {
      const prfFirst = crypto.getRandomValues(new Uint8Array(32))
        .buffer as ArrayBuffer
      installCredentialsMock({
        create: vi.fn(async () =>
          fakePublicKeyCredential({ prfEnabled: true, prfFirst }),
        ),
      })

      const result = await createPrfPasskey(
        'user-id',
        'user@example.com',
        'Test User',
      )

      expect(result).not.toBeNull()
      expect(result?.prfOutput.byteLength).toBe(32)
    })

    it('createPrfPasskey returns null when the user cancels (NotAllowedError)', async () => {
      installCredentialsMock({
        create: vi.fn(async () => {
          throw new DOMException('User cancelled', 'NotAllowedError')
        }),
      })

      const result = await createPrfPasskey(
        'user-id',
        'user@example.com',
        'Test User',
      )
      expect(result).toBeNull()
    })

    it('createPrfPasskey throws PasskeyTimeoutError when the provider hangs', async () => {
      installCredentialsMock({
        create: vi.fn(() => new Promise(() => {})),
      })

      const resultPromise = createPrfPasskey(
        'user-id',
        'user@example.com',
        'Test User',
      )
      // Swallow the rejection while we advance time so Node doesn't flag
      // this as an unhandled rejection between fake-timer ticks.
      resultPromise.catch(() => {})

      await vi.advanceTimersByTimeAsync(15_000)

      await expect(resultPromise).rejects.toBeInstanceOf(PasskeyTimeoutError)
    })

    it('authenticatePrfPasskey throws PasskeyTimeoutError when the provider hangs', async () => {
      installCredentialsMock({
        get: vi.fn(() => new Promise(() => {})),
      })

      const resultPromise = authenticatePrfPasskey(['AAAA'])
      resultPromise.catch(() => {})

      await vi.advanceTimersByTimeAsync(15_000)

      await expect(resultPromise).rejects.toBeInstanceOf(PasskeyTimeoutError)
    })

    it('authenticatePrfPasskey returns null when PRF output is missing from assertion', async () => {
      installCredentialsMock({
        get: vi.fn(async () => fakePublicKeyCredential({ prfEnabled: false })),
      })

      const result = await authenticatePrfPasskey(['AAAA'])
      expect(result).toBeNull()
    })
  })
})
