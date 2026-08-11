import { AUTH_ACTIVE_USER_ID } from '@/constants/storage-keys'
import { CloudSyncService } from '@/services/cloud/cloud-sync'
import { SyncEnclaveError } from '@/services/sync-enclave/sync-enclave-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  drainChatRevisionSync,
  isAuthenticated,
  clearRevisionSyncState,
  getChat,
  canWriteToCloud,
  uploadChat,
  downloadChat,
  finalizeUpload,
  getPendingUploadChats,
  applyRemoteChatIfFresh,
  listChats,
  processRemoteChat,
  getAllChats,
  deleteStoredChat,
  clearRevisionCheckpoint,
} = vi.hoisted(() => ({
  drainChatRevisionSync: vi.fn(),
  isAuthenticated: vi.fn(),
  clearRevisionSyncState: vi.fn(),
  getChat: vi.fn(),
  canWriteToCloud: vi.fn(),
  uploadChat: vi.fn(),
  downloadChat: vi.fn(),
  finalizeUpload: vi.fn(),
  getPendingUploadChats: vi.fn(),
  applyRemoteChatIfFresh: vi.fn(),
  listChats: vi.fn(),
  processRemoteChat: vi.fn(),
  getAllChats: vi.fn(),
  deleteStoredChat: vi.fn(),
  clearRevisionCheckpoint: vi.fn(),
}))

vi.mock('@/services/cloud/chat-revision-sync', () => ({
  drainChatRevisionSync,
}))
vi.mock('@/services/cloud/cloud-storage', () => ({
  cloudStorage: {
    isAuthenticated,
    uploadChat,
    downloadChat,
    listChats,
  },
}))
vi.mock('@/services/storage/indexed-db', () => ({
  indexedDBStorage: {
    clearRevisionSyncState,
    getChat,
    finalizeUpload,
    getPendingUploadChats,
    applyRemoteChatIfFresh,
    getAllChats,
    deleteChat: deleteStoredChat,
    clearRevisionCheckpoint,
  },
}))
vi.mock('@/services/cloud/cloud-key-authorization', () => ({
  canWriteToCloud,
}))
vi.mock('@/services/cloud/chat-codec', () => ({ processRemoteChat }))
vi.mock('@/services/storage/deleted-chats-tracker', () => ({
  deletedChatsTracker: {
    isDeleted: vi.fn(() => false),
    removeFromDeleted: vi.fn(),
  },
}))
vi.mock('@/services/cloud/streaming-tracker', () => ({
  streamingTracker: {
    isStreaming: vi.fn(() => false),
    onStreamEnd: vi.fn(),
  },
}))
vi.mock('@/services/cloud/sync-health', () => ({
  reportChatSynced: vi.fn(),
  reportChatSyncFailed: vi.fn(),
  reportKeyActionRequired: vi.fn(),
  reportSyncPaused: vi.fn(),
}))
vi.mock('@/utils/error-handling', () => ({
  logError: vi.fn(),
}))

