import { useChatStorage } from '@/components/chat/hooks/use-chat-storage'
import type { PendingRecoveryEnvelope } from '@/components/chat/types'
import { chatEvents } from '@/services/storage/chat-events'
import { chatStorage } from '@/services/storage/chat-storage'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockLoadChats,
  mockIsStreaming,
  mockDownloadChat,
  mockLoadChatImages,
  mockApplyRemoteChat,
} = vi.hoisted(() => ({
  mockLoadChats: vi.fn(),
  mockIsStreaming: vi.fn(),
  mockDownloadChat: vi.fn(),
  mockLoadChatImages: vi.fn(),
  mockApplyRemoteChat: vi.fn(),
}))

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    isSignedIn: true,
    getToken: vi.fn(),
  }),
}))

// Keep reload deterministic: no chats loaded from storage
vi.mock('@/components/chat/hooks/chat-operations', async () => {
  const actual = await vi.importActual<
    typeof import('@/components/chat/hooks/chat-operations')
  >('@/components/chat/hooks/chat-operations')
  return {
    ...actual,
    loadChats: mockLoadChats,
  }
})

vi.mock('@/services/cloud/streaming-tracker', () => ({
  streamingTracker: {
    isStreaming: mockIsStreaming,
    isStreamingOrPending: mockIsStreaming,
  },
}))

vi.mock('@/services/cloud/cloud-storage', () => ({
  cloudStorage: {
    downloadChat: mockDownloadChat,
    loadChatImages: mockLoadChatImages,
  },
}))

vi.mock('@/services/storage/indexed-db', () => ({
  indexedDBStorage: {
    applyRemoteChatIfFresh: mockApplyRemoteChat,
  },
}))

function createMockRecovery(
  overrides: Partial<PendingRecoveryEnvelope> = {},
): PendingRecoveryEnvelope {
  return {
    v: 1,
    turnId: 'turn-1',
    keyId: '0'.repeat(32),
    createdAt: '2026-07-21T00:00:00.000Z',
    expiresAt: '2026-07-22T00:00:00.000Z',
    nonce: 'nonce',
    ciphertext: 'ciphertext',
    ...overrides,
  }
}

