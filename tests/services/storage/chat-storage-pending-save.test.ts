import type { Chat } from '@/components/chat/types'
import { AUTH_ACTIVE_USER_ID } from '@/constants/storage-keys'
import { chatStorage } from '@/services/storage/chat-storage'
import { sessionChatStorage } from '@/services/storage/session-storage'
import { setCloudSyncEnabled } from '@/utils/cloud-sync-settings'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  saveChatSpy,
  getChatSpy,
  getAllChatsSpy,
  getAllChatIdsSpy,
  deleteAllChatsSpy,
  backupChatSpy,
  deleteChatsByProjectSpy,
  acknowledgePendingDeletesSpy,
  deleteRemoteProjectChatsSpy,
  listChatIdsByProjectSpy,
  createAccountOperationGuardSpy,
  withProjectUploadBarrierSpy,
  newIdempotencyKeySpy,
  resetChatTimestampsSpy,
  updateChatLocalOnlySpy,
  updateChatProjectSpy,
  deleteChatWithPendingIntentSpy,
  deleteLocalChatSpy,
  deleteFromCloudSpy,
  deleteAllCloudChatsSpy,
  isCloudAuthenticatedSpy,
  hasPendingUploadSpy,
  isDeletedSpy,
  markAsDeletedSpy,
} = vi.hoisted(() => ({
  saveChatSpy: vi.fn(async (chat: unknown) => ({
    saved: true,
    isLocalOnly: (chat as { isLocalOnly?: boolean }).isLocalOnly === true,
  })),
  getChatSpy: vi.fn(async () => null as unknown),
  getAllChatsSpy: vi.fn(async () => [] as unknown[]),
  getAllChatIdsSpy: vi.fn(async () => [] as string[]),
  deleteAllChatsSpy: vi.fn(async () => 0),
  backupChatSpy: vi.fn(async () => {}),
  deleteChatsByProjectSpy: vi.fn(async () => [] as string[]),
  acknowledgePendingDeletesSpy: vi.fn(async () => {}),
  deleteRemoteProjectChatsSpy: vi.fn(async () => ({ deleted: 0 })),
  listChatIdsByProjectSpy: vi.fn(async () => [] as string[]),
  createAccountOperationGuardSpy: vi.fn(),
  withProjectUploadBarrierSpy: vi.fn(
    async (_projectId: string, operation: () => Promise<unknown>) =>
      operation(),
  ),
  newIdempotencyKeySpy: vi.fn(() => 'delete-key'),
  resetChatTimestampsSpy: vi.fn(async () => {}),
  updateChatLocalOnlySpy: vi.fn(async () => {}),
  updateChatProjectSpy: vi.fn(async () => {}),
  deleteChatWithPendingIntentSpy: vi.fn(async () => true),
  deleteLocalChatSpy: vi.fn(async () => {}),
  deleteFromCloudSpy: vi.fn(async () => {}),
  deleteAllCloudChatsSpy: vi.fn(async () => ({ deleted: 0 })),
  isCloudAuthenticatedSpy: vi.fn(async () => false),
  hasPendingUploadSpy: vi.fn(() => false),
  isDeletedSpy: vi.fn((_id: unknown) => false),
  markAsDeletedSpy: vi.fn(),
}))

