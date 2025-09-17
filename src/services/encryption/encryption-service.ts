// Encryption service for end-to-end encryption of chat data

import { logInfo } from '@/utils/error-handling'

const ENCRYPTION_KEY_STORAGE_KEY = 'tinfoil-encryption-key'
const ENCRYPTION_KEY_HISTORY_STORAGE_KEY = 'tinfoil-encryption-key-history'

export interface EncryptedData {
  iv: string // Base64 encoded initialization vector
  data: string // Base64 encoded encrypted data
}

export class EncryptionService {
  private encryptionKey: CryptoKey | null = null
  private currentKeyString: string | null = null
  private fallbackKeyStrings: string[] = []
  private fallbackKeyCache: Map<string, CryptoKey> = new Map()

  // Helper to convert bytes to alphanumeric string (a-z, 0-9)
  // Always produces even-length strings (2 characters per byte)
  private bytesToAlphanumeric(bytes: Uint8Array): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''

    for (let i = 0; i < bytes.length; i++) {
      // Convert each byte to base36 (0-9, a-z)
      const byte = bytes[i]
      result += chars[Math.floor(byte / chars.length)]
      result += chars[byte % chars.length]
    }

    return result
  }

  // Helper to convert alphanumeric string back to bytes
  private alphanumericToBytes(str: string): Uint8Array {
    // Validate input length is even (required for proper decoding)
    if (str.length % 2 !== 0) {
      throw new Error('Key length must be even')
    }

    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    const bytes = new Uint8Array(str.length / 2)

    for (let i = 0; i < str.length; i += 2) {
      const high = chars.indexOf(str[i])
      const low = chars.indexOf(str[i + 1])

      if (high === -1 || low === -1) {
        throw new Error('Invalid character in key')
      }

      bytes[i / 2] = high * chars.length + low
    }

    return bytes
  }

  private getKeyBytes(keyString: string): Uint8Array {
    if (!keyString.startsWith('key_')) {
      throw new Error('Key must start with "key_" prefix')
    }

    const processedKey = keyString.substring(4)

    if (!/^[a-z0-9]+$/.test(processedKey)) {
      throw new Error(
        'Key must only contain lowercase letters and numbers after the prefix',
      )
    }

    return this.alphanumericToBytes(processedKey)
  }

  private async importCryptoKey(keyString: string): Promise<CryptoKey> {
    const keyData = this.getKeyBytes(keyString)

    return await crypto.subtle.importKey(
      'raw',
      keyData.buffer.slice(
        keyData.byteOffset,
        keyData.byteOffset + keyData.byteLength,
      ) as ArrayBuffer,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt'],
    )
  }

  private loadKeyHistoryFromStorage(): string[] {
    const rawHistory = localStorage.getItem(ENCRYPTION_KEY_HISTORY_STORAGE_KEY)

    if (!rawHistory) {
      return []
    }

    try {
      const parsed = JSON.parse(rawHistory)
      if (!Array.isArray(parsed)) {
        return []
      }

      return parsed.filter(
        (value: unknown): value is string =>
          typeof value === 'string' && value.startsWith('key_'),
      )
    } catch (error) {
      logInfo('Failed to parse encryption key history', {
        component: 'EncryptionService',
        action: 'loadKeyHistory',
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      })
      return []
    }
  }

  private saveKeyHistoryToStorage(history: string[]): void {
    localStorage.setItem(
      ENCRYPTION_KEY_HISTORY_STORAGE_KEY,
      JSON.stringify(history),
    )
  }

  private pruneFallbackCache(validKeys: string[]): void {
    for (const key of Array.from(this.fallbackKeyCache.keys())) {
      if (!validKeys.includes(key)) {
        this.fallbackKeyCache.delete(key)
      }
    }
  }

  private async getFallbackCryptoKey(
    keyString: string,
  ): Promise<CryptoKey | null> {
    const cached = this.fallbackKeyCache.get(keyString)
    if (cached) {
      return cached
    }

    try {
      const cryptoKey = await this.importCryptoKey(keyString)
      this.fallbackKeyCache.set(keyString, cryptoKey)
      return cryptoKey
    } catch (error) {
      logInfo('Failed to import fallback encryption key', {
        component: 'EncryptionService',
        action: 'getFallbackCryptoKey',
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      })
      return null
    }
  }

  // Generate a new encryption key
  async generateKey(): Promise<string> {
    const key = await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256,
      },
      true, // extractable
      ['encrypt', 'decrypt'],
    )

    // Export key to raw format
    const rawKey = await crypto.subtle.exportKey('raw', key)

    // Convert to alphanumeric format with key_ prefix
    return 'key_' + this.bytesToAlphanumeric(new Uint8Array(rawKey))
  }

  // Initialize with existing key or generate new one
  async initialize(): Promise<string> {
    // Check if we have a stored key
    const storedKey = localStorage.getItem(ENCRYPTION_KEY_STORAGE_KEY)
    this.fallbackKeyStrings = this.loadKeyHistoryFromStorage()
    this.pruneFallbackCache(this.fallbackKeyStrings)

    if (storedKey) {
      await this.setKey(storedKey)
      return storedKey
    } else {
      // Generate new key
      const newKey = await this.generateKey()
      await this.setKey(newKey)
      return newKey
    }
  }

  // Set encryption key from alphanumeric string
  async setKey(keyString: string): Promise<void> {
    try {
      const previousKey =
        this.currentKeyString ??
        localStorage.getItem(ENCRYPTION_KEY_STORAGE_KEY)

      const previousHistory = this.loadKeyHistoryFromStorage()

      // Import as CryptoKey - ensure we have a proper ArrayBuffer
      const importedKey = await this.importCryptoKey(keyString)

      // Prepare new history (excluding the key we are setting)
      let history = previousHistory.filter(
        (storedKey) => storedKey !== keyString,
      )

      if (previousKey && previousKey !== keyString) {
        history = [
          previousKey,
          ...history.filter((storedKey) => storedKey !== previousKey),
        ]
      }

      try {
        localStorage.setItem(ENCRYPTION_KEY_STORAGE_KEY, keyString)
        this.saveKeyHistoryToStorage(history)
      } catch (persistError) {
        try {
          if (previousKey) {
            localStorage.setItem(ENCRYPTION_KEY_STORAGE_KEY, previousKey)
          } else {
            localStorage.removeItem(ENCRYPTION_KEY_STORAGE_KEY)
          }
          this.saveKeyHistoryToStorage(previousHistory)
        } catch (rollbackError) {
          logInfo('Failed to rollback encryption key persistence', {
            component: 'EncryptionService',
            action: 'setKeyRollback',
            metadata: {
              persistError:
                persistError instanceof Error
                  ? persistError.message
                  : String(persistError),
              rollbackError:
                rollbackError instanceof Error
                  ? rollbackError.message
                  : String(rollbackError),
            },
          })
        }

        throw new Error(
          `Failed to persist encryption key: ${
            persistError instanceof Error
              ? persistError.message
              : String(persistError)
          }`,
        )
      }

      this.encryptionKey = importedKey
      this.currentKeyString = keyString
      this.fallbackKeyStrings = history
      this.fallbackKeyCache.delete(keyString)
      this.pruneFallbackCache(history)
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith('Failed to persist encryption key')
      ) {
        throw error
      }
      throw new Error(`Invalid encryption key: ${error}`)
    }
  }

  // Get current encryption key as alphanumeric string
  getKey(): string | null {
    return localStorage.getItem(ENCRYPTION_KEY_STORAGE_KEY)
  }

  // Remove encryption key
  clearKey(options: { persist?: boolean } = {}): void {
    const { persist = true } = options
    this.encryptionKey = null
    this.currentKeyString = null
    this.fallbackKeyCache.clear()
    this.fallbackKeyStrings = []
    if (persist) {
      try {
        localStorage.removeItem(ENCRYPTION_KEY_STORAGE_KEY)
        localStorage.removeItem(ENCRYPTION_KEY_HISTORY_STORAGE_KEY)
      } catch (error) {
        logInfo('Failed to remove encryption keys from storage', {
          component: 'EncryptionService',
          action: 'clearKeyPersist',
          metadata: {
            error: error instanceof Error ? error.message : String(error),
          },
        })
      }
    }
  }

  // Encrypt data
  async encrypt(data: any): Promise<EncryptedData> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized')
    }

    // Convert data to string
    const dataString = JSON.stringify(data)

    // Encrypt the data directly
    const encoder = new TextEncoder()
    const dataBytes = encoder.encode(dataString)

    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(12))

    // Encrypt
    const encryptedData = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      this.encryptionKey,
      dataBytes.buffer.slice(
        dataBytes.byteOffset,
        dataBytes.byteOffset + dataBytes.byteLength,
      ) as ArrayBuffer,
    )

    // Convert to base64 safely for large data
    const ivBase64 = this.uint8ArrayToBase64(iv)
    const dataBase64 = this.uint8ArrayToBase64(new Uint8Array(encryptedData))

    return {
      iv: ivBase64,
      data: dataBase64,
    }
  }

  // Decrypt data
  async decrypt(encryptedData: EncryptedData): Promise<any> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized')
    }

    try {
      // Validate input data
      if (!encryptedData.iv || !encryptedData.data) {
        throw new Error('Missing IV or data in encrypted data')
      }

      // Convert base64 back to bytes with validation
      let iv: Uint8Array
      let data: Uint8Array

      try {
        iv = Uint8Array.from(atob(encryptedData.iv), (c) => c.charCodeAt(0))
        data = Uint8Array.from(atob(encryptedData.data), (c) => c.charCodeAt(0))
      } catch (error) {
        throw new Error(`Invalid base64 encoding: ${error}`)
      }
      try {
        return await this.decryptWithKey(this.encryptionKey, iv, data)
      } catch (primaryError) {
        let lastError: unknown = primaryError

        for (const [index, keyString] of this.fallbackKeyStrings.entries()) {
          const fallbackKey = await this.getFallbackCryptoKey(keyString)
          if (!fallbackKey) {
            continue
          }

          try {
            const result = await this.decryptWithKey(fallbackKey, iv, data)
            logInfo('Decryption succeeded with fallback key', {
              component: 'EncryptionService',
              action: 'decrypt',
              metadata: { fallbackIndex: index },
            })
            return result
          } catch (fallbackError) {
            lastError = fallbackError
          }
        }

        if (lastError instanceof Error) {
          throw lastError
        }

        throw new Error(String(lastError ?? 'No valid encryption keys'))
      }
    } catch (error) {
      throw new Error(`Decryption failed: ${error}`)
    }
  }

  private async decryptWithKey(
    cryptoKey: CryptoKey,
    iv: Uint8Array,
    data: Uint8Array,
  ): Promise<any> {
    const decryptedData = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv.buffer.slice(
          iv.byteOffset,
          iv.byteOffset + iv.byteLength,
        ) as ArrayBuffer,
      },
      cryptoKey,
      data.buffer.slice(
        data.byteOffset,
        data.byteOffset + data.byteLength,
      ) as ArrayBuffer,
    )

    return await this.parseDecryptedPayload(decryptedData)
  }

  private async parseDecryptedPayload(
    decryptedData: ArrayBuffer,
  ): Promise<any> {
    const decoder = new TextDecoder()
    const decryptedString = decoder.decode(decryptedData)

    if (decryptedString.startsWith('H4sI')) {
      const { isGzippedData, safeDecompress } = await import(
        '@/utils/compression'
      )

      if (isGzippedData(decryptedString)) {
        logInfo('Decompressing gzipped data', {
          component: 'EncryptionService',
          action: 'decrypt',
          metadata: { dataLength: decryptedString.length },
        })

        const decompressedString = safeDecompress(decryptedString)

        if (!decompressedString) {
          throw new Error(
            'DATA_CORRUPTED: Failed to decompress data - may be corrupted or malformed',
          )
        }

        return JSON.parse(decompressedString)
      }
    }

    return JSON.parse(decryptedString)
  }

  // Helper method to convert Uint8Array to base64 safely for large data
  private uint8ArrayToBase64(bytes: Uint8Array): string {
    // Use a more efficient approach with array join instead of string concatenation
    const CHUNK_SIZE = 0x8000 // 32KB chunks
    const chunks: string[] = []

    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      const chunk = bytes.subarray(i, i + CHUNK_SIZE)
      chunks.push(String.fromCharCode.apply(null, Array.from(chunk)))
    }

    return btoa(chunks.join(''))
  }
}

export const encryptionService = new EncryptionService()