describe('useChatStorage.reloadChats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadChats.mockResolvedValue([])
    mockIsStreaming.mockReturnValue(false)
    mockLoadChatImages.mockResolvedValue(new Map())
    mockApplyRemoteChat.mockResolvedValue({ applied: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads summaries first and hydrates a chat when selected', async () => {
    const summary = {
      id: 'chat-summary',
      title: 'Summary',
      messages: [],
      messageCount: 1,
      isMetadataOnly: true,
      createdAt: new Date('2026-08-12T00:00:00.000Z'),
      isBlankChat: false,
      isLocalOnly: false,
    }
    const hydrated = {
      ...summary,
      messages: [
        {
          role: 'user' as const,
          content: 'Loaded message',
          timestamp: new Date('2026-08-12T00:00:00.000Z'),
        },
      ],
      isMetadataOnly: false,
    }
    mockLoadChats.mockResolvedValueOnce([summary])
    const getChat = vi.spyOn(chatStorage, 'getChat').mockResolvedValue(hydrated)

    const { result } = renderHook(() => useChatStorage({ storeHistory: true }))
    await waitFor(() => expect(result.current.isInitialLoad).toBe(false))

    expect(mockLoadChats).toHaveBeenCalledWith(true, true)
    expect(result.current.chats.find((chat) => chat.id === summary.id)).toEqual(
      summary,
    )

    act(() => result.current.handleChatSelect(summary.id))
    await waitFor(() =>
      expect(result.current.currentChat.messages).toHaveLength(1),
    )

    expect(getChat).toHaveBeenCalledWith(summary.id)
  })

  it('does not overwrite a selected chat that changes during hydration', async () => {
    const summary = {
      id: 'chat-summary',
      title: 'Summary',
      messages: [],
      messageCount: 1,
      isMetadataOnly: true,
      createdAt: new Date('2026-08-12T00:00:00.000Z'),
      isBlankChat: false,
      isLocalOnly: false,
    }
    let finishHydration!: (chat: typeof summary) => void
    mockLoadChats.mockResolvedValueOnce([summary])
    vi.spyOn(chatStorage, 'getChat').mockReturnValue(
      new Promise((resolve) => {
        finishHydration = resolve
      }),
    )
    const { result } = renderHook(() => useChatStorage({ storeHistory: true }))
    await waitFor(() => expect(result.current.isInitialLoad).toBe(false))

    act(() => result.current.handleChatSelect(summary.id))
    const liveChat = {
      ...summary,
      isMetadataOnly: false,
      messages: [
        {
          role: 'assistant' as const,
          content: 'Live response',
          timestamp: new Date('2026-08-12T00:00:01.000Z'),
        },
      ],
    }
    act(() => {
      result.current.setCurrentChat(liveChat)
      result.current.setChats((chats) =>
        chats.map((chat) => (chat.id === liveChat.id ? liveChat : chat)),
      )
    })
    await act(async () => finishHydration(summary))

    expect(result.current.currentChat).toBe(liveChat)
    expect(result.current.chats.find((chat) => chat.id === liveChat.id)).toBe(
      liveChat,
    )
  })

  it('keeps a routed local new chat selected after loading storage', async () => {
    const { result } = renderHook(() =>
      useChatStorage({
        storeHistory: true,
        initialNewChatIsLocalOnly: true,
      }),
    )

    expect(result.current.currentChat.isBlankChat).toBe(true)
    expect(result.current.currentChat.isLocalOnly).toBe(true)

    await waitFor(() => {
      expect(result.current.isInitialLoad).toBe(false)
    })

    expect(result.current.currentChat.isBlankChat).toBe(true)
    expect(result.current.currentChat.isLocalOnly).toBe(true)
  })

  it('preserves a temporary chat opened while initial storage is loading', async () => {
    let finishLoading!: (chats: []) => void
    mockLoadChats.mockReturnValueOnce(
      new Promise<[]>((resolve) => {
        finishLoading = resolve
      }),
    )
    const { result } = renderHook(() =>
      useChatStorage({
        storeHistory: true,
      }),
    )
    const temporaryChat = {
      id: '0000000000001_12345678-1234-4234-8234-123456789abc',
      title: 'Temporary Chat',
      messages: [],
      createdAt: new Date(),
      isBlankChat: true,
      isTemporary: true,
      isLocalOnly: true,
    }

    act(() => result.current.setCurrentChat(temporaryChat))
    await act(async () => finishLoading([]))

    expect(result.current.currentChat).toMatchObject(temporaryChat)
  })

  it('does not reset currentChat to blank during temp-id window', async () => {
    const { result } = renderHook(() =>
      useChatStorage({
        storeHistory: true,
      }),
    )

    // Let the hook finish its initial async load effect first.
    await waitFor(() => {
      expect(result.current.isInitialLoad).toBe(false)
    })

    await act(async () => {
      result.current.setCurrentChat({
        id: 'temp-123',
        title: 'Untitled',
        messages: [],
        createdAt: new Date(),
        isBlankChat: false,
        isLocalOnly: false,
        pendingSave: true,
      })
    })

    await act(async () => {
      await result.current.reloadChats()
    })

    expect(result.current.currentChat.id).toBe('temp-123')
    expect(result.current.currentChat.isBlankChat).toBe(false)
  })

  it('does not reset currentChat to blank during pendingSave window (non-temp id)', async () => {
    const { result } = renderHook(() =>
      useChatStorage({
        storeHistory: true,
      }),
    )

    await waitFor(() => {
      expect(result.current.isInitialLoad).toBe(false)
    })

    await act(async () => {
      result.current.setCurrentChat({
        id: 'server-abc',
        title: 'Untitled',
        messages: [],
        createdAt: new Date(),
        isBlankChat: false,
        isLocalOnly: false,
        pendingSave: true,
      })
    })

    await act(async () => {
      await result.current.reloadChats()
    })

    expect(result.current.currentChat.id).toBe('server-abc')
    expect(result.current.currentChat.isBlankChat).toBe(false)
  })

  it('moves the selected local chat into the cloud collection after reload', async () => {
    const { result } = renderHook(() =>
      useChatStorage({
        storeHistory: true,
      }),
    )

    await waitFor(() => {
      expect(result.current.isInitialLoad).toBe(false)
    })

    const current = {
      id: 'chat-1',
      title: 'Moved chat',
      messages: [
        { role: 'user', content: 'Current message', timestamp: new Date() },
      ],
      createdAt: new Date(),
      isBlankChat: false,
      isLocalOnly: true,
    }
    await act(async () => {
      result.current.setCurrentChat(current as any)
    })
    mockLoadChats.mockResolvedValue([
      {
        ...current,
        messages: [],
        isLocalOnly: false,
      },
    ])

    await act(async () => {
      await result.current.reloadChats()
    })

    expect(result.current.currentChat.isLocalOnly).toBe(false)
    expect(result.current.currentChat.messages).toEqual(current.messages)
    expect(result.current.chats.find((chat) => chat.id === current.id)).toBe(
      result.current.currentChat,
    )
  })

  it('moves the selected cloud chat into the local collection after reload', async () => {
    const { result } = renderHook(() =>
      useChatStorage({
        storeHistory: true,
      }),
    )

    await waitFor(() => {
      expect(result.current.isInitialLoad).toBe(false)
    })

    const current = {
      id: 'chat-1',
      title: 'Moved chat',
      messages: [],
      createdAt: new Date(),
      isBlankChat: false,
      isLocalOnly: false,
      projectId: 'project-1',
    }
    await act(async () => {
      result.current.setCurrentChat(current as any)
    })
    mockLoadChats.mockResolvedValue([
      {
        ...current,
        isLocalOnly: true,
        projectId: undefined,
      },
    ])

    await act(async () => {
      await result.current.reloadChats()
    })

    expect(result.current.currentChat.isLocalOnly).toBe(true)
    expect(result.current.currentChat.projectId).toBeUndefined()
    expect(result.current.chats.find((chat) => chat.id === current.id)).toBe(
      result.current.currentChat,
    )
  })

  it('updates the selected chat location during a streaming recovery reload', async () => {
    const { result } = renderHook(() =>
      useChatStorage({
        storeHistory: true,
      }),
    )

    await waitFor(() => {
      expect(result.current.isInitialLoad).toBe(false)
    })

    const current = {
      id: 'chat-1',
      title: 'Moved chat',
      messages: [
        { role: 'user', content: 'Streaming message', timestamp: new Date() },
      ],
      createdAt: new Date(),
      isBlankChat: false,
      isLocalOnly: true,
    }
    await act(async () => {
      result.current.setCurrentChat(current as any)
    })
    mockIsStreaming.mockReturnValue(true)
    mockLoadChats.mockResolvedValue([
      {
        ...current,
        messages: [],
        isLocalOnly: false,
      },
    ])

    act(() => {
      chatEvents.emit({ reason: 'recovery', ids: [current.id] })
    })

    await waitFor(() => {
      expect(result.current.currentChat.isLocalOnly).toBe(false)
    })
    expect(result.current.currentChat.messages).toEqual(current.messages)
  })

  it('applies idChanges to currentChat before reloading', async () => {
    const { result } = renderHook(() =>
      useChatStorage({
        storeHistory: true,
      }),
    )

    await waitFor(() => {
      expect(result.current.isInitialLoad).toBe(false)
    })

    await act(async () => {
      result.current.setCurrentChat({
        id: 'temp-abc',
        title: 'Untitled',
        messages: [{ role: 'user', content: 'hi', timestamp: new Date() }],
        createdAt: new Date(),
        isBlankChat: false,
        isLocalOnly: false,
        pendingSave: false,
      } as any)
    })

    await act(async () => {
      chatEvents.emit({
        reason: 'sync',
        ids: ['server-def'],
        idChanges: [{ from: 'temp-abc', to: 'server-def' }],
      })
      // reloadChats is async; yield to allow it to run
      await Promise.resolve()
    })

    expect(result.current.currentChat.id).toBe('server-def')
  })

  it('refreshes pending recoveries for the selected chat after sync', async () => {
    const { result } = renderHook(() =>
      useChatStorage({
        storeHistory: true,
      }),
    )

    await waitFor(() => {
      expect(result.current.isInitialLoad).toBe(false)
    })

    const current = {
      id: 'chat-1',
      title: 'Recovery chat',
      messages: [
        {
          role: 'user' as const,
          content: 'Question',
          turnId: 'turn-1',
          timestamp: new Date(),
        },
      ],
      createdAt: new Date(),
      isBlankChat: false,
      isLocalOnly: false,
    }
    const recovery = createMockRecovery()

    await act(async () => {
      result.current.setCurrentChat(current as any)
    })
    mockLoadChats.mockResolvedValue([
      { ...current, pendingRecoveries: [recovery] },
    ])

    act(() => {
      chatEvents.emit({ reason: 'sync', ids: ['chat-1'] })
    })
    await waitFor(() => {
      expect(result.current.currentChat.pendingRecoveries).toEqual([recovery])
    })
  })

  it('refreshes pending recoveries while the selected chat is switching', async () => {
    const current = {
      id: 'chat-1',
      title: 'Recovery chat',
      messages: [
        {
          role: 'user' as const,
          content: 'Question',
          turnId: 'turn-1',
          timestamp: new Date(),
        },
      ],
      createdAt: new Date(),
      isBlankChat: false,
      isLocalOnly: false,
    }
    const recovery = createMockRecovery()
    const { result } = renderHook(() =>
      useChatStorage({
        storeHistory: true,
      }),
    )
    await waitFor(() => {
      expect(result.current.isInitialLoad).toBe(false)
    })

    await act(async () => {
      await result.current.switchChat(current as any)
    })
    mockLoadChats.mockResolvedValue([
      { ...current, pendingRecoveries: [recovery] },
    ])
    act(() => {
      chatEvents.emit({ reason: 'sync', ids: ['chat-1'] })
    })

    await waitFor(() => {
      expect(result.current.currentChat.pendingRecoveries).toEqual([recovery])
    })
  })

  it('switches an already-loaded chat without entering a loading delay', async () => {
    const selected = {
      id: 'chat-2',
      title: 'Selected chat',
      messages: [],
      createdAt: new Date(),
      isBlankChat: false,
    }
    mockLoadChats.mockResolvedValue([selected])
    const { result } = renderHook(() =>
      useChatStorage({
        storeHistory: true,
      }),
    )
    await waitFor(() => expect(result.current.isInitialLoad).toBe(false))

    await act(async () => {
      await result.current.switchChat(selected)
    })

    expect(result.current.currentChat.id).toBe(selected.id)
    expect(result.current.isInitialLoad).toBe(false)
  })

  it('does not let an older sync reload clear recovery progress', async () => {
    const current = {
      id: 'chat-1',
      title: 'Recovery chat',
      messages: [
        {
          role: 'user' as const,
          content: 'Question',
          turnId: 'turn-1',
          timestamp: new Date(),
        },
      ],
      createdAt: new Date(),
      isBlankChat: false,
      isLocalOnly: false,
    }
    const recovery = createMockRecovery()
    const { result } = renderHook(() =>
      useChatStorage({
        storeHistory: true,
      }),
    )
    await waitFor(() => {
      expect(result.current.isInitialLoad).toBe(false)
    })

    let finishOlderReload: ((chats: any[]) => void) | undefined
    mockLoadChats
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishOlderReload = resolve
        }),
      )
      .mockResolvedValueOnce([{ ...current, pendingRecoveries: [recovery] }])
    await act(async () => {
      result.current.setCurrentChat(current as any)
    })
    act(() => {
      chatEvents.emit({ reason: 'sync', ids: ['chat-1'] })
      chatEvents.emit({ reason: 'recovery', ids: ['chat-1'] })
    })

    await waitFor(() => {
      expect(result.current.currentChat.pendingRecoveries).toEqual([recovery])
    })
    finishOlderReload?.([current])
    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.currentChat.pendingRecoveries).toEqual([recovery])
    expect(
      result.current.chats.find((chat) => chat.id === 'chat-1')
        ?.pendingRecoveries,
    ).toEqual([recovery])
  })

  it('preserves pending recoveries when loading a chat from a URL', async () => {
    const recovery = createMockRecovery()
    mockDownloadChat.mockResolvedValue({
      id: 'chat-1',
      title: 'Recovery chat',
      messages: [
        {
          role: 'user',
          content: 'Question',
          turnId: 'turn-1',
          timestamp: new Date(),
        },
      ],
      pendingRecoveries: [recovery],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastAccessedAt: Date.now(),
    })

    const { result } = renderHook(() =>
      useChatStorage({
        storeHistory: true,
        initialChatId: 'chat-1',
      }),
    )

    await waitFor(() => {
      expect(result.current.currentChat.id).toBe('chat-1')
    })
    expect(result.current.currentChat.pendingRecoveries).toEqual([recovery])
    expect(mockApplyRemoteChat).toHaveBeenCalledWith({
      chat: expect.objectContaining({
        id: 'chat-1',
        pendingRecoveries: [recovery],
      }),
      syncVersion: 1,
      expectedLocalUpdatedAt: null,
    })
  })

  it('keeps recovery updates when a sync reload supersedes them', async () => {
    const { result } = renderHook(() =>
      useChatStorage({
        storeHistory: true,
      }),
    )

    await waitFor(() => {
      expect(result.current.isInitialLoad).toBe(false)
    })

    const userMessage = {
      role: 'user' as const,
      content: 'Question',
      turnId: 'turn-1',
      timestamp: new Date(),
    }
    const current = {
      id: 'chat-1',
      title: 'Recovery chat',
      messages: [userMessage],
      createdAt: new Date(),
      isBlankChat: false,
      isLocalOnly: false,
    }
    const recovery = createMockRecovery()
    let finishOlderReload: ((chats: any[]) => void) | undefined
    mockLoadChats
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishOlderReload = resolve
        }),
      )
      .mockResolvedValueOnce([
        {
          ...current,
          messages: [
            userMessage,
            {
              role: 'assistant',
              content: 'Recovered answer',
              turnId: 'turn-1',
              timestamp: new Date(),
            },
          ],
        },
      ])

    await act(async () => {
      result.current.setCurrentChat(current as any)
    })
    act(() => {
      chatEvents.emit({ reason: 'recovery', ids: ['chat-1'] })
      chatEvents.emit({ reason: 'sync', ids: ['chat-1'] })
    })
    await waitFor(() => {
      expect(result.current.currentChat.messages).toHaveLength(2)
    })

    finishOlderReload?.([{ ...current, pendingRecoveries: [recovery] }])
    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.currentChat.messages).toHaveLength(2)
    expect(result.current.currentChat.pendingRecoveries).toBeUndefined()
  })

  it('adopts a recovered response delivered by a plain sync', async () => {
    const recovery = createMockRecovery()
    const userMessage = {
      role: 'user' as const,
      content: 'Question',
      turnId: 'turn-1',
      timestamp: new Date(),
    }
    const current = {
      id: 'chat-1',
      title: 'Recovery chat',
      messages: [
        userMessage,
        {
          role: 'assistant' as const,
          content: 'Partial',
          turnId: 'turn-1',
          timestamp: new Date(),
        },
      ],
      pendingRecoveries: [recovery],
      createdAt: new Date(),
      isBlankChat: false,
      isLocalOnly: false,
    }
    mockLoadChats.mockResolvedValue([
      {
        ...current,
        messages: [
          userMessage,
          {
            role: 'assistant',
            content: 'Recovered answer',
            turnId: 'turn-1',
            timestamp: new Date(),
          },
        ],
        pendingRecoveries: undefined,
      },
    ])
    const { result } = renderHook(() =>
      useChatStorage({
        storeHistory: true,
      }),
    )
    await waitFor(() => {
      expect(result.current.isInitialLoad).toBe(false)
    })
    await act(async () => {
      result.current.setCurrentChat(current as any)
    })

    act(() => {
      chatEvents.emit({ reason: 'sync', ids: ['chat-1'] })
    })

    await waitFor(() => {
      expect(result.current.currentChat.messages[1].content).toBe(
        'Recovered answer',
      )
    })
    expect(result.current.currentChat.pendingRecoveries).toBeUndefined()
  })

  it('keeps a partial response when sync only removes its recovery', async () => {
    const recovery = createMockRecovery()
    const currentTimestamp = new Date('2026-07-21T00:00:00.000Z')
    const current = {
      id: 'chat-1',
      title: 'Recovery chat',
      messages: [
        {
          role: 'user' as const,
          content: 'Question',
          turnId: 'turn-1',
          timestamp: new Date(),
        },
        {
          role: 'assistant' as const,
          content: 'Partial',
          turnId: 'turn-1',
          timestamp: currentTimestamp,
        },
      ],
      pendingRecoveries: [recovery],
      createdAt: new Date(),
      isBlankChat: false,
      isLocalOnly: false,
    }
    mockLoadChats.mockResolvedValue([
      {
        ...current,
        messages: [
          current.messages[0],
          {
            ...current.messages[1],
            timestamp: new Date('2026-07-21T00:01:00.000Z'),
          },
        ],
        pendingRecoveries: undefined,
      },
    ])
    const { result } = renderHook(() =>
      useChatStorage({
        storeHistory: true,
      }),
    )
    await waitFor(() => {
      expect(result.current.isInitialLoad).toBe(false)
    })
    await act(async () => {
      result.current.setCurrentChat(current as any)
    })

    act(() => {
      chatEvents.emit({ reason: 'sync', ids: ['chat-1'] })
    })

    await waitFor(() => {
      expect(result.current.currentChat.pendingRecoveries).toBeUndefined()
    })
    expect(result.current.currentChat.messages[1].timestamp).toBe(
      currentTimestamp,
    )
  })
})
