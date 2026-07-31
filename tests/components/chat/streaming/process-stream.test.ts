import { processStreamingResponse } from '@/components/chat/hooks/streaming/process-stream'
import type { StreamingContext } from '@/components/chat/hooks/streaming/types'
import type { Chat } from '@/components/chat/types'
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

function createContext(): StreamingContext {
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
    const context = {
      ...createContext(),
      deferStreamCleanup: true,
    }

    await processStreamingResponse(createResponse(), context)

    expect(startStreamingMock).toHaveBeenCalledWith('chat-1')
    expect(context.setLoadingState).not.toHaveBeenCalled()
    expect(context.setIsStreaming).not.toHaveBeenCalled()
    expect(endStreamingMock).not.toHaveBeenCalled()
  })
})
