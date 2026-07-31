import { processStreamingResponse } from '@/components/chat/hooks/streaming/process-stream'
import type { StreamingContext } from '@/components/chat/hooks/streaming/types'
import type { Chat, Message } from '@/components/chat/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { endStreamingMock, startStreamingMock } = vi.hoisted(() => ({
  endStreamingMock: vi.fn(),
  startStreamingMock: vi.fn(),
}))

vi.mock('@/services/cloud/streaming-tracker', () => ({
  streamingTracker: {
    endStreaming: endStreamingMock,
    startStreaming: startStreamingMock,
  },
}))

function createResponse(): Response {
  const events = [
    { choices: [{ delta: { content: 'Hello' } }] },
    { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
  ]
  const body = events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join('')
  return new Response(`${body}data: [DONE]\n\n`)
}

function createContext(overrides: Partial<StreamingContext> = {}) {
  const chat: Chat = {
    id: 'chat-1',
    title: 'Chat',
    messages: [],
    createdAt: new Date(),
  }

  return {
    updatedChat: chat,
    updatedMessages: [],
    isFirstMessage: true,
    modelsLength: 1,
    streamChatIdRef: { current: chat.id },
    thinkingStartTimeRef: { current: null },
    setIsThinking: vi.fn(),
    setIsWaitingForResponse: vi.fn(),
    setIsStreaming: vi.fn(),
    updateChatWithHistoryCheck: vi.fn(),
    setChats: vi.fn(),
    setCurrentChat: vi.fn(),
    setLoadingState: vi.fn(),
    storeHistory: true,
    startingChatId: chat.id,
    ...overrides,
  } satisfies StreamingContext
}

function createOpenResponse() {
  let streamController!: ReadableStreamDefaultController<Uint8Array>
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller
      },
    }),
  )
  const encoder = new TextEncoder()
  return {
    response,
    close: () => streamController.close(),
    send: (...events: Record<string, unknown>[]) => {
      streamController.enqueue(
        encoder.encode(
          events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
        ),
      )
    },
  }
}

describe('processStreamingResponse lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('cleans up the stream by default', async () => {
    const context = createContext()

    await processStreamingResponse(createResponse(), context)

    expect(context.setLoadingState).toHaveBeenCalledWith('idle')
    expect(context.setIsStreaming).toHaveBeenCalledWith(false)
    expect(endStreamingMock).toHaveBeenCalledWith('chat-1')
  })

  it('keeps the stream active when the caller has recovery to finalize', async () => {
    const context = createContext({ deferStreamCleanup: true })

    await processStreamingResponse(createResponse(), context)

    expect(startStreamingMock).toHaveBeenCalledWith('chat-1')
    expect(context.setLoadingState).not.toHaveBeenCalled()
    expect(context.setIsStreaming).not.toHaveBeenCalled()
    expect(endStreamingMock).not.toHaveBeenCalled()
  })
})

describe('processStreamingResponse interruption', () => {
  it('publishes the latest content with its turn identity on abort', async () => {
    const controller = new AbortController()
    const stream = createOpenResponse()
    const interrupted: Array<Message | null> = []
    const context = createContext({
      signal: controller.signal,
      turnId: 'turn-1',
      onInterrupted: (message) => interrupted.push(message),
    })
    const processing = processStreamingResponse(stream.response, context)

    stream.send(
      { choices: [{ delta: { content: 'Hello world' } }] },
      { choices: [{ delta: { content: ' before stopping' } }] },
    )
    await vi.waitFor(() =>
      expect(context.updateChatWithHistoryCheck).toHaveBeenCalled(),
    )

    controller.abort()

    expect(interrupted).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: 'Hello world before stopping',
        turnId: 'turn-1',
        isThinking: false,
      }),
    ])

    stream.close()
    await expect(processing).rejects.toMatchObject({ name: 'AbortError' })
    expect(context.setLoadingState).not.toHaveBeenCalled()
  })

  it('preserves partial reasoning instead of dropping the message', async () => {
    const controller = new AbortController()
    const stream = createOpenResponse()
    const interrupted: Array<Message | null> = []
    const context = createContext({
      signal: controller.signal,
      turnId: 'turn-1',
      onInterrupted: (message) => interrupted.push(message),
    })
    const processing = processStreamingResponse(stream.response, context)

    stream.send({
      choices: [{ delta: { reasoning_content: 'Keep this reasoning' } }],
    })
    await vi.waitFor(() =>
      expect(context.updateChatWithHistoryCheck).toHaveBeenCalled(),
    )

    controller.abort()

    expect(interrupted[0]).toMatchObject({
      thoughts: 'Keep this reasoning',
      isThinking: false,
      turnId: 'turn-1',
      timeline: [
        expect.objectContaining({
          type: 'thinking',
          content: 'Keep this reasoning',
          isThinking: false,
        }),
      ],
    })

    stream.close()
    await expect(processing).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('includes content buffered for stream format detection', async () => {
    const controller = new AbortController()
    const stream = createOpenResponse()
    const interrupted: Array<Message | null> = []
    const context = createContext({
      signal: controller.signal,
      turnId: 'turn-1',
      onInterrupted: (message) => interrupted.push(message),
    })
    const processing = processStreamingResponse(stream.response, context)

    stream.send(
      { choices: [{ delta: { content: 'Hi' } }] },
      {
        type: 'web_search_call',
        status: 'in_progress',
        action: { query: 'test query' },
      },
    )
    await vi.waitFor(() =>
      expect(context.setIsWaitingForResponse).toHaveBeenCalledWith(false),
    )

    controller.abort()

    expect(interrupted[0]).toMatchObject({
      content: 'Hi',
      turnId: 'turn-1',
    })

    stream.close()
    await expect(processing).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('does not publish an empty assistant placeholder', async () => {
    const controller = new AbortController()
    const stream = createOpenResponse()
    const interrupted: Array<Message | null> = []
    const context = createContext({
      signal: controller.signal,
      turnId: 'turn-1',
      onInterrupted: (message) => interrupted.push(message),
    })
    const processing = processStreamingResponse(stream.response, context)

    controller.abort()

    expect(interrupted).toEqual([null])

    stream.close()
    await expect(processing).rejects.toMatchObject({ name: 'AbortError' })
  })
})
