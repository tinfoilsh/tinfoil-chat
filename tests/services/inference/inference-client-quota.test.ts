import { ChatError } from '@/components/chat/chat-utils'
import type { BaseModel } from '@/config/models'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const runAgent = vi.fn()
const discardRateLimitSnapshot = vi.fn()
const getRateLimitInfo = vi.fn()
const refreshRateLimit = vi.fn(async () => undefined)

vi.mock('@/components/chat/constants', async () => {
  const actual = await vi.importActual<
    typeof import('@/components/chat/constants')
  >('@/components/chat/constants')
  return {
    ...actual,
    CONSTANTS: {
      ...actual.CONSTANTS,
      MESSAGE_SEND_MAX_RETRIES: 2,
      MESSAGE_SEND_RETRY_DELAY_MS: 0,
    },
  }
})

vi.mock('@/services/inference/agui/client', () => ({
  runAgent: (...args: unknown[]) => runAgent(...args),
}))

vi.mock('@/services/inference/tinfoil-client', () => ({
  discardRateLimitSnapshot: () => discardRateLimitSnapshot(),
  getRateLimitInfo: () => getRateLimitInfo(),
  getTinfoilClient: vi.fn(),
  refreshRateLimit: () => refreshRateLimit(),
}))

import { sendChatStream } from '@/services/inference/inference-client'

const model: BaseModel = {
  modelName: 'gpt-oss-120b',
  image: '',
  name: 'Test',
  nameShort: 'Test',
  description: 'Test model',
  type: 'chat',
}

function status429Error() {
  return new ChatError('Rate limit reached', 'RATE_LIMIT', { status: 429 })
}

function successfulStream() {
  return {
    async *[Symbol.asyncIterator]() {
      yield { type: 'TEXT_MESSAGE_CHUNK', messageId: 'm', delta: 'answer' }
    },
  }
}

function send(onRetry?: (attempt: number, maxRetries: number) => void) {
  return sendChatStream({
    model,
    systemPrompt: '',
    updatedMessages: [
      { role: 'user', content: 'question', timestamp: new Date() },
    ],
    signal: new AbortController().signal,
    genUIEnabled: false,
    threadId: 'chat-1',
    runId: 'turn-1',
    onRetry,
  })
}

describe('sendChatStream 429 quota classification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fails immediately with RATE_LIMIT when the daily quota is exhausted', async () => {
    runAgent.mockRejectedValue(status429Error())
    getRateLimitInfo.mockReturnValue({
      maxRequests: 10,
      remaining: 0,
      resetsAt: '',
      kind: 'free_daily',
    })
    const onRetry = vi.fn()

    const error = await send(onRetry).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ChatError)
    expect((error as ChatError).code).toBe('RATE_LIMIT')
    // The rejected request never consumed quota server-side, so the
    // optimistic snapshot must be dropped before trusting the refresh.
    expect(discardRateLimitSnapshot).toHaveBeenCalled()
    expect(refreshRateLimit).toHaveBeenCalled()
    expect(onRetry).not.toHaveBeenCalled()
    expect(runAgent).toHaveBeenCalledTimes(1)
  })

  it('fails immediately with HOURLY_LIMIT when the hourly cap is exhausted', async () => {
    runAgent.mockRejectedValue(status429Error())
    getRateLimitInfo.mockReturnValue({
      maxRequests: 0,
      remaining: 0,
      resetsAt: '',
      kind: 'hourly',
    })

    const error = await send().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ChatError)
    expect((error as ChatError).code).toBe('HOURLY_LIMIT')
    expect(runAgent).toHaveBeenCalledTimes(1)
  })

  it('retries a 429 when the refreshed quota still has requests remaining', async () => {
    runAgent
      .mockRejectedValueOnce(status429Error())
      .mockResolvedValueOnce(successfulStream())
    getRateLimitInfo.mockReturnValue({
      maxRequests: 10,
      remaining: 5,
      resetsAt: '',
      kind: 'free_daily',
    })
    const onRetry = vi.fn()

    const stream = await send(onRetry)

    expect(typeof stream[Symbol.asyncIterator]).toBe('function')
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(runAgent).toHaveBeenCalledTimes(2)
  })

  it('retries a 429 when no quota is tracked (paid tier)', async () => {
    runAgent
      .mockRejectedValueOnce(status429Error())
      .mockResolvedValueOnce(successfulStream())
    getRateLimitInfo.mockReturnValue(null)

    const stream = await send()

    expect(typeof stream[Symbol.asyncIterator]).toBe('function')
    expect(runAgent).toHaveBeenCalledTimes(2)
  })
})
