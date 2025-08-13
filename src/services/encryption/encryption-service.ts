// Encryption service for end-to-end encryption of chat data

const ENCRYPTION_KEY_STORAGE_KEY = 'tinfoil-encryption-key'

export interface EncryptedData {
  iv: string // Base64 encoded initialization vector
  data: string // Base64 encoded encrypted data
}

export class EncryptionService {
  private encryptionKey: CryptoKey | null = null

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

  // Set encryption key from alphanumeric string
  async setKey(keyString: string): Promise<void> {
    try {
      let processedKey = keyString

      // Check if the key has the prefix
      if (keyString.startsWith('key_')) {
        processedKey = keyString.substring(4)
      } else {
        throw new Error('Key must start with "key_" prefix')
      }

      // Validate that the key only contains allowed characters after prefix
      if (!/^[a-z0-9]+$/.test(processedKey)) {
        throw new Error(
          'Key must only contain lowercase letters and numbers after the prefix',
        )
      }

      // Convert alphanumeric to bytes
      const keyData = this.alphanumericToBytes(processedKey)

      // Import as CryptoKey - ensure we have a proper ArrayBuffer
      this.encryptionKey = await crypto.subtle.importKey(
        'raw',
        keyData.buffer.slice(
          keyData.byteOffset,
          keyData.byteOffset + keyData.byteLength,
        ) as ArrayBuffer,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt'],
      )

      // Store the key in localStorage with prefix
      localStorage.setItem(ENCRYPTION_KEY_STORAGE_KEY, keyString)
    } catch (error) {
      throw new Error(`Invalid encryption key: ${error}`)
    }
  }

  // Get current encryption key as alphanumeric string
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

      // Decrypt - ensure we have proper ArrayBuffer types
      const ivBuffer = new Uint8Array(iv).buffer
      const dataBuffer = new Uint8Array(data).buffer

      const decryptedData = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: ivBuffer,
        },
        this.encryptionKey,
        dataBuffer,
      )

      // Convert decrypted data to string
      const decoder = new TextDecoder()
      const decryptedString = decoder.decode(decryptedData)

      // Check if the decrypted data is compressed (starts with gzip header "H4sI")
      // This is for backward compatibility with data that was compressed
      if (decryptedString.startsWith('H4sI')) {
        // Detect corrupted compressed data without attempting decompression
        let isCorrupted = false
        let corruptionReason = ''

        try {
          // Attempt to decode the base64 string to check its validity
          const compressedBytes = Uint8Array.from(atob(decryptedString), (c) =>
            c.charCodeAt(0),
          )

          // Check 1: Empty or too small gzip data (corrupted empty chats)
          // A minimal valid gzip file is at least 20 bytes
          if (compressedBytes.length < 20) {
            isCorrupted = true
            corruptionReason = `Compressed data too small (${compressedBytes.length} bytes) - likely corrupted empty chat`
          }

          // Check 2: Invalid gzip header
          if (
            !isCorrupted &&
            (compressedBytes[0] !== 0x1f || compressedBytes[1] !== 0x8b)
          ) {
            isCorrupted = true
            corruptionReason = 'Invalid gzip header'
          }

          // Check 3: Check compression method (should be 8 for deflate)
          if (!isCorrupted && compressedBytes[2] !== 0x08) {
            isCorrupted = true
            corruptionReason = `Invalid compression method: ${compressedBytes[2]}`
          }

          // Check 4: Check for specific patterns that indicate corruption
          // Empty gzipped data often has a specific size pattern
          if (!isCorrupted && compressedBytes.length === 23) {
            // This is a common size for empty gzipped data
            isCorrupted = true
            corruptionReason = 'Detected empty gzipped data pattern (23 bytes)'
          }

          // Check 5: Look for truncated data (gzip footer is missing)
          // Gzip footer is 8 bytes (CRC32 + uncompressed size)
          if (!isCorrupted && compressedBytes.length > 10) {
            // Check if the last 4 bytes look like a valid size field
            const lastFourBytes = compressedBytes.slice(-4)
            const uncompressedSize =
              (lastFourBytes[3] << 24) |
              (lastFourBytes[2] << 16) |
              (lastFourBytes[1] << 8) |
              lastFourBytes[0]

            // If uncompressed size is 0 or unreasonably large, it's likely corrupted
            if (uncompressedSize === 0) {
              isCorrupted = true
              corruptionReason =
                'Uncompressed size is 0 - empty or corrupted data'
            } else if (uncompressedSize > 100 * 1024 * 1024) {
              // > 100MB
              isCorrupted = true
              corruptionReason = `Unreasonable uncompressed size: ${uncompressedSize} bytes`
            }
          }
        } catch (e) {
          // If we can't even decode the base64, it's definitely corrupted
          isCorrupted = true
          corruptionReason = 'Invalid base64 encoding'
        }

        // For now, mark ALL compressed data as corrupted to prevent hanging
        // But include detailed reason for debugging
        if (isCorrupted) {
          throw new Error(`DATA_CORRUPTED: ${corruptionReason}`)
        } else {
          // Even if it looks valid, we're still disabling decompression for safety
          throw new Error(
            'DATA_CORRUPTED: Compressed data detected - decompression disabled for safety',
          )
        }
      }

      // Parse JSON directly for uncompressed data
      return JSON.parse(decryptedString)
    } catch (error) {
      throw new Error(`Decryption failed: ${error}`)
    }
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
