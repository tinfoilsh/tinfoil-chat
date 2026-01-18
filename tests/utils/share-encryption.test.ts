import {
  decryptShare,
  encryptForShare,
  exportKeyToBase64url,
  generateShareKey,
  importKeyFromBase64url,
  type EncryptedShareData,
} from '@/utils/share-encryption'
import { describe, expect, it } from 'vitest'

describe('share-encryption', () => {
  describe('generateShareKey', () => {
    it('should generate a valid AES-256 key', async () => {
      const key = await generateShareKey()
      expect(key).toBeDefined()
      expect(key.type).toBe('secret')
      expect(key.algorithm.name).toBe('AES-GCM')
      expect((key.algorithm as AesKeyAlgorithm).length).toBe(256)
    })

    it('should generate extractable keys', async () => {
      const key = await generateShareKey()
      expect(key.extractable).toBe(true)
    })

    it('should generate unique keys each time', async () => {
      const key1 = await generateShareKey()
      const key2 = await generateShareKey()
      const exported1 = await exportKeyToBase64url(key1)
      const exported2 = await exportKeyToBase64url(key2)
      expect(exported1).not.toBe(exported2)
    })
  })

  describe('exportKeyToBase64url', () => {
    it('should export key to base64url format', async () => {
      const key = await generateShareKey()
      const exported = await exportKeyToBase64url(key)
      expect(exported).toBeDefined()
      expect(typeof exported).toBe('string')
      // 256-bit key = 32 bytes = 43 base64url chars (without padding)
      expect(exported.length).toBe(43)
    })

    it('should produce URL-safe characters only', async () => {
      const key = await generateShareKey()
      const exported = await exportKeyToBase64url(key)
      // base64url uses only alphanumeric, dash, and underscore
      expect(exported).toMatch(/^[A-Za-z0-9_-]+$/)
    })

    it('should not include padding characters', async () => {
      const key = await generateShareKey()
      const exported = await exportKeyToBase64url(key)
      expect(exported).not.toContain('=')
    })
  })

  describe('importKeyFromBase64url', () => {
    it('should import key from base64url format', async () => {
      const originalKey = await generateShareKey()
      const exported = await exportKeyToBase64url(originalKey)
      const importedKey = await importKeyFromBase64url(exported)

      expect(importedKey).toBeDefined()
      expect(importedKey.type).toBe('secret')
      expect(importedKey.algorithm.name).toBe('AES-GCM')
    })

    it('should roundtrip key export/import correctly', async () => {
      const originalKey = await generateShareKey()
      const exported = await exportKeyToBase64url(originalKey)
      const importedKey = await importKeyFromBase64url(exported)

      // Encrypt with original, decrypt with imported
      const testData = { message: 'test roundtrip' }
      const encrypted = await encryptForShare(testData, originalKey)
      const decrypted = await decryptShare(encrypted, exported)

      expect(decrypted).toEqual(testData)
    })

    it('should throw on invalid base64url', async () => {
      await expect(importKeyFromBase64url('!!!invalid!!!')).rejects.toThrow()
    })
  })

  describe('encryptForShare', () => {
    it('should encrypt data to EncryptedShareData format', async () => {
      const key = await generateShareKey()
      const data = { message: 'hello world' }
      const encrypted = await encryptForShare(data, key)

      expect(encrypted).toHaveProperty('v', 1)
      expect(encrypted).toHaveProperty('iv')
      expect(encrypted).toHaveProperty('ct')
      expect(typeof encrypted.iv).toBe('string')
      expect(typeof encrypted.ct).toBe('string')
    })

    it('should produce valid base64 for iv and ct', async () => {
      const key = await generateShareKey()
      const data = { test: 'data' }
      const encrypted = await encryptForShare(data, key)

      // IV should be 12 bytes = 16 base64 chars
      expect(encrypted.iv.length).toBe(16)
      // Both should be valid base64
      expect(() => atob(encrypted.iv)).not.toThrow()
      expect(() => atob(encrypted.ct)).not.toThrow()
    })

    it('should produce different ciphertext for same data (random IV)', async () => {
      const key = await generateShareKey()
      const data = { same: 'data' }
      const encrypted1 = await encryptForShare(data, key)
      const encrypted2 = await encryptForShare(data, key)

      // IVs should be different, so ciphertexts should differ
      expect(encrypted1.iv).not.toBe(encrypted2.iv)
      expect(encrypted1.ct).not.toBe(encrypted2.ct)
    })

    it('should handle empty objects', async () => {
      const key = await generateShareKey()
      const encrypted = await encryptForShare({}, key)
      expect(encrypted.v).toBe(1)
      expect(encrypted.iv).toBeDefined()
      expect(encrypted.ct).toBeDefined()
    })

    it('should compress data with gzip', async () => {
      const key = await generateShareKey()
      // Create repetitive data that compresses well
      const data = { content: 'hello '.repeat(1000) }
      const encrypted = await encryptForShare(data, key)

      // Version should be 1
      expect(encrypted.v).toBe(1)

      // Ciphertext (base64) size should be much smaller than raw JSON due to compression
      const rawJsonSize = JSON.stringify(data).length
      expect(encrypted.ct.length).toBeLessThan(rawJsonSize)
    })

    it('should handle complex nested data', async () => {
      const key = await generateShareKey()
      const data = {
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
        metadata: { title: 'Test Chat', createdAt: 1234567890 },
      }
      const encrypted = await encryptForShare(data, key)
      expect(encrypted.v).toBe(1)
      expect(encrypted.iv).toBeDefined()
      expect(encrypted.ct).toBeDefined()
    })

    it('should handle unicode content', async () => {
      const key = await generateShareKey()
      const keyBase64 = await exportKeyToBase64url(key)
      const data = { content: '你好世界 🌍 مرحبا' }
      const encrypted = await encryptForShare(data, key)
      const decrypted = await decryptShare(encrypted, keyBase64)
      expect(decrypted).toEqual(data)
    })
  })

  describe('decryptShare', () => {
    it('should decrypt encrypted data correctly', async () => {
      const key = await generateShareKey()
      const keyBase64 = await exportKeyToBase64url(key)
      const originalData = { message: 'secret message', count: 42 }

      const encrypted = await encryptForShare(originalData, key)
      const decrypted = await decryptShare(encrypted, keyBase64)

      expect(decrypted).toEqual(originalData)
    })

    it('should return null for missing iv', async () => {
      const key = await generateShareKey()
      const keyBase64 = await exportKeyToBase64url(key)
      const invalidData = { v: 1, ct: 'abc' } as EncryptedShareData

      const result = await decryptShare(invalidData, keyBase64)
      expect(result).toBeNull()
    })

    it('should return null for missing ct', async () => {
      const key = await generateShareKey()
      const keyBase64 = await exportKeyToBase64url(key)
      const invalidData = { v: 1, iv: 'abc' } as EncryptedShareData

      const result = await decryptShare(invalidData, keyBase64)
      expect(result).toBeNull()
    })

    it('should return null for unsupported version', async () => {
      const key = await generateShareKey()
      const keyBase64 = await exportKeyToBase64url(key)
      const data = { test: 'data' }
      const encrypted = await encryptForShare(data, key)

      // Change version to unsupported value
      const invalidData = {
        ...encrypted,
        v: 99,
      } as unknown as EncryptedShareData

      const result = await decryptShare(invalidData, keyBase64)
      expect(result).toBeNull()
    })

    it('should return null for corrupted ciphertext', async () => {
      const key = await generateShareKey()
      const keyBase64 = await exportKeyToBase64url(key)
      const data = { test: 'data' }
      const encrypted = await encryptForShare(data, key)

      // Corrupt the ciphertext by changing some characters
      const corruptedCt =
        encrypted.ct.substring(0, 10) + 'XXXX' + encrypted.ct.substring(14)
      const corruptedData = { ...encrypted, ct: corruptedCt }

      const result = await decryptShare(corruptedData, keyBase64)
      expect(result).toBeNull()
    })

    it('should return null for wrong key', async () => {
      const key1 = await generateShareKey()
      const key2 = await generateShareKey()
      const key2Base64 = await exportKeyToBase64url(key2)

      const data = { secret: 'data' }
      const encrypted = await encryptForShare(data, key1)

      // Try to decrypt with wrong key
      const result = await decryptShare(encrypted, key2Base64)
      expect(result).toBeNull()
    })

    it('should return null for invalid key format', async () => {
      const key = await generateShareKey()
      const data = { test: 'data' }
      const encrypted = await encryptForShare(data, key)

      const result = await decryptShare(encrypted, 'invalid-key')
      expect(result).toBeNull()
    })
  })

  describe('full encryption roundtrip', () => {
    it('should roundtrip simple data', async () => {
      const key = await generateShareKey()
      const keyBase64 = await exportKeyToBase64url(key)
      const data = { hello: 'world' }

      const encrypted = await encryptForShare(data, key)
      const decrypted = await decryptShare(encrypted, keyBase64)

      expect(decrypted).toEqual(data)
    })

    it('should roundtrip ShareableChatData-like structure', async () => {
      const key = await generateShareKey()
      const keyBase64 = await exportKeyToBase64url(key)
      const chatData = {
        v: 1,
        title: 'Test Conversation',
        messages: [
          { role: 'user', content: 'What is 2+2?', timestamp: 1705555555000 },
          {
            role: 'assistant',
            content: '2+2 equals 4.',
            timestamp: 1705555556000,
          },
        ],
        createdAt: 1705555554000,
      }

      const encrypted = await encryptForShare(chatData, key)
      const decrypted = await decryptShare(encrypted, keyBase64)

      expect(decrypted).toEqual(chatData)
    })

    it('should roundtrip large data', async () => {
      const key = await generateShareKey()
      const keyBase64 = await exportKeyToBase64url(key)

      // Create a large message array
      const messages = Array.from({ length: 100 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}: ${'Lorem ipsum '.repeat(50)}`,
        timestamp: 1705555555000 + i * 1000,
      }))

      const data = {
        v: 1,
        title: 'Large Chat',
        messages,
        createdAt: Date.now(),
      }

      const encrypted = await encryptForShare(data, key)
      const decrypted = await decryptShare(encrypted, keyBase64)

      expect(decrypted).toEqual(data)
    })
  })
})
