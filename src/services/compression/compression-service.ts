import { logError, logInfo } from '@/utils/error-handling'

export interface CompressedData {
  compressed: string // Base64 encoded compressed data
  originalSize: number
  compressedSize: number
  compressionRatio: number
}

export class CompressionService {
  // Compress data using native CompressionStream API (gzip)
  async compress(data: string): Promise<CompressedData> {
    try {
      const encoder = new TextEncoder()
      const inputBytes = encoder.encode(data)
      const originalSize = inputBytes.length

      // Create a compression stream
      const compressionStream = new CompressionStream('gzip')
      const writer = compressionStream.writable.getWriter()
      writer.write(inputBytes)
      writer.close()

      // Read compressed data
      const compressedChunks: Uint8Array[] = []
      const reader = compressionStream.readable.getReader()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) compressedChunks.push(value)
      }

      // Combine chunks
      const totalLength = compressedChunks.reduce(
        (acc, chunk) => acc + chunk.length,
        0,
      )
      const compressedData = new Uint8Array(totalLength)
      let offset = 0
      for (const chunk of compressedChunks) {
        compressedData.set(chunk, offset)
        offset += chunk.length
      }

      const compressedSize = compressedData.length
      const compressionRatio = originalSize / compressedSize

      // Convert to base64
      const compressed = this.uint8ArrayToBase64(compressedData)

      logInfo(`Compression complete`, {
        component: 'CompressionService',
        action: 'compress',
        metadata: {
          originalSize,
          compressedSize,
          compressionRatio: compressionRatio.toFixed(2),
        },
      })

      return {
        compressed,
        originalSize,
        compressedSize,
        compressionRatio,
      }
    } catch (error) {
      logError('Compression failed', error, {
        component: 'CompressionService',
        action: 'compress',
      })
      throw new Error(`Compression failed: ${error}`)
    }
  }

  // Decompress data
  async decompress(compressedData: string): Promise<string> {
    try {
      // Convert base64 back to bytes
      const compressedBytes = this.base64ToUint8Array(compressedData)

      // Create decompression stream
      const decompressionStream = new DecompressionStream('gzip')
      const writer = decompressionStream.writable.getWriter()
      // Create a new Uint8Array to ensure proper type
      await writer.write(new Uint8Array(compressedBytes))
      await writer.close()

      // Read decompressed data
      const decompressedChunks: Uint8Array[] = []
      const reader = decompressionStream.readable.getReader()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) decompressedChunks.push(value)
      }

      // Combine chunks
      const totalLength = decompressedChunks.reduce(
        (acc, chunk) => acc + chunk.length,
        0,
      )
      const decompressedData = new Uint8Array(totalLength)
      let offset = 0
      for (const chunk of decompressedChunks) {
        decompressedData.set(chunk, offset)
        offset += chunk.length
      }

      // Convert back to string
      const decoder = new TextDecoder()
      return decoder.decode(decompressedData)
    } catch (error) {
      logError('Decompression failed', error, {
        component: 'CompressionService',
        action: 'decompress',
      })
      throw new Error(`Decompression failed: ${error}`)
    }
  }

  // Helper to convert Uint8Array to base64 safely for large data
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

  // Helper to convert base64 to Uint8Array
  private base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes
  }
}

export const compressionService = new CompressionService()
