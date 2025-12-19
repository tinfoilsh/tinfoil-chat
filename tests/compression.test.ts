import { isGzippedData, safeDecompress } from '@/utils/compression'
import pako from 'pako'
import { describe, expect, it } from 'vitest'

// Helper to create valid gzipped base64 data
function createGzippedBase64(data: object): string {
  const jsonString = JSON.stringify(data)
  const compressed = pako.gzip(jsonString)
  // Convert Uint8Array to base64
  let binary = ''
  for (let i = 0; i < compressed.length; i++) {
    binary += String.fromCharCode(compressed[i])
  }
  return btoa(binary)
}

describe('compression', () => {
  describe('isGzippedData', () => {
    it('should return true for gzip header prefix', () => {
      expect(isGzippedData('H4sIAAAAAAAA')).toBe(true)
    })

    it('should return false for non-gzip data', () => {
      expect(isGzippedData('eyJmb28iOiJiYXIifQ==')).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(isGzippedData('')).toBe(false)
    })

    it('should return false for non-string input', () => {
      expect(isGzippedData(null as any)).toBe(false)
      expect(isGzippedData(undefined as any)).toBe(false)
      expect(isGzippedData(123 as any)).toBe(false)
    })

    it('should detect actual gzipped content', () => {
      const gzipped = createGzippedBase64({ test: 'data' })
      expect(isGzippedData(gzipped)).toBe(true)
    })
  })

  describe('safeDecompress', () => {
    it('should decompress valid gzipped JSON data', () => {
      const original = { message: 'Hello, World!', count: 42 }
      const gzipped = createGzippedBase64(original)

      const result = safeDecompress(gzipped)
      expect(result).toBe(JSON.stringify(original))
    })

    it('should return null for null input', () => {
      expect(safeDecompress(null as any)).toBeNull()
    })

    it('should return null for undefined input', () => {
      expect(safeDecompress(undefined as any)).toBeNull()
    })

    it('should return null for non-string input', () => {
      expect(safeDecompress(123 as any)).toBeNull()
    })

    it('should return null for non-gzip data (wrong prefix)', () => {
      expect(safeDecompress('eyJmb28iOiJiYXIifQ==')).toBeNull()
    })

    it('should return null for invalid base64', () => {
      expect(safeDecompress('H4sI!!!invalid!!!')).toBeNull()
    })

    it('should return null for truncated gzip data', () => {
      // Valid gzip prefix but truncated
      expect(safeDecompress('H4sI')).toBeNull()
    })

    it('should handle complex nested JSON', () => {
      const complex = {
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
        metadata: {
          timestamp: '2024-01-01',
          nested: { deep: { value: true } },
        },
      }
      const gzipped = createGzippedBase64(complex)

      const result = safeDecompress(gzipped)
      expect(JSON.parse(result!)).toEqual(complex)
    })

    it('should handle unicode content', () => {
      const unicode = { content: '你好世界 🌍 émojis' }
      const gzipped = createGzippedBase64(unicode)

      const result = safeDecompress(gzipped)
      expect(JSON.parse(result!)).toEqual(unicode)
    })

    it('should return null for decompressed non-JSON content', () => {
      // Create gzipped data that is not valid JSON
      const notJson = 'this is not json'
      const compressed = pako.gzip(notJson)
      let binary = ''
      for (let i = 0; i < compressed.length; i++) {
        binary += String.fromCharCode(compressed[i])
      }
      const gzipped = btoa(binary)

      expect(safeDecompress(gzipped)).toBeNull()
    })
  })
})
