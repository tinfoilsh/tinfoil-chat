import type { Chat } from '@/components/chat/types'
import { chatStorage } from '@/services/storage/chat-storage'
import { setCloudSyncEnabled } from '@/utils/cloud-sync-settings'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const saveChatSpy = vi.fn(async (chat: unknown) => ({
  saved: true,
  isLocalOnly: (chat as { isLocalOnly?: boolean }).isLocalOnly === true,
}))
const getChatSpy = vi.fn(async () => null as unknown)
const getAllChatsSpy = vi.fn(async () => [] as unknown[])
const resetChatTimestampsSpy = vi.fn(async () => {})
const updateChatLocalOnlySpy = vi.fn(async () => {})
const updateChatProjectSpy = vi.fn(async () => {})
const backupChatSpy = vi.fn(async () => {})
const deleteFromCloudSpy = vi.fn(async () => {})

vi.mock('@/services/storage/indexed-db', () => ({
  indexedDBStorage: {
    initialize: vi.fn(async () => {}),
    getChat: (...args: unknown[]) => getChatSpy(...args),
    saveChat: (...args: unknown[]) => saveChatSpy(...args),
    getAllChats: (...args: unknown[]) => getAllChatsSpy(...args),
    resetChatTimestamps: (...args: unknown[]) =>
      resetChatTimestampsSpy(...args),
    updateChatLocalOnly: (...args: unknown[]) =>
      updateChatLocalOnlySpy(...args),
    updateChatProject: (...args: unknown[]) => updateChatProjectSpy(...args),
  },
}))
vi.mock('@/services/cloud/cloud-sync', () => ({
  cloudSync: {
    backupChat: (...args: unknown[]) => backupChatSpy(...args),
    deleteFromCloud: (...args: unknown[]) => deleteFromCloudSpy(...args),
  },
}))
vi.mock('@/services/cloud/cloud-storage', () => ({ cloudStorage: {} }))
vi.mock('@/services/cloud/streaming-tracker', () => ({
  streamingTracker: { isStreaming: vi.fn(() => false) },
}))
vi.mock('@/services/storage/chat-events', () => ({
  chatEvents: { emit: vi.fn() },
}))
vi.mock('@/services/storage/deleted-chats-tracker', () => ({
  deletedChatsTracker: {
    markAsDeleted: vi.fn(),
    isDeleted: vi.fn(() => false),
  },
}))

function makeChat(overrides: Partial<Chat> = {}): Chat {
  return {
    id: 'rev_123_abc',
    title: 'Initial Message Test',
    messages: [],
    createdAt: new Date('2026-06-02T09:00:00Z'),
    isBlankChat: false,
    isLocalOnly: false,
    pendingSave: true,
    ...overrides,
  }
}

describe('chatStorage pendingSave is not persisted', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('strips pendingSave before writing a chat to storage', async () => {
    await chatStorage.saveChat(makeChat(), true)

    expect(saveChatSpy).toHaveBeenCalledTimes(1)
    const persisted = saveChatSpy.mock.calls[0][0] as Record<string, unknown>
    expect('pendingSave' in persisted).toBe(false)
    expect(persisted.id).toBe('rev_123_abc')
    expect(getChatSpy).not.toHaveBeenCalled()
  })

  it('drops a stale persisted pendingSave when listing chats', async () => {
    getAllChatsSpy.mockResolvedValueOnce([
      {
        id: 'rev_123_abc',
        title: 'Initial Message Test',
        messages: [],
        createdAt: new Date('2026-06-02T09:00:00Z').toISOString(),
        isBlankChat: false,
        isLocalOnly: false,
        pendingSave: true,
      },
    ])

    const chats = await chatStorage.getAllChats()

    expect(chats).toHaveLength(1)
    expect('pendingSave' in chats[0]).toBe(false)
  })

  it('drops a stale persisted pendingSave in the sync-status listing', async () => {
    getAllChatsSpy.mockResolvedValueOnce([
      {
        id: 'rev_123_abc',
        title: 'Initial Message Test',
        messages: [],
        createdAt: new Date('2026-06-02T09:00:00Z').toISOString(),
        isBlankChat: false,
        isLocalOnly: false,
        pendingSave: true,
      },
    ])

    const chats = await chatStorage.getAllChatsWithSyncStatus()

    expect('pendingSave' in chats[0]).toBe(false)
  })
})

describe('chatStorage local-only classification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stores chats as local-only and skips backup while cloud sync is disabled', async () => {
    setCloudSyncEnabled(false)

    const saved = await chatStorage.saveChat(makeChat({ isLocalOnly: false }))

    const persisted = saveChatSpy.mock.calls[0][0] as Record<string, unknown>
    expect(persisted.isLocalOnly).toBe(true)
    expect(saved.isLocalOnly).toBe(true)
    expect(backupChatSpy).not.toHaveBeenCalled()
  })

  it('keeps cloud chats eligible for backup while cloud sync is enabled', async () => {
    setCloudSyncEnabled(true)

    await chatStorage.saveChat(makeChat({ isLocalOnly: false }))

    const persisted = saveChatSpy.mock.calls[0][0] as Record<string, unknown>
    expect(persisted.isLocalOnly).toBe(false)
    expect(backupChatSpy).toHaveBeenCalledTimes(1)
  })

  it('uses the persisted local-only classification for backup and return state', async () => {
    setCloudSyncEnabled(true)
    saveChatSpy.mockResolvedValueOnce({ saved: true, isLocalOnly: true })

    const saved = await chatStorage.saveChat(makeChat({ isLocalOnly: false }))

    expect(saved.isLocalOnly).toBe(true)
    expect(backupChatSpy).not.toHaveBeenCalled()
  })
})

describe('chatStorage convertChatToLocal rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('restores cloud classification when the cloud delete fails', async () => {
    setCloudSyncEnabled(true)
    getChatSpy.mockResolvedValueOnce(
      makeChat({ isLocalOnly: false }) as unknown,
    )
    deleteFromCloudSpy.mockRejectedValueOnce(new Error('network down'))

    await expect(chatStorage.convertChatToLocal('rev_123_abc')).rejects.toThrow(
      'network down',
    )

    // Conversion marked the chat local, then the rollback restored it.
    expect(updateChatLocalOnlySpy).toHaveBeenNthCalledWith(
      1,
      'rev_123_abc',
      true,
    )
    expect(updateChatLocalOnlySpy).toHaveBeenNthCalledWith(
      2,
      'rev_123_abc',
      false,
    )
    const restored = saveChatSpy.mock.calls[0][0] as Record<string, unknown>
    expect(restored.isLocalOnly).toBe(false)
  })
})
