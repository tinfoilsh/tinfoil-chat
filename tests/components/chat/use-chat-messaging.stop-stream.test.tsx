import { useChatMessaging } from '@/components/chat/hooks/use-chat-messaging'
import type { Chat } from '@/components/chat/types'
import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  cancelChatRecoveryMock,
  initialSaveMock,
  persistInterruptedAssistantMock,
  sendChatStreamMock,
  sessionSaveMock,
  streamControllers,
  streamingChats,
} = vi.hoisted(() => ({
  cancelChatRecoveryMock: vi.fn(async (..._args: unknown[]) => false),
  initialSaveMock: vi.fn(async (chat: unknown) => chat),
  persistInterruptedAssistantMock: vi.fn(
    async (..._args: unknown[]) => undefined,
  ),
  sendChatStreamMock: vi.fn(),
  sessionSaveMock: vi.fn(),
  streamControllers: new Map<string, AbortController>(),
  streamingChats: new Set<string>(),
}))

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isSignedIn: false, userId: undefined }),
}))

vi.mock('@/components/project', () => ({
  useProject: () => ({ isProjectMode: false, activeProject: null }),
}))

vi.mock('@/config/models', () => ({
  resolveModelSelection: () => ({
    model: { modelName: 'test-model' },
    autoCandidates: undefined,
  }),
}))

vi.mock('@/services/cloud/streaming-tracker', () => ({
  streamingTracker: {
    startStreaming: (chatId: string) => streamingChats.add(chatId),
    endStreaming: (chatId: string) => streamingChats.delete(chatId),
    isStreaming: (chatId: string) => streamingChats.has(chatId),
  },
}))

vi.mock('@/components/chat/hooks/use-chat-streams', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/components/chat/hooks/use-chat-streams')
  >()),
  useChatStreams: () => ({
    statusByChat: {},
    patchStatus: vi.fn(),
    resetStatus: vi.fn(),
    moveStatus: (fromId: string, toId: string) => {
      const controller = streamControllers.get(fromId)
      if (controller) {
        streamControllers.delete(fromId)
        streamControllers.set(toId, controller)
      }
    },
    registerController: (chatId: string, controller: AbortController) => {
      streamControllers.set(chatId, controller)
    },
    clearController: (chatId: string) => streamControllers.delete(chatId),
    abort: (chatId: string) => streamControllers.get(chatId)?.abort(),
  }),
}))

vi.mock('@/services/inference/chat-recovery', () => ({
  abandonChatRecoveryAttempt: vi.fn(),
  cancelChatRecovery: (...args: unknown[]) => cancelChatRecoveryMock(...args),
  completeLiveChatRecovery: vi.fn(),
  persistChatRecoveryToken: vi.fn(),
  releaseActiveChatRecovery: vi.fn(),
  scanPendingChatRecoveries: vi.fn(),
  startChatRecoveryAttempt: vi.fn(),
}))

vi.mock('@/services/inference/inference-client', () => ({
  sendChatStream: (...args: unknown[]) => sendChatStreamMock(...args),
}))

vi.mock('@/services/inference/chat-recovery-sync', () => ({
  persistInterruptedAssistant: (...args: unknown[]) =>
    persistInterruptedAssistantMock(...args),
}))

vi.mock('@/services/inference/tinfoil-client', () => ({
  getRateLimitInfo: () => null,
  isChatRecoveryAvailable: () => false,
  refreshRateLimit: vi.fn(),
}))

vi.mock('@/services/inference/title', () => ({
  generateTitle: vi.fn(async () => 'Untitled'),
  getTitleContent: (message: { content: string }) => message.content,
}))

vi.mock('@/services/storage/chat-storage', () => ({
  chatStorage: {
    saveChat: vi.fn(async (chat) => chat),
    saveChatAndSync: initialSaveMock,
    saveChatAndWaitForSync: vi.fn(async (chat) => chat),
  },
}))

vi.mock('@/services/storage/session-storage', () => ({
  sessionChatStorage: { saveChat: sessionSaveMock },
}))

vi.mock('@/services/exec-snapshot/access-token', () => ({
  generateCodeExecutionAccessToken: () => 'token',
}))

vi.mock('@/services/exec-snapshot/use-exec-snapshot', () => ({
  getCodeExecutionContainerAuthTokenForChat: async () => null,
}))

vi.mock('@/utils/cloud-sync-settings', () => ({
  isCloudSyncEnabled: () => false,
}))

vi.mock('@/utils/error-handling', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarning: vi.fn(),
}))

