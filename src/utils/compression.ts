import { logError, logWarning } from '@/utils/error-handling'
import pako from 'pako'

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
