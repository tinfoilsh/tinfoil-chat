import { drainChatRevisionSync } from '@/services/cloud/chat-revision-sync'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getSyncState,
  hasPendingSyncWork,
  getChat,
  applyRemoteDeletion,
  commitRevisionBatch,
  reconcileRevisionSnapshot,
  getPendingDeletes,
  acknowledgePendingDelete,
  getPendingUploadChats,
  revisionSummary,
  revisionEvents,
  revisionSnapshot,
  downloadChats,
  deleteChat,
  ingestRemoteChats,
} = vi.hoisted(() => ({
  getSyncState: vi.fn(),
  hasPendingSyncWork: vi.fn(),
  getChat: vi.fn(),
  applyRemoteDeletion: vi.fn(),
  commitRevisionBatch: vi.fn(),
  reconcileRevisionSnapshot: vi.fn(),
  getPendingDeletes: vi.fn(),
  acknowledgePendingDelete: vi.fn(),
  getPendingUploadChats: vi.fn(),
  revisionSummary: vi.fn(),
  revisionEvents: vi.fn(),
  revisionSnapshot: vi.fn(),
  downloadChats: vi.fn(),
  deleteChat: vi.fn(),
  ingestRemoteChats: vi.fn(),
}))

vi.mock('@/services/storage/indexed-db', () => ({
  indexedDBStorage: {
    getSyncState,
    hasPendingSyncWork,
    getChat,
    applyRemoteDeletion,
    commitRevisionBatch,
    reconcileRevisionSnapshot,
    getPendingDeletes,
    acknowledgePendingDelete,
    getPendingUploadChats,
  },
}))

vi.mock('@/services/sync-enclave/sync-api', () => ({
  revisionSummary,
  revisionEvents,
  revisionSnapshot,
}))

vi.mock('@/services/cloud/cloud-storage', () => ({
  cloudStorage: { downloadChats, deleteChat },
}))

vi.mock('@/services/cloud/chat-ingestion', () => ({ ingestRemoteChats }))
vi.mock('@/services/storage/chat-events', () => ({
  chatEvents: { emit: vi.fn() },
}))
vi.mock('@/services/cloud/sync-predicates', () => ({
  isUploadableChat: (
    chat: { id: string },
    isStreaming: (id: string) => boolean,
  ) => !isStreaming(chat.id),
}))

