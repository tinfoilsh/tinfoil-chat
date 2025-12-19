import {
  ensureValidISODate,
  getConversationTimestampFromId,
} from '@/utils/chat-timestamps'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('chat-timestamps', () => {
  describe('getConversationTimestampFromId', () => {
    it('should extract timestamp from valid conversation ID', () => {
      // Reverse timestamp format: MAX_TIMESTAMP - actual_timestamp
      // MAX_TIMESTAMP = 9999999999999
      const actualTimestamp = 1704067200000 // 2024-01-01T00:00:00.000Z
      const reverseTimestamp = 9999999999999 - actualTimestamp
      const conversationId = `${reverseTimestamp}_abc123`

      const result = getConversationTimestampFromId(conversationId)
      expect(result).toBe(actualTimestamp)
    })

    it('should return undefined for empty conversation ID', () => {
      expect(getConversationTimestampFromId('')).toBeUndefined()
    })

    it('should return undefined for undefined conversation ID', () => {
      expect(getConversationTimestampFromId(undefined as any)).toBeUndefined()
    })

    it('should return undefined for non-numeric prefix', () => {
      expect(getConversationTimestampFromId('abc_123')).toBeUndefined()
    })

    it('should handle ID without underscore', () => {
      const reverseTimestamp = 9999999999999 - 1704067200000
      expect(getConversationTimestampFromId(`${reverseTimestamp}`)).toBe(
        1704067200000,
      )
    })
  })

  describe('ensureValidISODate', () => {
    let mockNow: Date

    beforeEach(() => {
      mockNow = new Date('2024-06-15T12:00:00.000Z')
      vi.useFakeTimers()
      vi.setSystemTime(mockNow)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return ISO string for valid Date object', () => {
      const date = new Date('2024-01-01T00:00:00.000Z')
      expect(ensureValidISODate(date)).toBe('2024-01-01T00:00:00.000Z')
    })

    it('should return ISO string for valid ISO string input', () => {
      expect(ensureValidISODate('2024-01-01T00:00:00.000Z')).toBe(
        '2024-01-01T00:00:00.000Z',
      )
    })

    it('should return ISO string for valid timestamp number', () => {
      const timestamp = 1704067200000 // 2024-01-01T00:00:00.000Z
      expect(ensureValidISODate(timestamp)).toBe('2024-01-01T00:00:00.000Z')
    })

    it('should fallback to conversation ID timestamp when value is undefined', () => {
      const actualTimestamp = 1704067200000
      const reverseTimestamp = 9999999999999 - actualTimestamp
      const conversationId = `${reverseTimestamp}_abc123`

      const result = ensureValidISODate(undefined, conversationId)
      expect(result).toBe('2024-01-01T00:00:00.000Z')
    })

    it('should fallback to conversation ID timestamp for invalid date string', () => {
      const actualTimestamp = 1704067200000
      const reverseTimestamp = 9999999999999 - actualTimestamp
      const conversationId = `${reverseTimestamp}_abc123`

      const result = ensureValidISODate('invalid-date', conversationId)
      expect(result).toBe('2024-01-01T00:00:00.000Z')
    })

    it('should fallback to current time when no valid date or conversation ID', () => {
      const result = ensureValidISODate(undefined)
      expect(result).toBe(mockNow.toISOString())
    })

    it('should fallback to current time for invalid conversation ID', () => {
      const result = ensureValidISODate(undefined, 'invalid_id')
      expect(result).toBe(mockNow.toISOString())
    })

    it('should handle null value', () => {
      const result = ensureValidISODate(null as any)
      expect(result).toBe(mockNow.toISOString())
    })
  })
})