vi.mock('@/services/storage/indexed-db', () => ({
  indexedDBStorage: {
    initialize: vi.fn(async () => {}),
    getChat: getChatSpy,
    saveChat: saveChatSpy,
    getAllChats: getAllChatsSpy,
    getAllChatIds: getAllChatIdsSpy,
    deleteAllChats: deleteAllChatsSpy,
    resetChatTimestamps: resetChatTimestampsSpy,
    updateChatLocalOnly: updateChatLocalOnlySpy,
    updateChatProject: updateChatProjectSpy,
    deleteChatWithPendingIntent: deleteChatWithPendingIntentSpy,
    deleteChat: deleteLocalChatSpy,
    deleteChatsByProject: deleteChatsByProjectSpy,
    acknowledgePendingDeletes: acknowledgePendingDeletesSpy,
  },
}))
vi.mock('@/services/cloud/cloud-sync', () => ({
  cloudSync: {
    backupChat: backupChatSpy,
    deleteFromCloud: deleteFromCloudSpy,
    hasPendingUpload: hasPendingUploadSpy,
    createAccountOperationGuard: createAccountOperationGuardSpy,
    withProjectUploadBarrier: withProjectUploadBarrierSpy,
  },
}))
vi.mock('@/services/cloud/cloud-storage', () => ({
  cloudStorage: {
    deleteChatsByProject: deleteRemoteProjectChatsSpy,
    listChatIdsByProject: listChatIdsByProjectSpy,
    deleteAllChats: deleteAllCloudChatsSpy,
    isAuthenticated: isCloudAuthenticatedSpy,
  },
}))
vi.mock('@/services/sync-enclave/sync-api', () => ({
  newIdempotencyKey: newIdempotencyKeySpy,
}))
vi.mock('@/services/cloud/streaming-tracker', () => ({
  streamingTracker: { isStreaming: vi.fn(() => false) },
}))
vi.mock('@/services/storage/chat-events', () => ({
  chatEvents: { emit: vi.fn() },
}))
vi.mock('@/services/storage/deleted-chats-tracker', () => ({
  deletedChatsTracker: {
    markAsDeleted: markAsDeletedSpy,
    isDeleted: isDeletedSpy,
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
    sessionStorage.clear()
    isDeletedSpy.mockReturnValue(false)
    localStorage.setItem(AUTH_ACTIVE_USER_ID, 'user-1')
    deleteChatsByProjectSpy.mockResolvedValue([])
    deleteRemoteProjectChatsSpy.mockResolvedValue({ deleted: 0 })
    acknowledgePendingDeletesSpy.mockResolvedValue(undefined)
    listChatIdsByProjectSpy.mockResolvedValue([])
    deleteChatWithPendingIntentSpy.mockResolvedValue(true)
    hasPendingUploadSpy.mockReturnValue(false)
    getAllChatIdsSpy.mockResolvedValue([])
    deleteAllChatsSpy.mockResolvedValue(0)
    deleteAllCloudChatsSpy.mockResolvedValue({ deleted: 0 })
    isCloudAuthenticatedSpy.mockResolvedValue(false)
    createAccountOperationGuardSpy.mockImplementation(() => {
      const userId = localStorage.getItem(AUTH_ACTIVE_USER_ID)
      const isCurrent = () =>
        localStorage.getItem(AUTH_ACTIVE_USER_ID) === userId
      return {
        userId,
        isCurrent,
        assertCurrent: () => {
          if (!isCurrent()) throw new Error('Cloud account changed')
        },
      }
    })
  })

  it('strips pendingSave before writing a chat to storage', async () => {
    await chatStorage.saveChat(makeChat(), true)

    expect(saveChatSpy).toHaveBeenCalledTimes(1)
    const persisted = saveChatSpy.mock.calls[0][0] as Record<string, unknown>
    expect('pendingSave' in persisted).toBe(false)
    expect(persisted.id).toBe('rev_123_abc')
    expect(getChatSpy).not.toHaveBeenCalled()
  })

  it('does not recreate a chat deleted before a final stream save', async () => {
    const chat = makeChat()
    await chatStorage.saveChat(chat, true)
    saveChatSpy.mockClear()

    isDeletedSpy.mockReturnValue(true)
    await chatStorage.saveChatAndSync({
      ...chat,
      messages: [
        {
          role: 'assistant',
          content: 'Late stream result',
          timestamp: new Date(),
        },
      ],
    })

    expect(saveChatSpy).not.toHaveBeenCalled()
    expect(backupChatSpy).not.toHaveBeenCalled()
  })

  it('queues and dispatches cloud deletion for a memory-only remote chat', async () => {
    getChatSpy.mockResolvedValueOnce(null)

    await chatStorage.deleteChat('memory-only-chat')

    expect(deleteChatWithPendingIntentSpy).toHaveBeenCalledWith(
      'memory-only-chat',
      'delete-key',
      'user-1',
      { forceQueue: true },
    )
    expect(deleteFromCloudSpy).toHaveBeenCalledWith(
      'memory-only-chat',
      'delete-key',
    )
    expect(deleteLocalChatSpy).not.toHaveBeenCalled()
  })

  it('preserves local-only deletion behavior', async () => {
    getChatSpy.mockResolvedValueOnce({ isLocalOnly: true } as never)

    await chatStorage.deleteChat('local-chat')

    expect(deleteLocalChatSpy).toHaveBeenCalledWith('local-chat')
    expect(deleteChatWithPendingIntentSpy).not.toHaveBeenCalled()
    expect(deleteFromCloudSpy).not.toHaveBeenCalled()
  })

  it('does not recreate deleted guest chats in session storage', () => {
    const chat = makeChat()
    sessionChatStorage.saveStreamingDraft(chat)
    isDeletedSpy.mockReturnValue(true)

    sessionChatStorage.saveChat(chat)

    expect(sessionChatStorage.getAllChats()).toEqual([])
  })

  it('does not recreate a deleted guest chat from a late streaming draft', () => {
    const chat = makeChat()
    sessionChatStorage.saveStreamingDraft(chat)
    isDeletedSpy.mockReturnValue(true)

    sessionChatStorage.saveStreamingDraft({
      ...chat,
      messages: [
        { role: 'assistant', content: 'Late result', timestamp: new Date() },
      ],
    })

    expect(sessionChatStorage.getAllChats()).toEqual([])
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

  it('enumerates every remote project chat before durable local cleanup', async () => {
    listChatIdsByProjectSpy.mockResolvedValueOnce(['remote-1', 'remote-2'])
    deleteChatsByProjectSpy.mockResolvedValue(['remote-1', 'remote-2'])

    await expect(
      chatStorage.deleteChatsByProjectWithIds('project-1'),
    ).resolves.toEqual(['remote-1', 'remote-2'])

    expect(withProjectUploadBarrierSpy).toHaveBeenCalledWith(
      'project-1',
      expect.any(Function),
    )
    expect(listChatIdsByProjectSpy).toHaveBeenCalledWith(
      'project-1',
      expect.any(Object),
    )
    expect(deleteChatsByProjectSpy).toHaveBeenCalledWith(
      'project-1',
      ['remote-1', 'remote-2'],
      'user-1',
      newIdempotencyKeySpy,
      expect.any(Function),
    )
    expect(deleteRemoteProjectChatsSpy).toHaveBeenCalledWith(
      'project-1',
      expect.any(Object),
    )
    expect(acknowledgePendingDeletesSpy).toHaveBeenCalledWith(
      ['remote-1', 'remote-2'],
      'user-1',
      expect.any(Function),
    )
  })

  it('stops before local staging when the account changes during listing', async () => {
    listChatIdsByProjectSpy.mockImplementationOnce(async () => {
      localStorage.setItem(AUTH_ACTIVE_USER_ID, 'user-2')
      return []
    })

    await expect(chatStorage.deleteChatsByProject('project-1')).rejects.toThrow(
      'Cloud account changed',
    )
    expect(deleteChatsByProjectSpy).not.toHaveBeenCalled()
    expect(deleteRemoteProjectChatsSpy).not.toHaveBeenCalled()
  })

  it('stops before remote deletion when the account changes after staging', async () => {
    deleteChatsByProjectSpy.mockImplementationOnce(async () => {
      localStorage.setItem(AUTH_ACTIVE_USER_ID, 'user-2')
      return ['local-chat']
    })

    await expect(chatStorage.deleteChatsByProject('project-1')).rejects.toThrow(
      'Cloud account changed',
    )
    expect(deleteRemoteProjectChatsSpy).not.toHaveBeenCalled()
    expect(acknowledgePendingDeletesSpy).not.toHaveBeenCalled()
  })

  it('retains staged intents when the controlplane bulk delete fails', async () => {
    deleteChatsByProjectSpy.mockResolvedValueOnce(['local-chat'])
    deleteRemoteProjectChatsSpy.mockRejectedValueOnce(
      new Error('bulk delete unavailable'),
    )

    await expect(chatStorage.deleteChatsByProject('project-1')).rejects.toThrow(
      'bulk delete unavailable',
    )
    expect(acknowledgePendingDeletesSpy).not.toHaveBeenCalled()
  })

  it('returns only local and cloud deletion counts', async () => {
    getAllChatIdsSpy.mockResolvedValueOnce(['local-1', 'local-2'])
    deleteAllChatsSpy.mockResolvedValueOnce(2)
    isCloudAuthenticatedSpy.mockResolvedValueOnce(true)
    deleteAllCloudChatsSpy.mockResolvedValueOnce({ deleted: 3 })

    const result = await chatStorage.deleteAllChats()

    expect(result).toEqual({ localDeleted: 2, cloudDeleted: 3 })
    expect(markAsDeletedSpy).toHaveBeenCalledTimes(2)
  })
})

describe('chatStorage local-only classification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isDeletedSpy.mockReturnValue(false)
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
    isDeletedSpy.mockReturnValue(false)
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
