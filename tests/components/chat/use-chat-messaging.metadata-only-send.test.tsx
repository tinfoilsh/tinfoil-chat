import { useChatMessaging } from '@/components/chat/hooks/use-chat-messaging'
import type { Chat } from '@/components/chat/types'
import type { ChatChunk } from '@/services/inference/chat-stream'
import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getChatMock, saveChatMock, saveChatAndSyncMock, sendChatStreamMock } =
  vi.hoisted(() => ({
    getChatMock: vi.fn(async (_id: unknown) => null as unknown),
    saveChatMock: vi.fn(async (chat: unknown, _skip?: unknown) => chat),
    saveChatAndSyncMock: vi.fn(async (chat: unknown) => chat),
    sendChatStreamMock: vi.fn(),
  }))

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isSignedIn: true, userId: 'user-1' }),
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

vi.mock('@/services/inference/chat-recovery', () => ({
  abandonChatRecoveryAttempt: vi.fn(),
  cancelChatRecovery: vi.fn(async () => false),
  completeLiveChatRecovery: vi.fn(),
  markChatRecoveryTurnCancelled: vi.fn(),
  markChatRecoveryTurnSettled: vi.fn(),
  persistChatRecoveryToken: vi.fn(),
  releaseActiveChatRecovery: vi.fn(),
  scanPendingChatRecoveries: vi.fn(),
  startChatRecoveryAttempt: vi.fn(),
}))

vi.mock('@/services/inference/inference-client', () => ({
  sendChatStream: (...args: unknown[]) => sendChatStreamMock(...args),
}))

vi.mock('@/services/inference/chat-recovery-sync', () => ({
  persistInterruptedAssistant: vi.fn(async () => undefined),
}))

vi.mock('@/services/inference/tinfoil-client', () => ({
  getRateLimitInfo: () => null,
  isChatRecoveryAvailable: () => false,
  refreshRateLimit: vi.fn(),
  snapshotAndDecrementRemaining: vi.fn(),
}))

vi.mock('@/services/inference/title', () => ({
  generateTitle: vi.fn(async () => 'Untitled'),
  getTitleContent: (message: { content: string }) => message.content,
}))

vi.mock('@/services/storage/chat-storage', () => ({
  chatStorage: {
    getChat: (id: unknown) => getChatMock(id),
    saveChat: (chat: unknown, skip?: unknown) => saveChatMock(chat, skip),
    saveChatAndSync: (chat: unknown) => saveChatAndSyncMock(chat),
  },
}))

vi.mock('@/services/storage/session-storage', () => ({
  sessionChatStorage: {
    getAllChats: vi.fn(() => []),
    saveChat: vi.fn(),
  },
}))

vi.mock('@/services/exec-snapshot/access-token', () => ({
  generateCodeExecutionAccessToken: () => 'token',
}))

vi.mock('@/services/exec-snapshot/use-exec-snapshot', () => ({
  getCodeExecutionContainerAuthTokenForChat: vi.fn(async () => null),
}))

vi.mock('@/utils/cloud-sync-settings', () => ({
  isCloudSyncEnabled: () => true,
}))

vi.mock('@/utils/error-handling', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarning: vi.fn(),
}))

const storedMessages = [
  {
    role: 'user' as const,
    content: 'Earlier question',
    timestamp: new Date('2026-08-12T00:00:00.000Z'),
  },
  {
    role: 'assistant' as const,
    content: 'Earlier answer',
    timestamp: new Date('2026-08-12T00:00:01.000Z'),
  },
]

function metadataOnlyChat(): Chat {
  return {
    id: 'chat-1',
    title: 'Existing chat',
    createdAt: new Date('2026-08-12T00:00:00.000Z'),
    messages: [],
    messageCount: storedMessages.length,
    isMetadataOnly: true,
    isBlankChat: false,
    isLocalOnly: false,
  }
}

function hydratedChat(): Chat {
  return {
    ...metadataOnlyChat(),
    messages: storedMessages,
    isMetadataOnly: false,
  }
}

function completedStream() {
  return (async function* (): AsyncGenerator<ChatChunk> {
    yield { choices: [{ delta: { content: 'Response' } }] } as ChatChunk
  })()
}

function renderMessaging(initialChat: Chat) {
  return renderHook(() => {
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
    })
    return { currentChat, messaging }
  })
}

describe('useChatMessaging metadata-only sends', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    saveChatMock.mockImplementation(async (chat: unknown) => chat)
    saveChatAndSyncMock.mockImplementation(async (chat: unknown) => chat)
    sendChatStreamMock.mockResolvedValue(completedStream())
  })

  it('hydrates stored messages before persisting a send', async () => {
    getChatMock.mockResolvedValue(hydratedChat())
    const { result } = renderMessaging(metadataOnlyChat())

    await act(async () => {
      await result.current.messaging.handleQuery('New prompt')
    })

    expect(getChatMock).toHaveBeenCalledWith('chat-1')
    // The pre-stream save must contain the full stored history plus the
    // new user message — never just the placeholder empty array.
    const firstSave = saveChatAndSyncMock.mock.calls[0][0] as Chat
    expect(
      firstSave.messages.map((m: { content: string }) => m.content),
    ).toEqual(['Earlier question', 'Earlier answer', 'New prompt'])
    expect(firstSave.isMetadataOnly).toBe(false)

    expect(
      result.current.currentChat.messages.map(
        (m: { content: string }) => m.content,
      ),
    ).toContain('Earlier question')
  })

  it('does not persist anything when hydration fails', async () => {
    getChatMock.mockResolvedValue(null)
    const { result } = renderMessaging(metadataOnlyChat())

    await act(async () => {
      await result.current.messaging.handleQuery('New prompt')
    })

    expect(saveChatMock).not.toHaveBeenCalled()
    expect(saveChatAndSyncMock).not.toHaveBeenCalled()
    expect(sendChatStreamMock).not.toHaveBeenCalled()
    // The typed text is restored so the user can retry.
    expect(result.current.messaging.input).toBe('New prompt')
    expect(result.current.currentChat.messages).toHaveLength(0)
  })

  it('sends normally on a hydrated chat without re-reading storage', async () => {
    const { result } = renderMessaging(hydratedChat())

    await act(async () => {
      await result.current.messaging.handleQuery('New prompt')
    })

    expect(getChatMock).not.toHaveBeenCalled()
    const firstSave = saveChatAndSyncMock.mock.calls[0][0] as Chat
    expect(
      firstSave.messages.map((m: { content: string }) => m.content),
    ).toEqual(['Earlier question', 'Earlier answer', 'New prompt'])
  })
})
