// Encryption service for end-to-end encryption of chat data
const ENCRYPTION_KEY_STORAGE_KEY = 'tinfoil-encryption-key'

export interface EncryptedData {
  iv: string // Base64 encoded initialization vector
  data: string // Base64 encoded encrypted data
}

export class EncryptionService {
  private encryptionKey: CryptoKey | null = null

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

    // Convert to base64 for storage
    return btoa(String.fromCharCode(...new Uint8Array(rawKey)))
  }

  // Initialize with existing key or generate new one
  async initialize(): Promise<string> {
    // Check if we have a stored key
    const storedKey = localStorage.getItem(ENCRYPTION_KEY_STORAGE_KEY)

    if (storedKey) {
      await this.setKey(storedKey)
      return storedKey
    } else {
      // Generate new key
      const newKey = await this.generateKey()
      localStorage.setItem(ENCRYPTION_KEY_STORAGE_KEY, newKey)
      await this.setKey(newKey)
      return newKey
    }
  }

  // Set encryption key from base64 string
  async setKey(keyString: string): Promise<void> {
    try {
      // Convert base64 to ArrayBuffer
      const keyData = Uint8Array.from(atob(keyString), (c) => c.charCodeAt(0))

      // Import as CryptoKey
      this.encryptionKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt'],
      )

      // Store the key in localStorage
      localStorage.setItem(ENCRYPTION_KEY_STORAGE_KEY, keyString)
    } catch (error) {
      throw new Error(`Invalid encryption key: ${error}`)
    }
  }

  // Get current encryption key as base64 string
  getKey(): string | null {
    return localStorage.getItem(ENCRYPTION_KEY_STORAGE_KEY)
  }

  // Remove encryption key
  clearKey(): void {
    this.encryptionKey = null
    localStorage.removeItem(ENCRYPTION_KEY_STORAGE_KEY)
  }

  // Encrypt data
  async encrypt(data: any): Promise<EncryptedData> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized')
    }

    // Convert data to string then to bytes
    const dataString = JSON.stringify(data)
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
      dataBytes,
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
      // Convert base64 back to bytes
      const iv = Uint8Array.from(atob(encryptedData.iv), (c) => c.charCodeAt(0))
      const data = Uint8Array.from(atob(encryptedData.data), (c) =>
        c.charCodeAt(0),
      )

      // Decrypt
      const decryptedData = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv,
        },
        this.encryptionKey,
        data,
      )

      // Convert back to string then parse JSON
      const decoder = new TextDecoder()
      const jsonString = decoder.decode(decryptedData)
      return JSON.parse(jsonString)
    } catch (error) {
      throw new Error(`Decryption failed: ${error}`)
    }
  }

  // Helper method to convert Uint8Array to base64 safely for large data
  private uint8ArrayToBase64(bytes: Uint8Array): string {
    // Process in chunks to avoid call stack size exceeded error
    const CHUNK_SIZE = 0x8000 // 32KB chunks
    let result = ''

    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      const chunk = bytes.subarray(i, i + CHUNK_SIZE)
      result += String.fromCharCode.apply(null, Array.from(chunk))
    }

    return btoa(result)
  }
}

export const encryptionService = new EncryptionService()