describe('chat revision synchronization', () => {
  const userId = 'user-1'
  const adapter = {
    upload: vi.fn(),
    isStreaming: vi.fn<(id: string) => boolean>(() => false),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    getSyncState.mockResolvedValue({
      id: 'account',
      userId,
      appliedRevision: '7',
      bootstrapped: true,
    })
    hasPendingSyncWork.mockResolvedValue(false)
    revisionSummary.mockResolvedValue({
      current_revision: '7',
      oldest_replayable_revision: '1',
    })
    getPendingDeletes.mockResolvedValue([])
    getPendingUploadChats.mockResolvedValue([])
    applyRemoteDeletion.mockResolvedValue(true)
    commitRevisionBatch.mockResolvedValue(undefined)
    reconcileRevisionSnapshot.mockResolvedValue([])
    ingestRemoteChats.mockResolvedValue({
      savedIds: [],
      downloaded: 0,
      errors: [],
    })
  })

  it('uses one summary request and stops when nothing changed', async () => {
    await expect(drainChatRevisionSync(adapter, userId)).resolves.toEqual({
      uploaded: 0,
      downloaded: 0,
      errors: [],
    })

    expect(revisionSummary).toHaveBeenCalledTimes(1)
    expect(revisionEvents).not.toHaveBeenCalled()
    expect(revisionSnapshot).not.toHaveBeenCalled()
    expect(getPendingUploadChats).not.toHaveBeenCalled()
  })

  it('applies ordered deletes and project moves before pending uploads', async () => {
    const order: string[] = []
    hasPendingSyncWork.mockResolvedValue(true)
    revisionSummary.mockResolvedValue({
      current_revision: '9',
      oldest_replayable_revision: '1',
    })
    revisionEvents.mockResolvedValue({
      events: [
        {
          revision: '8',
          kind: 'delete',
          id: 'deleted-chat',
          project_id: null,
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          revision: '9',
          kind: 'upsert',
          id: 'moved-chat',
          etag: '3',
          key_id: 'key-1',
          project_id: 'project-2',
          updated_at: '2026-01-02T00:00:00Z',
        },
      ],
    })
    applyRemoteDeletion.mockImplementation(async () => {
      order.push('remote-delete')
      return true
    })
    getChat.mockResolvedValue({ id: 'moved-chat', syncVersion: 3 })
    commitRevisionBatch.mockImplementation(async () => {
      order.push('checkpoint')
    })
    getPendingUploadChats.mockResolvedValue([{ id: 'local-chat' }])
    adapter.upload.mockImplementation(async () => {
      order.push('upload')
    })

    await drainChatRevisionSync(adapter, userId)

    expect(order).toEqual(['remote-delete', 'checkpoint', 'upload'])
    expect(commitRevisionBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'moved-chat',
          projectId: 'project-2',
          revision: '9',
        }),
      ]),
      '9',
      userId,
    )
  })

  it('repairs an expired checkpoint with a metadata snapshot', async () => {
    getSyncState.mockResolvedValue({
      id: 'account',
      userId,
      appliedRevision: '2',
      bootstrapped: true,
    })
    revisionSummary.mockResolvedValue({
      current_revision: '12',
      oldest_replayable_revision: '5',
    })
    revisionSnapshot.mockResolvedValue({
      snapshot_revision: '12',
      items: [
        {
          id: 'remote-chat',
          etag: '4',
          key_id: 'key-1',
          project_id: null,
          updated_at: '2026-01-02T00:00:00Z',
        },
      ],
    })
    getChat.mockResolvedValue(null)
    downloadChats.mockResolvedValue([
      {
        id: 'remote-chat',
        updatedAt: '',
        syncVersion: 4,
        content: '{}',
      },
    ])
    ingestRemoteChats.mockResolvedValue({
      savedIds: ['remote-chat'],
      downloaded: 1,
      errors: [],
    })

    const result = await drainChatRevisionSync(adapter, userId)

    expect(result.downloaded).toBe(1)
    expect(reconcileRevisionSnapshot).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'remote-chat', revision: '12' })],
      '12',
      userId,
    )
    expect(revisionEvents).not.toHaveBeenCalled()
  })

  it('fails closed without uploads or checkpoint advancement', async () => {
    hasPendingSyncWork.mockResolvedValue(true)
    revisionSummary.mockResolvedValue({
      current_revision: '8',
      oldest_replayable_revision: '1',
    })
    revisionEvents.mockRejectedValue(new Error('protocol unavailable'))

    await expect(drainChatRevisionSync(adapter, userId)).rejects.toThrow(
      'protocol unavailable',
    )
    expect(commitRevisionBatch).not.toHaveBeenCalled()
    expect(adapter.upload).not.toHaveBeenCalled()
  })

  it('repairs a checkpoint ahead of the server revision', async () => {
    getSyncState.mockResolvedValue({
      id: 'account',
      userId,
      appliedRevision: '20',
      bootstrapped: true,
    })
    revisionSummary.mockResolvedValue({
      current_revision: '10',
      oldest_replayable_revision: '1',
    })
    revisionSnapshot.mockResolvedValue({
      snapshot_revision: '10',
      items: [],
    })

    await drainChatRevisionSync(adapter, userId)

    expect(revisionSnapshot).toHaveBeenCalledTimes(1)
    expect(reconcileRevisionSnapshot).toHaveBeenCalledWith([], '10', userId)
  })

  it('pulls all stale clean local rows plus only recent missing rows', async () => {
    getSyncState.mockResolvedValue(null)
    revisionSummary.mockResolvedValue({
      current_revision: '60',
      oldest_replayable_revision: '1',
    })
    const missingItems = Array.from({ length: 52 }, (_, index) => ({
      id: `missing-${index}`,
      etag: '2',
      key_id: 'key-1',
      project_id: null,
      updated_at: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
    }))
    const staleItem = {
      id: 'stale-existing',
      etag: '9',
      key_id: 'key-1',
      project_id: null,
      updated_at: '2025-01-01T00:00:00Z',
    }
    revisionSnapshot.mockResolvedValue({
      snapshot_revision: '60',
      items: [...missingItems, staleItem],
    })
    getChat.mockImplementation(async (id: string) =>
      id === staleItem.id
        ? { id, syncVersion: 1, locallyModified: false }
        : null,
    )
    downloadChats.mockImplementation(async (ids: string[]) =>
      ids.map((id) => ({ id, content: '{}', syncVersion: 2, updatedAt: '' })),
    )

    await drainChatRevisionSync(adapter, userId)

    const pulledIds = downloadChats.mock.calls.flatMap(([ids]) => ids)
    expect(pulledIds).toContain('stale-existing')
    expect(pulledIds.filter((id) => id.startsWith('missing-'))).toHaveLength(50)
  })

  it('re-pulls failed-decryption rows whose snapshot ETag still matches', async () => {
    getSyncState.mockResolvedValue(null)
    revisionSummary.mockResolvedValue({
      current_revision: '10',
      oldest_replayable_revision: '1',
    })
    revisionSnapshot.mockResolvedValue({
      snapshot_revision: '10',
      items: [
        {
          id: 'failed-chat',
          etag: '4',
          key_id: 'key-1',
          project_id: null,
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    })
    getChat.mockResolvedValue({
      id: 'failed-chat',
      syncVersion: 4,
      decryptionFailed: true,
      locallyModified: false,
    })
    downloadChats.mockResolvedValue([
      { id: 'failed-chat', content: '{}', syncVersion: 4, updatedAt: '' },
    ])

    await drainChatRevisionSync(adapter, userId)

    expect(downloadChats).toHaveBeenCalledWith(['failed-chat'], {
      tolerateNotFound: true,
    })
  })

  it('does not pull or overwrite metadata for a dirty event row', async () => {
    revisionSummary.mockResolvedValue({
      current_revision: '8',
      oldest_replayable_revision: '1',
    })
    revisionEvents.mockResolvedValue({
      events: [
        {
          revision: '8',
          kind: 'upsert',
          id: 'dirty-chat',
          etag: '5',
          key_id: 'key-1',
          project_id: 'remote-project',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    })
    getChat.mockResolvedValue({
      id: 'dirty-chat',
      syncVersion: 2,
      projectId: 'local-project',
      locallyModified: true,
    })

    await drainChatRevisionSync(adapter, userId)

    expect(downloadChats).not.toHaveBeenCalled()
    expect(commitRevisionBatch).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'dirty-chat', etag: '5' })],
      '8',
      userId,
    )
  })

  it('advances through a missing upsert when a later delete confirms absence', async () => {
    revisionSummary.mockResolvedValue({
      current_revision: '9',
      oldest_replayable_revision: '1',
    })
    revisionEvents.mockResolvedValue({
      events: [
        {
          revision: '8',
          kind: 'upsert',
          id: 'gone-chat',
          etag: '2',
          key_id: 'key-1',
          project_id: null,
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          revision: '9',
          kind: 'delete',
          id: 'gone-chat',
          project_id: null,
          updated_at: '2026-01-02T00:00:00Z',
        },
      ],
    })
    getChat.mockResolvedValue(null)
    downloadChats.mockResolvedValue([])

    await drainChatRevisionSync(adapter, userId)

    expect(downloadChats).toHaveBeenCalledWith(['gone-chat'], {
      tolerateNotFound: true,
    })
    expect(applyRemoteDeletion).toHaveBeenCalledWith(
      'gone-chat',
      userId,
      expect.any(Function),
    )
    expect(commitRevisionBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'gone-chat', kind: 'delete' }),
      ]),
      '9',
      userId,
    )
  })

  it('retries a durable delete with its original idempotency key', async () => {
    hasPendingSyncWork.mockResolvedValue(true)
    getPendingDeletes.mockResolvedValue([
      {
        id: 'deleted-chat',
        userId,
        idempotencyKey: 'stable-delete-key',
      },
    ])
    deleteChat
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(undefined)

    await expect(drainChatRevisionSync(adapter, userId)).rejects.toThrow(
      'temporary failure',
    )
    expect(acknowledgePendingDelete).not.toHaveBeenCalled()

    await drainChatRevisionSync(adapter, userId)

    expect(deleteChat).toHaveBeenNthCalledWith(
      1,
      'deleted-chat',
      'stable-delete-key',
    )
    expect(deleteChat).toHaveBeenNthCalledWith(
      2,
      'deleted-chat',
      'stable-delete-key',
    )
    expect(acknowledgePendingDelete).toHaveBeenCalledWith(
      'deleted-chat',
      userId,
    )
  })

  it('skips streaming chats and counts only completed uploads', async () => {
    hasPendingSyncWork.mockResolvedValue(true)
    getPendingUploadChats.mockResolvedValue([
      { id: 'streaming-chat' },
      { id: 'ready-chat' },
    ])
    adapter.isStreaming.mockImplementation((id) => id === 'streaming-chat')

    const result = await drainChatRevisionSync(adapter, userId)

    expect(adapter.upload).toHaveBeenCalledTimes(1)
    expect(adapter.upload).toHaveBeenCalledWith({ id: 'ready-chat' })
    expect(result.uploaded).toBe(1)
  })
})
