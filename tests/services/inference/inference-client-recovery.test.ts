import type { BaseModel } from '@/config/models'
import type { RunStorage } from '@/services/inference/agui/protocol'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const runAgent = vi.fn()
let minted = 0

vi.mock('@/services/inference/agui/client', () => ({
  runAgent: (...args: unknown[]) => runAgent(...args),
  newRunStorage: (): RunStorage => {
    minted += 1
    return {
      sessionId: `${minted}`.repeat(32),
      recoveryToken: `${minted + 5}`.repeat(32),
    }
  },
}))

vi.mock('@/services/inference/tinfoil-client', () => ({
  discardRateLimitSnapshot: vi.fn(),
  getRateLimitInfo: vi.fn(),
  getTinfoilClient: vi.fn(),
  refreshRateLimit: vi.fn(async () => undefined),
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

function stream() {
  return {
    async *[Symbol.asyncIterator]() {
      yield { type: 'TEXT_MESSAGE_CHUNK', messageId: 'm', delta: 'answer' }
    },
  }
}

function send(recovery?: Parameters<typeof sendChatStream>[0]['recovery']) {
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
    recovery,
  })
}

describe('sendChatStream recovery pair', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    minted = 0
    runAgent.mockResolvedValue(stream())
  })

  it('sends the pair under the names the harness reads', async () => {
    const started: RunStorage[] = []
    await send({
      onAttemptStarted: (storage) => started.push(storage),
      onRunRecoverable: async () => undefined,
      onAttemptAbandoned: async () => undefined,
    })

    expect(started).toHaveLength(1)
    expect(runAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: started[0].sessionId,
        recoveryToken: started[0].recoveryToken,
      }),
      expect.any(AbortSignal),
    )
  })

  it('omits the pair from a run nobody means to come back to', async () => {
    await send()

    const input = runAgent.mock.calls[0][0] as Record<string, unknown>
    expect(input).not.toHaveProperty('sessionId')
    expect(input).not.toHaveProperty('recoveryToken')
  })
})