describe('CloudSyncService revision coordinator routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem(AUTH_ACTIVE_USER_ID, 'user-1')
    isAuthenticated.mockResolvedValue(true)
    clearRevisionSyncState.mockResolvedValue(undefined)
    canWriteToCloud.mockResolvedValue(false)
    finalizeUpload.mockResolvedValue(undefined)
    getPendingUploadChats.mockResolvedValue([])
    applyRemoteChatIfFresh.mockResolvedValue({ applied: true })
    getAllChats.mockResolvedValue([])
    deleteStoredChat.mockResolvedValue(undefined)
    clearRevisionCheckpoint.mockResolvedValue(undefined)
    drainChatRevisionSync.mockResolvedValue({
      uploaded: 1,
      downloaded: 2,
      errors: [],
    })
  })

  it('routes smart sync through the account-wide coordinator', async () => {
    const result = await new CloudSyncService().smartSync('project-1')

    expect(result).toEqual({ uploaded: 1, downloaded: 2, errors: [] })
    expect(drainChatRevisionSync).toHaveBeenCalledTimes(1)
    expect(drainChatRevisionSync.mock.calls[0][1]).toBe('user-1')
  })

  it('fails closed when authenticated account identity is unavailable', async () => {
    localStorage.removeItem(AUTH_ACTIVE_USER_ID)

    await expect(new CloudSyncService().smartSync()).rejects.toThrow(
      'Authenticated user ID is unavailable',
    )
    expect(drainChatRevisionSync).not.toHaveBeenCalled()
  })

  it('does not contact the coordinator while unauthenticated', async () => {
    isAuthenticated.mockResolvedValue(false)

    await expect(new CloudSyncService().smartSync()).resolves.toEqual({
      uploaded: 0,
      downloaded: 0,
      errors: [],
    })
    expect(drainChatRevisionSync).not.toHaveBeenCalled()
  })

  it('clears durable revision state on account change', () => {
    const service = new CloudSyncService()
    service.resetForAccountChange()

    expect(clearRevisionSyncState).toHaveBeenCalledTimes(1)
  })

  it('waits for an old coordinator before clearing its checkpoint', async () => {
    let finishSync!: () => void
    drainChatRevisionSync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSync = () => resolve({ uploaded: 0, downloaded: 0, errors: [] })
        }),
    )
    const service = new CloudSyncService()
    const sync = service.smartSync()
    await vi.waitFor(() => expect(drainChatRevisionSync).toHaveBeenCalled())

    const clear = service.clearSyncStatus()
    expect(clearRevisionSyncState).not.toHaveBeenCalled()
    finishSync()
    await sync.catch(() => undefined)
    await clear

    expect(clearRevisionSyncState).toHaveBeenCalledTimes(1)
  })

  it('does not enqueue a prior-account chat for upload', async () => {
    canWriteToCloud.mockResolvedValue(true)
    getChat.mockResolvedValue({
      id: 'old-chat',
      syncUserId: 'user-0',
      locallyModified: true,
      messages: [{ role: 'user', content: 'old' }],
    })
    const service = new CloudSyncService()

    await service.backupChat('old-chat')
    await service.waitForAllUploads()

    expect(uploadChat).not.toHaveBeenCalled()
  })

  it('aborts an upload when the active account changes before finalization', async () => {
    canWriteToCloud.mockResolvedValue(true)
    getChat.mockResolvedValue({
      id: 'chat-1',
      syncUserId: 'user-1',
      locallyModified: true,
      pendingUpload: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      messages: [{ role: 'user', content: 'hello' }],
    })
    uploadChat.mockImplementationOnce(async () => {
      localStorage.setItem(AUTH_ACTIVE_USER_ID, 'user-2')
      return { syncVersion: 2, rewrites: [], projectIntentIncluded: false }
    })

    await expect(
      new CloudSyncService().backupChatNow('chat-1'),
    ).rejects.toThrow('Cloud account changed during synchronization')
    expect(finalizeUpload).not.toHaveBeenCalled()
  })

  it('counts an unsynced upload only after its clean state is observed', async () => {
    canWriteToCloud.mockResolvedValue(true)
    const pendingChat = {
      id: 'chat-1',
      syncUserId: 'user-1',
      locallyModified: true,
      pendingUpload: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      messages: [{ role: 'user', content: 'hello' }],
    }
    getPendingUploadChats.mockResolvedValue([pendingChat])
    getChat
      .mockResolvedValueOnce(pendingChat)
      .mockResolvedValueOnce({ ...pendingChat, pendingUpload: 0 })
      .mockResolvedValueOnce(pendingChat)
    uploadChat.mockResolvedValue({
      syncVersion: 2,
      rewrites: [],
      projectIntentIncluded: false,
    })

    await expect(new CloudSyncService().backupUnsyncedChats()).resolves.toEqual(
      {
        uploaded: 0,
        downloaded: 0,
        errors: [expect.stringContaining('Chat upload did not finalize')],
      },
    )
  })

  it('resolves an upload conflict by applying the winning remote chat', async () => {
    canWriteToCloud.mockResolvedValue(true)
    const local = {
      id: 'chat-1',
      syncUserId: 'user-1',
      locallyModified: true,
      pendingUpload: 1,
      syncVersion: 1,
      clock: 1,
      writer: 'device-a',
      clockVersion: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      messages: [{ role: 'user', content: 'local' }],
    }
    const remote = {
      ...local,
      locallyModified: false,
      pendingUpload: 0,
      syncVersion: 2,
      clock: 2,
      writer: 'device-b',
      clockVersion: 2,
      updatedAt: '2026-01-02T00:00:00Z',
    }
    getChat.mockResolvedValue(local)
    uploadChat.mockRejectedValueOnce(
      new SyncEnclaveError('conflict', 409, 'SYNC_CONFLICT'),
    )
    downloadChat.mockResolvedValue(remote)

    const service = new CloudSyncService()
    await service.backupChat('chat-1')
    await service.waitForAllUploads()

    expect(applyRemoteChatIfFresh).toHaveBeenCalledWith(
      expect.objectContaining({
        chat: remote,
        syncVersion: 2,
        allowLocallyModified: true,
      }),
    )
  })

  it('prevents a pagination write after the active account changes', async () => {
    listChats.mockResolvedValue({
      conversations: [{ id: 'chat-1', content: '{}', syncVersion: 1 }],
      hasMore: false,
    })
    processRemoteChat.mockImplementationOnce(async () => {
      localStorage.setItem(AUTH_ACTIVE_USER_ID, 'user-2')
      return { chat: { id: 'chat-1', messages: [] } }
    })

    await expect(
      new CloudSyncService().fetchAndStorePage({ limit: 10 }),
    ).rejects.toThrow('Cloud account changed during synchronization')
    expect(applyRemoteChatIfFresh).not.toHaveBeenCalled()
  })

  it('continues decryption recovery after an individual eviction fails', async () => {
    getAllChats
      .mockResolvedValueOnce([
        { id: 'failed-1', decryptionFailed: true },
        { id: 'failed-2', decryptionFailed: true },
      ])
      .mockResolvedValueOnce([])
    deleteStoredChat
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValueOnce(undefined)

    await expect(
      new CloudSyncService().retryDecryptionWithNewKey(),
    ).resolves.toBe(2)
    expect(clearRevisionCheckpoint).toHaveBeenCalledOnce()
    expect(drainChatRevisionSync).toHaveBeenCalledOnce()
  })
})
