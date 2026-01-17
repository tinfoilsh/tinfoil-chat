import { logError, logWarning } from '@/utils/error-handling'
import pako from 'pako'

/**
 * Shareable chat data structure for URL encoding
 */
export type ShareableChatData = {
  v: 1
  title: string
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
    documentContent?: string
    documents?: Array<{ name: string }>
    timestamp: number
    thoughts?: string
    thinkingDuration?: number
    isError?: boolean
  }>
  createdAt: number
}

/**
 * Compress an object to gzipped base64 string
 * Returns null if compression fails
 */
export function compressToBase64(data: object): string | null {
  try {
    const jsonString = JSON.stringify(data)
    const compressed = pako.gzip(jsonString)
    const binaryString = Array.from(compressed)
      .map((byte) => String.fromCharCode(byte))
      .join('')
    return btoa(binaryString)
  } catch (error) {
    logError('Failed to compress data', error, {
      component: 'CompressionUtil',
      action: 'compressToBase64',
    })
    return null
  }
}

/**
 * Parse and validate shareable chat data from JSON string
 * Returns null if parsing fails or data is invalid
 */
export function parseShareableChatData(
  jsonString: string,
): ShareableChatData | null {
  try {
    const data = JSON.parse(jsonString)

    if (
      typeof data !== 'object' ||
      data === null ||
      data.v !== 1 ||
      typeof data.title !== 'string' ||
      !Array.isArray(data.messages) ||
      typeof data.createdAt !== 'number'
    ) {
      logWarning('Invalid shareable chat data structure', {
        component: 'CompressionUtil',
        action: 'parseShareableChatData',
      })
      return null
    }

    for (const msg of data.messages) {
      if (
        typeof msg !== 'object' ||
        msg === null ||
        (msg.role !== 'user' && msg.role !== 'assistant') ||
        typeof msg.content !== 'string' ||
        typeof msg.timestamp !== 'number'
      ) {
        logWarning('Invalid message in shareable chat data', {
          component: 'CompressionUtil',
          action: 'parseShareableChatData',
        })
        return null
      }
    }

    return data as ShareableChatData
  } catch (error) {
    logError('Failed to parse shareable chat data', error, {
      component: 'CompressionUtil',
      action: 'parseShareableChatData',
    })
    return null
  }
}

/**
 * Safely decompress gzipped base64 data with validation
 * Returns null if decompression fails or data is corrupted
 */
export function safeDecompress(base64Data: string): string | null {
  try {
    // Validate base64 format
    if (!base64Data || typeof base64Data !== 'string') {
      logWarning('Invalid base64 data provided for decompression', {
        component: 'CompressionUtil',
        action: 'safeDecompress',
      })
      return null
    }

    // Check if it looks like gzip data (starts with H4sI in base64)
    if (!base64Data.startsWith('H4sI')) {
      logWarning('Data does not appear to be gzipped', {
        component: 'CompressionUtil',
        action: 'safeDecompress',
        metadata: { prefix: base64Data.substring(0, 4) },
      })
      return null
    }

    // Decode base64 to binary
    let binaryString: string
    try {
      binaryString = atob(base64Data)
    } catch (error) {
      logError('Failed to decode base64', error, {
        component: 'CompressionUtil',
        action: 'safeDecompress',
        metadata: { dataLength: base64Data.length },
      })
      return null
    }

    // Convert binary string to Uint8Array
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    // Validate gzip header (1f 8b for gzip)
    if (bytes.length < 10 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
      logWarning('Invalid gzip header detected', {
        component: 'CompressionUtil',
        action: 'safeDecompress',
        metadata: {
          headerBytes: bytes.length >= 2 ? [bytes[0], bytes[1]] : [],
          dataLength: bytes.length,
        },
      })
      return null
    }

    // Check for reasonable size limit to prevent memory issues
    if (bytes.length > 50 * 1024 * 1024) {
      // 50MB limit
      logWarning('Compressed data exceeds size limit', {
        component: 'CompressionUtil',
        action: 'safeDecompress',
        metadata: { dataLength: bytes.length },
      })
      return null
    }

    // Attempt decompression
    let decompressed: string
    try {
      decompressed = pako.ungzip(bytes, { to: 'string' })
    } catch (error) {
      logError('Decompression failed', error, {
        component: 'CompressionUtil',
        action: 'safeDecompress',
        metadata: { dataLength: bytes.length },
      })
      return null
    }

    // Validate that the result is valid JSON
    try {
      JSON.parse(decompressed)
      return decompressed
    } catch (error) {
      logWarning('Decompressed data is not valid JSON', {
        component: 'CompressionUtil',
        action: 'safeDecompress',
        metadata: { resultLength: decompressed.length },
      })
      return null
    }
  } catch (error) {
    logError('Unexpected error during decompression', error, {
      component: 'CompressionUtil',
      action: 'safeDecompress',
    })
    return null
  }
}

/**
 * Check if a base64 string appears to be gzipped data
 */
export function isGzippedData(base64Data: string): boolean {
  return typeof base64Data === 'string' && base64Data.startsWith('H4sI')
}
