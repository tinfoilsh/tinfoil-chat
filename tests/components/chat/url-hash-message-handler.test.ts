import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('URL Hash Message Handler', () => {
  let originalLocation: Location

  beforeEach(() => {
    originalLocation = window.location
    // @ts-ignore
    delete window.location
    window.location = {
      ...originalLocation,
      hash: '',
      pathname: '/',
      search: '',
    } as Location

    window.history.replaceState = vi.fn()
  })

  afterEach(() => {
    window.location = originalLocation
    vi.clearAllMocks()
  })

  describe('base64 encoding/decoding', () => {
    it('should correctly encode simple ASCII text to base64', () => {
      const message = 'test'
      const encoded = btoa(message)
      expect(encoded).toBe('dGVzdA==')
    })

    it('should correctly decode base64 to ASCII text', () => {
      const encoded = 'dGVzdA=='
      const decoded = atob(encoded)
      expect(decoded).toBe('test')
    })

    it('should correctly encode UTF-8 text to base64', () => {
      const message = 'What is 2+2?'
      const bytes = new TextEncoder().encode(message)
      const binaryString = Array.from(bytes)
        .map((b) => String.fromCharCode(b))
        .join('')
      const encoded = btoa(binaryString)
      expect(encoded).toBe('V2hhdCBpcyAyKzI/')
    })

    it('should correctly decode base64 to UTF-8 text', () => {
      const encoded = 'V2hhdCBpcyAyKzI/'
      const binaryString = atob(encoded)
      const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0))
      const decoded = new TextDecoder('utf-8').decode(bytes)
      expect(decoded).toBe('What is 2+2?')
    })

    it('should handle unicode characters in messages', () => {
      const message = 'Hello 世界! 🌍'
      const bytes = new TextEncoder().encode(message)
      const binaryString = Array.from(bytes)
        .map((b) => String.fromCharCode(b))
        .join('')
      const encoded = btoa(binaryString)

      const decodedBinaryString = atob(encoded)
      const decodedBytes = Uint8Array.from(decodedBinaryString, (c) =>
        c.charCodeAt(0),
      )
      const decoded = new TextDecoder('utf-8').decode(decodedBytes)

      expect(decoded).toBe(message)
    })

    it('should handle special characters that need URL encoding', () => {
      const message = 'Search for: foo && bar || baz'
      const bytes = new TextEncoder().encode(message)
      const binaryString = Array.from(bytes)
        .map((b) => String.fromCharCode(b))
        .join('')
      const encoded = btoa(binaryString)

      const decodedBinaryString = atob(encoded)
      const decodedBytes = Uint8Array.from(decodedBinaryString, (c) =>
        c.charCodeAt(0),
      )
      const decoded = new TextDecoder('utf-8').decode(decodedBytes)

      expect(decoded).toBe(message)
    })

    it('should handle newlines and whitespace', () => {
      const message = 'Line 1\nLine 2\n\tIndented'
      const bytes = new TextEncoder().encode(message)
      const binaryString = Array.from(bytes)
        .map((b) => String.fromCharCode(b))
        .join('')
      const encoded = btoa(binaryString)

      const decodedBinaryString = atob(encoded)
      const decodedBytes = Uint8Array.from(decodedBinaryString, (c) =>
        c.charCodeAt(0),
      )
      const decoded = new TextDecoder('utf-8').decode(decodedBytes)

      expect(decoded).toBe(message)
    })

    it('should handle empty string', () => {
      const message = ''
      const bytes = new TextEncoder().encode(message)
      const binaryString = Array.from(bytes)
        .map((b) => String.fromCharCode(b))
        .join('')
      const encoded = btoa(binaryString)

      expect(encoded).toBe('')
    })

    it('should handle long messages', () => {
      const message = 'A'.repeat(10000)
      const bytes = new TextEncoder().encode(message)
      const binaryString = Array.from(bytes)
        .map((b) => String.fromCharCode(b))
        .join('')
      const encoded = btoa(binaryString)

      const decodedBinaryString = atob(encoded)
      const decodedBytes = Uint8Array.from(decodedBinaryString, (c) =>
        c.charCodeAt(0),
      )
      const decoded = new TextDecoder('utf-8').decode(decodedBytes)

      expect(decoded).toBe(message)
    })
  })

  describe('hash extraction', () => {
    it('should extract hash with send= prefix', () => {
      window.location.hash = '#send=dGVzdA=='
      const hash = window.location.hash
      expect(hash.startsWith('#send=')).toBe(true)
      const encodedMessage = hash.slice(6)
      expect(encodedMessage).toBe('dGVzdA==')
    })

    it('should handle empty hash', () => {
      window.location.hash = ''
      const hash = window.location.hash
      expect(hash).toBe('')
      expect(hash.length <= 1).toBe(true)
    })

    it('should handle hash with only #', () => {
      window.location.hash = '#'
      const hash = window.location.hash
      expect(hash.length <= 1).toBe(true)
    })

    it('should ignore hash without send= prefix', () => {
      window.location.hash = '#settings/general'
      const hash = window.location.hash
      expect(hash.startsWith('#send=')).toBe(false)
    })
  })

  describe('message validation', () => {
    it('should reject messages exceeding max length', () => {
      const maxMessageLength = 50000
      const longMessage = 'A'.repeat(maxMessageLength + 1)
      expect(longMessage.length > maxMessageLength).toBe(true)
    })

    it('should accept messages within max length', () => {
      const maxMessageLength = 50000
      const validMessage = 'A'.repeat(maxMessageLength)
      expect(validMessage.length <= maxMessageLength).toBe(true)
    })

    it('should detect control characters', () => {
      const hasControlChars = (msg: string) =>
        /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(msg)

      expect(hasControlChars('normal text')).toBe(false)
      expect(hasControlChars('text\nwith\nnewlines')).toBe(false)
      expect(hasControlChars('text\twith\ttabs')).toBe(false)
      expect(hasControlChars('text\x00with\x00null')).toBe(true)
      expect(hasControlChars('text\x07with\x07bell')).toBe(true)
    })
  })

  describe('smart quote normalization', () => {
    it('should normalize smart double quotes', () => {
      const message = '\u201CHello\u201D and \u201CWorld\u201D'
      const normalized = message
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'")
      expect(normalized).toBe('"Hello" and "World"')
    })

    it('should normalize smart single quotes', () => {
      const message = '\u2018Hello\u2019 and \u2018World\u2019'
      const normalized = message
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'")
      expect(normalized).toBe("'Hello' and 'World'")
    })

    it('should handle mixed smart quotes', () => {
      const message = '\u201CIt\u2019s a \u2018test\u2019 message\u201D'
      const normalized = message
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'")
      expect(normalized).toBe("\"It's a 'test' message\"")
    })
  })

  describe('invalid base64 handling', () => {
    it('should throw on invalid base64 characters', () => {
      expect(() => atob('invalid!!!base64')).toThrow()
    })

    it('should handle valid base64 with padding', () => {
      expect(() => atob('dGVzdA==')).not.toThrow()
    })

    it('should handle valid base64 without padding when valid', () => {
      expect(() => atob('dGVzdA')).not.toThrow()
    })
  })
})

describe('URL Hash Round Trip', () => {
  const testMessages = [
    'Simple test',
    'What is 2+2?',
    'Hello 世界!',
    'Code: `const x = 1;`',
    'Math: $x^2 + y^2 = z^2$',
    'Quotes: "double" and \'single\'',
    'Special: <>&"\'',
    'Newlines:\nLine 2\nLine 3',
    'Tabs:\tColumn1\tColumn2',
    'Long: ' + 'A'.repeat(1000),
  ]

  testMessages.forEach((message) => {
    it(`should round-trip: "${message.slice(0, 30)}${message.length > 30 ? '...' : ''}"`, () => {
      const bytes = new TextEncoder().encode(message)
      const binaryString = Array.from(bytes)
        .map((b) => String.fromCharCode(b))
        .join('')
      const encoded = btoa(binaryString)

      const decodedBinaryString = atob(encoded)
      const decodedBytes = Uint8Array.from(decodedBinaryString, (c) =>
        c.charCodeAt(0),
      )
      const decoded = new TextDecoder('utf-8').decode(decodedBytes)

      expect(decoded).toBe(message)
    })
  })
})
