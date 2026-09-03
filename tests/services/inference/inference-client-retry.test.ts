import { ChatError } from '@/components/chat/chat-utils'
import { isRetryableError } from '@/services/inference/inference-client'
import { describe, expect, it } from 'vitest'

function statusError(status: number) {
  return new ChatError(`failed with ${status}`, 'SERVER_ERROR', { status })
}

describe('isRetryableError', () => {
  it('retries browser fetch network failures', () => {
    // fetch() rejects with a TypeError on network failure
    expect(isRetryableError(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('retries timeouts, rate limits, and server errors by HTTP status', () => {
    expect(isRetryableError(statusError(408))).toBe(true)
    expect(isRetryableError(statusError(409))).toBe(true)
    expect(isRetryableError(statusError(429))).toBe(true)
    expect(isRetryableError(statusError(503))).toBe(true)
    // A plain object carrying a status is classified the same way.
    expect(isRetryableError({ status: 503 })).toBe(true)
  })

  it('does not retry user aborts', () => {
    expect(isRetryableError(new DOMException('Aborted', 'AbortError'))).toBe(
      false,
    )
  })

  it('does not retry an exhausted hourly quota', () => {
    expect(
      isRetryableError(
        new ChatError('over cap', 'HOURLY_LIMIT', { status: 429 }),
      ),
    ).toBe(false)
  })

  it('does not retry client errors or unclassified errors', () => {
    expect(isRetryableError(statusError(400))).toBe(false)
    expect(isRetryableError(statusError(401))).toBe(false)
    // A bare Error carrying a transport-sounding message is not enough
    expect(isRetryableError(new Error('Connection error.'))).toBe(false)
    expect(isRetryableError(undefined)).toBe(false)
  })
})
