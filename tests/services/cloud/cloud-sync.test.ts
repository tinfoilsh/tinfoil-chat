import { AUTH_ACTIVE_USER_ID } from '@/constants/storage-keys'
import { CloudSyncService } from '@/services/cloud/cloud-sync'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  drainChatRevisionSync,
  isAuthenticated,
  clearRevisionSyncState,
  getChat,
  canWriteToCloud,
  uploadChat,
} = vi.hoisted(() => ({
  drainChatRevisionSync: vi.fn(),
  isAuthenticated: vi.fn(),
  clearRevisionSyncState: vi.fn(),
  getChat: vi.fn(),
  canWriteToCloud: vi.fn(),
  uploadChat: vi.fn(),
}))

vi.mock('@/services/cloud/chat-revision-sync', () => ({
  drainChatRevisionSync,
}))
vi.mock('@/services/cloud/cloud-storage', () => ({
  cloudStorage: {
    isAuthenticated,
    deleteChat: vi.fn(),
    updateChatProject: vi.fn(),
    uploadChat,
  },
}))
vi.mock('@/services/storage/indexed-db', () => ({
  indexedDBStorage: {
    clearRevisionSyncState,
    getChat,
    finalizeUpload: vi.fn(),
  },
}))
vi.mock('@/services/cloud/cloud-key-authorization', () => ({
  canWriteToCloud,
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
  logInfo: vi.fn(),
}))

describe('CloudSyncService revision coordinator routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem(AUTH_ACTIVE_USER_ID, 'user-1')
    isAuthenticated.mockResolvedValue(true)
    clearRevisionSyncState.mockResolvedValue(undefined)
    canWriteToCloud.mockResolvedValue(false)
    drainChatRevisionSync.mockResolvedValue({
      uploaded: 1,
      downloaded: 2,
      errors: [],
    })
  })

  it.each([
    ['smartSync', (service: CloudSyncService) => service.smartSync()],
    ['syncAllChats', (service: CloudSyncService) => service.syncAllChats()],
    [
      'syncChangedChats',
      (service: CloudSyncService) => service.syncChangedChats(),
    ],
    [
      'syncProjectChats',
      (service: CloudSyncService) => service.syncProjectChats('project-1'),
    ],
    [
      'syncProjectChatsChanged',
      (service: CloudSyncService) =>
        service.syncProjectChatsChanged('project-1'),
    ],
  ])('routes %s through the account-wide coordinator', async (_name, run) => {
    const result = await run(new CloudSyncService())

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
})
