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

vi.mock('@/services/inference/tinfoil-client', () => ({
  discardRateLimitSnapshot: vi.fn(),
  getRateLimitInfo: vi.fn(),
  inferenceRequest: vi.fn(),
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

function recoveryCallbacks() {
  return {
    onAttemptStarted: vi.fn((_storage: RunStorage) => undefined),
    onRunRecoverable: vi.fn(async (_storage: RunStorage) => undefined),
    onAttemptAbandoned: vi.fn(async (_storage: RunStorage) => undefined),
  }
}

/** The pair the Nth attempt was handed. */
function attemptPair(
  recovery: ReturnType<typeof recoveryCallbacks>,
  attempt = 0,
): RunStorage {
  return recovery.onAttemptStarted.mock.calls[attempt][0]
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

  it('registers the run as recoverable once the harness has answered', async () => {
    const recovery = recoveryCallbacks()
    let answer!: (value: unknown) => void
    runAgent.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve
      }),
    )

    const pending = send(recovery)
    await vi.waitFor(() => expect(recovery.onAttemptStarted).toHaveBeenCalled())
    // Nothing to come back to until the run actually exists.
    expect(recovery.onRunRecoverable).not.toHaveBeenCalled()

    answer(stream())
    const started = await pending

    expect(recovery.onRunRecoverable).toHaveBeenCalledWith(
      attemptPair(recovery),
    )
    await expect(started.recoveryReady).resolves.toBeUndefined()
    expect(recovery.onAttemptAbandoned).not.toHaveBeenCalled()
  })

  it('abandons the pair when the run never starts', async () => {
    const recovery = recoveryCallbacks()
    runAgent.mockRejectedValue(
      Object.assign(new Error('invalid request'), { status: 400 }),
    )

    await expect(send(recovery)).rejects.toMatchObject({
      code: 'SERVER_ERROR',
    })

    expect(recovery.onAttemptAbandoned).toHaveBeenCalledWith(
      attemptPair(recovery),
    )
    expect(recovery.onRunRecoverable).not.toHaveBeenCalled()
  })

  it('abandons the pair when the request is aborted', async () => {
    const recovery = recoveryCallbacks()
    runAgent.mockRejectedValue(new DOMException('Aborted', 'AbortError'))

    await expect(send(recovery)).rejects.toMatchObject({ name: 'AbortError' })

    expect(recovery.onAttemptStarted).toHaveBeenCalledOnce()
    expect(recovery.onAttemptAbandoned).toHaveBeenCalledWith(
      attemptPair(recovery),
    )
  })

  it('abandons the pair when registering the run fails', async () => {
    const recovery = recoveryCallbacks()
    const registrationError = new Error('registration unavailable')
    recovery.onRunRecoverable.mockRejectedValueOnce(registrationError)

    const started = await send(recovery)

    await expect(started.recoveryReady).rejects.toBe(registrationError)
    expect(recovery.onAttemptAbandoned).toHaveBeenCalledWith(
      attemptPair(recovery),
    )
  })

  it('mints a fresh pair for every attempt', async () => {
    const recovery = recoveryCallbacks()
    runAgent.mockRejectedValueOnce(new TypeError('network unavailable'))

    const started = await send(recovery)

    expect(recovery.onAttemptStarted).toHaveBeenCalledTimes(2)
    const first = attemptPair(recovery, 0)
    const second = attemptPair(recovery, 1)
    // A session id belongs to exactly one run.
    expect(second.sessionId).not.toBe(first.sessionId)
    expect(second.recoveryToken).not.toBe(first.recoveryToken)

    expect(recovery.onAttemptAbandoned).toHaveBeenCalledExactlyOnceWith(first)
    expect(recovery.onRunRecoverable).toHaveBeenCalledExactlyOnceWith(second)
    expect(runAgent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sessionId: second.sessionId,
        recoveryToken: second.recoveryToken,
      }),
      expect.any(AbortSignal),
    )
    await expect(started.recoveryReady).resolves.toBeUndefined()
  })
})
