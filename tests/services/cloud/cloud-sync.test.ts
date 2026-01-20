import { CloudSyncService } from '@/services/cloud/cloud-sync'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetAllChats = vi.fn()
const mockGetUnsyncedChats = vi.fn()
const mockGetChat = vi.fn()
const mockSaveChat = vi.fn()
const mockMarkAsSynced = vi.fn()
const mockDeleteChat = vi.fn()

const mockIsAuthenticated = vi.fn()
const mockUploadChat = vi.fn()
const mockGetChatSyncStatus = vi.fn()

const mockEncryptionInitialize = vi.fn()

const mockIsStreaming = vi.fn()
const mockOnStreamEnd = vi.fn()

const mockChatEventsEmit = vi.fn()

vi.mock('@/utils/error-handling', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarning: vi.fn(),
}))

vi.mock('@/services/storage/indexed-db', () => ({
  indexedDBStorage: {
    getAllChats: (...args: any[]) => mockGetAllChats(...args),
    getUnsyncedChats: (...args: any[]) => mockGetUnsyncedChats(...args),
    saveChat: (...args: any[]) => mockSaveChat(...args),
    markAsSynced: (...args: any[]) => mockMarkAsSynced(...args),
    getChat: (...args: any[]) => mockGetChat(...args),
    deleteChat: (...args: any[]) => mockDeleteChat(...args),
  },
}))

vi.mock('@/services/cloud/cloud-storage', () => ({
  cloudStorage: {
    isAuthenticated: (...args: any[]) => mockIsAuthenticated(...args),
    uploadChat: (...args: any[]) => mockUploadChat(...args),
    getChatSyncStatus: (...args: any[]) => mockGetChatSyncStatus(...args),
  },
}))

vi.mock('@/services/encryption/encryption-service', () => ({
  encryptionService: {
    initialize: (...args: any[]) => mockEncryptionInitialize(...args),
  },
}))

vi.mock('@/services/cloud/streaming-tracker', () => ({
  streamingTracker: {
    isStreaming: (...args: any[]) => mockIsStreaming(...args),
    onStreamEnd: (...args: any[]) => mockOnStreamEnd(...args),
  },
}))

vi.mock('@/services/storage/chat-events', () => ({
  chatEvents: {
    emit: (...args: any[]) => mockChatEventsEmit(...args),
  },
}))