function createOpenResponse() {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(streamController) {
        controller = streamController
      },
    }),
  )
  return {
    response,
    send: (event: Record<string, unknown>) => {
      controller.enqueue(
        new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`),
      )
    },
    close: () => controller.close(),
  }
}

describe('useChatMessaging stopped streams', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initialSaveMock.mockImplementation(async (chat: unknown) => chat)
    persistInterruptedAssistantMock.mockResolvedValue(undefined)
    streamControllers.clear()
    streamingChats.clear()
  })

  it('keeps and persists the assistant response at the stop point', async () => {
    const initialChat: Chat = {
      id: 'chat-1',
      title: 'Existing chat',
      createdAt: new Date(),
      messages: [
        { role: 'user', content: 'Earlier', timestamp: new Date() },
        { role: 'assistant', content: 'Earlier reply', timestamp: new Date() },
      ],
    }
    const stream = createOpenResponse()
    sendChatStreamMock.mockResolvedValue(stream.response)

    const { result } = renderHook(() => {
      const [currentChat, setCurrentChat] = useState(initialChat)
      const [chats, setChats] = useState([initialChat])
      const messaging = useChatMessaging({
        systemPrompt: '',
        storeHistory: false,
        models: [{} as never],
        selectedModel: 'test-model',
        chats,
        currentChat,
        setChats,
        setCurrentChat,
        messagesEndRef: { current: null },
      })
      return { currentChat, messaging }
    })

    let query!: Promise<unknown>
    act(() => {
      query = result.current.messaging.handleQuery(
        'New prompt',
      ) as Promise<unknown>
    })
    await vi.waitFor(() => expect(sendChatStreamMock).toHaveBeenCalled())

    stream.send({
      choices: [{ delta: { reasoning_content: 'Partial reasoning' } }],
    })
    await vi.waitFor(() =>
      expect(result.current.currentChat.messages.at(-1)?.thoughts).toBe(
        'Partial reasoning',
      ),
    )

    await act(async () => {
      await result.current.messaging.cancelGeneration()
    })
    stream.close()
    await act(async () => {
      await query
    })

    const stoppedMessage = result.current.currentChat.messages.at(-1)
    expect(stoppedMessage).toMatchObject({
      role: 'assistant',
      thoughts: 'Partial reasoning',
      isThinking: false,
      turnId: expect.any(String),
    })
    expect(sessionSaveMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'assistant',
            thoughts: 'Partial reasoning',
            isThinking: false,
            turnId: expect.any(String),
          }),
        ]),
      }),
    )
    expect(cancelChatRecoveryMock).toHaveBeenCalledWith(
      'chat-1',
      expect.objectContaining({ thoughts: 'Partial reasoning' }),
    )
  })

  it('waits for first-turn persistence before saving the stopped response', async () => {
    const initialChat: Chat = {
      id: '',
      title: 'New chat',
      createdAt: new Date(),
      messages: [],
      isBlankChat: true,
      isLocalOnly: true,
    }
    let finishInitialSave!: () => void
    initialSaveMock.mockImplementationOnce(
      (chat: unknown) =>
        new Promise((resolve) => {
          finishInitialSave = () => resolve(chat)
        }),
    )
    const stream = createOpenResponse()
    sendChatStreamMock.mockResolvedValue(stream.response)

    const { result } = renderHook(() => {
      const [currentChat, setCurrentChat] = useState(initialChat)
      const [chats, setChats] = useState([initialChat])
      const messaging = useChatMessaging({
        systemPrompt: '',
        storeHistory: true,
        models: [{} as never],
        selectedModel: 'test-model',
        chats,
        currentChat,
        setChats,
        setCurrentChat,
        messagesEndRef: { current: null },
      })
      return { currentChat, messaging }
    })

    let query!: Promise<unknown>
    act(() => {
      query = result.current.messaging.handleQuery(
        'First prompt',
      ) as Promise<unknown>
    })
    await vi.waitFor(() => expect(sendChatStreamMock).toHaveBeenCalled())
    stream.send({ choices: [{ delta: { content: 'Partial answer' } }] })
    await vi.waitFor(() =>
      expect(result.current.currentChat.messages.at(-1)?.content).toBe(
        'Partial answer',
      ),
    )

    let cancellation!: Promise<void>
    act(() => {
      cancellation = result.current.messaging.cancelGeneration()
    })
    await Promise.resolve()
    expect(persistInterruptedAssistantMock).not.toHaveBeenCalled()

    finishInitialSave()
    await act(async () => {
      await cancellation
    })

    expect(persistInterruptedAssistantMock).toHaveBeenCalledWith(
      result.current.currentChat.id,
      expect.any(String),
      expect.objectContaining({ content: 'Partial answer' }),
    )

    stream.close()
    await act(async () => {
      await query
    })
  })
})