describe('CloudSyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSaveChat.mockResolvedValue(undefined)
    mockMarkAsSynced.mockResolvedValue(undefined)
    mockDeleteChat.mockResolvedValue(undefined)
    mockIsAuthenticated.mockResolvedValue(true)
    mockUploadChat.mockResolvedValue(null)
    mockGetChatSyncStatus.mockResolvedValue({ count: 0, lastUpdated: null })
    mockEncryptionInitialize.mockResolvedValue(null)
    mockIsStreaming.mockReturnValue(false)
    mockOnStreamEnd.mockImplementation(() => {})
  })

  describe('reencryptAndUploadChats', () => {
    it('does not upload local-only chats', async () => {
      mockGetAllChats.mockResolvedValue([
        {
          id: 'local-only-1',
          title: 'Local only',
          messages: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          lastAccessedAt: Date.now(),
          isBlankChat: false,
          isLocalOnly: true,
          decryptionFailed: false,
          encryptedData: undefined,
          syncVersion: 10,
        },
        {
          id: 'cloud-1',
          title: 'Cloud',
          messages: [],
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
          lastAccessedAt: Date.now(),
          isBlankChat: false,
          isLocalOnly: false,
          decryptionFailed: false,
          encryptedData: undefined,
          syncVersion: 1,
        },
      ])

      const service = new CloudSyncService()
      const result = await service.reencryptAndUploadChats()

      expect(mockEncryptionInitialize).toHaveBeenCalled()
      expect(mockUploadChat).toHaveBeenCalledTimes(1)
      expect(mockUploadChat.mock.calls[0]?.[0]?.id).toBe('cloud-1')

      // We persist the chat (with bumped syncVersion) only for the one we upload
      expect(mockSaveChat).toHaveBeenCalledTimes(1)
      expect(mockSaveChat.mock.calls[0]?.[0]?.id).toBe('cloud-1')
      expect(mockMarkAsSynced).toHaveBeenCalledTimes(1)

      expect(result.uploaded).toBe(1)
      expect(result.reencrypted).toBe(1)
      expect(result.errors).toEqual([])
    })
  })

  describe('backupChat', () => {
    it('skips local-only chats', async () => {
      mockGetChat.mockResolvedValue({
        id: 'local-only-1',
        title: 'Local only',
        messages: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        lastAccessedAt: Date.now(),
        isBlankChat: false,
        isLocalOnly: true,
        syncVersion: 2,
      })

      const service = new CloudSyncService()
      await service.backupChat('local-only-1')

      expect(mockUploadChat).not.toHaveBeenCalled()
      expect(mockMarkAsSynced).not.toHaveBeenCalled()
    })

    it('skips blank chats', async () => {
      mockGetChat.mockResolvedValue({
        id: 'blank-1',
        title: '',
        messages: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        lastAccessedAt: Date.now(),
        isBlankChat: true,
        isLocalOnly: false,
        syncVersion: 2,
      })

      const service = new CloudSyncService()
      await service.backupChat('blank-1')

      expect(mockUploadChat).not.toHaveBeenCalled()
      expect(mockMarkAsSynced).not.toHaveBeenCalled()
    })

    it('marks chat as synced with incremented version on success', async () => {
      mockGetChat.mockResolvedValue({
        id: 'cloud-1',
        title: 'Cloud',
        messages: [{ role: 'user', content: 'hi' }],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        lastAccessedAt: Date.now(),
        isBlankChat: false,
        isLocalOnly: false,
        syncVersion: 7,
      })

      const service = new CloudSyncService()
      await service.backupChat('cloud-1')

      expect(mockUploadChat).toHaveBeenCalledTimes(1)
      expect(mockMarkAsSynced).toHaveBeenCalledTimes(1)
      expect(mockMarkAsSynced).toHaveBeenCalledWith('cloud-1', 8)
    })

    it('handles temp ID -> server ID rotation by updating IndexedDB', async () => {
      const tempChat = {
        id: 'temp-123',
        title: 'Temp',
        messages: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        lastAccessedAt: Date.now(),
        isBlankChat: false,
        isLocalOnly: false,
        syncVersion: 0,
      }

      // CloudSync reads the chat, then re-checks it still exists before rewriting IDs
      mockGetChat
        .mockResolvedValueOnce(tempChat)
        .mockResolvedValueOnce(tempChat)

      mockUploadChat.mockResolvedValue('server-999')

      const service = new CloudSyncService()
      await service.backupChat('temp-123')

      expect(mockDeleteChat).toHaveBeenCalledWith('temp-123')
      expect(mockSaveChat).toHaveBeenCalledWith({
        ...tempChat,
        id: 'server-999',
      })
      expect(mockChatEventsEmit).toHaveBeenCalledWith({
        reason: 'sync',
        ids: ['server-999'],
      })

      // After rotation, mark the new ID as synced with incremented version
      expect(mockMarkAsSynced).toHaveBeenCalledWith('server-999', 1)
    })
  })

  describe('backupUnsyncedChats', () => {
    it('filters out local-only, streaming, blank, failed-decryption and encryptedData chats', async () => {
      const good = {
        id: 'cloud-1',
        title: 'Good',
        messages: [{ role: 'user', content: 'hi' }],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        lastAccessedAt: Date.now(),
        isBlankChat: false,
        isLocalOnly: false,
        decryptionFailed: false,
        encryptedData: undefined,
        syncVersion: 3,
      }

      mockGetUnsyncedChats.mockResolvedValue([
        { ...good, id: 'local-only', isLocalOnly: true },
        { ...good, id: 'blank', isBlankChat: true },
        { ...good, id: 'failed', decryptionFailed: true },
        { ...good, id: 'encrypted', encryptedData: '{"x":"y"}' },
        { ...good, id: 'streaming' },
        good,
      ])

      mockIsStreaming.mockImplementation((id: string) => id === 'streaming')

      const service = new CloudSyncService()
      const result = await service.backupUnsyncedChats()

      expect(mockUploadChat).toHaveBeenCalledTimes(1)
      expect(mockUploadChat.mock.calls[0]?.[0]?.id).toBe('cloud-1')
      expect(mockMarkAsSynced).toHaveBeenCalledWith('cloud-1', 4)
      expect(result.uploaded).toBe(1)
      expect(result.errors).toEqual([])
    })
  })

  describe('checkSyncStatus', () => {
    it('returns local_changes when there are unsynced non-local chats', async () => {
      mockGetUnsyncedChats.mockResolvedValue([
        { id: 'local-only', isLocalOnly: true, isBlankChat: false },
        { id: 'blank', isLocalOnly: false, isBlankChat: true },
        { id: 'streaming', isLocalOnly: false, isBlankChat: false },
        { id: 'good', isLocalOnly: false, isBlankChat: false },
      ])
      mockIsStreaming.mockImplementation((id: string) => id === 'streaming')

      const service = new CloudSyncService()
      const status = await service.checkSyncStatus()

      expect(status).toEqual({ needsSync: true, reason: 'local_changes' })
      expect(mockGetChatSyncStatus).not.toHaveBeenCalled()
    })

    it('returns count_changed when there is no cached status', async () => {
      mockGetUnsyncedChats.mockResolvedValue([])
      mockGetChatSyncStatus.mockResolvedValue({
        count: 5,
        lastUpdated: '2024-01-01T00:00:00.000Z',
      })

      const service = new CloudSyncService()
      const status = await service.checkSyncStatus()

      expect(status.needsSync).toBe(true)
      expect(status.reason).toBe('count_changed')
      expect(status.remoteCount).toBe(5)
      expect(status.remoteLastUpdated).toBe('2024-01-01T00:00:00.000Z')
    })

    it('returns no_changes when cached status matches remote status and there are no local changes', async () => {
      mockGetUnsyncedChats.mockResolvedValue([])
      mockGetChatSyncStatus.mockResolvedValue({
        count: 5,
        lastUpdated: '2024-01-01T00:00:00.000Z',
      })

      localStorage.setItem(
        'tinfoil-chat-sync-status',
        JSON.stringify({
          count: 5,
          lastUpdated: '2024-01-01T00:00:00.000Z',
        }),
      )

      const service = new CloudSyncService()
      const status = await service.checkSyncStatus()

      expect(status.needsSync).toBe(false)
      expect(status.reason).toBe('no_changes')
      expect(status.remoteCount).toBe(5)
      expect(status.remoteLastUpdated).toBe('2024-01-01T00:00:00.000Z')
    })
  })
})
