import { SYNC_CHAT_DELETES_WATERMARK } from '@/constants/storage-keys'
import {
  CHAT_DELETES_WATERMARK_EPOCH,
  CHAT_DELETES_WATERMARK_OVERLAP_MS,
} from '@/services/cloud/chat-deletes-watermark'
import {
  ingestRemoteChats,
  syncRemoteDeletions,
} from '@/services/cloud/chat-ingestion'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockListChatEventsSince = vi.fn()
const mockGetChat = vi.fn()
const mockDeleteChatIfUnchanged = vi.fn()
const mockApplyRemoteChatIfFresh = vi.fn()
const mockProcessRemoteChat = vi.fn()
const mockIsDeleted = vi.fn()
const mockMarkAsDeleted = vi.fn()
const mockRemoveFromDeleted = vi.fn()
const mockEmit = vi.fn()

vi.mock('@/utils/error-handling', () => ({
  logError: vi.fn(),
}))

vi.mock('@/services/cloud/cloud-storage', () => ({
  cloudStorage: {
    listChatEventsSince: (...args: any[]) => mockListChatEventsSince(...args),
  },
}))

vi.mock('@/services/storage/indexed-db', () => ({
  indexedDBStorage: {
    getChat: (...args: any[]) => mockGetChat(...args),
    deleteChatIfUnchanged: (...args: any[]) =>
      mockDeleteChatIfUnchanged(...args),
    applyRemoteChatIfFresh: (...args: any[]) =>
      mockApplyRemoteChatIfFresh(...args),
  },
}))

vi.mock('@/services/storage/deleted-chats-tracker', () => ({
  deletedChatsTracker: {
    markAsDeleted: (...args: any[]) => mockMarkAsDeleted(...args),
    isDeleted: (...args: any[]) => mockIsDeleted(...args),
    removeFromDeleted: (...args: any[]) => mockRemoveFromDeleted(...args),
  },
}))

vi.mock('@/services/storage/chat-events', () => ({
  chatEvents: {
    emit: (...args: any[]) => mockEmit(...args),
  },
}))

vi.mock('@/services/cloud/chat-codec', () => ({
  processRemoteChat: (...args: any[]) => mockProcessRemoteChat(...args),
}))

describe('syncRemoteDeletions', () => {
  const deletedAt = '2026-01-01T00:00:10.000Z'
  const events = (
    deletes: Array<{ id: string; deletedAt: string }>,
    updates: Array<{ id: string; updatedAt: string }> = [],
  ) => ({ updates, deletes })

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.removeItem(SYNC_CHAT_DELETES_WATERMARK)
    mockDeleteChatIfUnchanged.mockResolvedValue(true)
    mockApplyRemoteChatIfFresh.mockResolvedValue({ applied: true })
    mockIsDeleted.mockReturnValue(false)
    mockListChatEventsSince.mockResolvedValue(events([]))
  })

  it('preserves local-only chats when their cloud copy was deleted', async () => {
    mockListChatEventsSince.mockResolvedValue(
      events([
        { id: 'local-chat', deletedAt },
        { id: 'cloud-chat', deletedAt },
      ]),
    )
    mockGetChat.mockImplementation(async (id: string) => {
      if (id === 'local-chat') return { id, isLocalOnly: true }
      if (id === 'cloud-chat') {
        return {
          id,
          isLocalOnly: false,
          updatedAt: '2026-01-02T00:00:00.000Z',
        }
      }
      return null
    })

    const result = await syncRemoteDeletions('test')

    expect(mockDeleteChatIfUnchanged).toHaveBeenCalledTimes(1)
    expect(mockDeleteChatIfUnchanged).toHaveBeenCalledWith(
      'cloud-chat',
      '2026-01-02T00:00:00.000Z',
      expect.any(Function),
    )
    expect(mockMarkAsDeleted).toHaveBeenCalledTimes(1)
    expect(mockMarkAsDeleted).toHaveBeenCalledWith('cloud-chat')
    expect(mockEmit).toHaveBeenCalledWith({
      reason: 'sync',
      ids: ['cloud-chat'],
    })
    expect(result).toEqual({ reconciled: true, failed: false })
  })

  it('records the tombstone for chats already absent locally without emitting', async () => {
    mockListChatEventsSince.mockResolvedValue(
      events([{ id: 'already-gone', deletedAt }]),
    )
    mockGetChat.mockResolvedValue(null)

    await syncRemoteDeletions('test')

    expect(mockDeleteChatIfUnchanged).not.toHaveBeenCalled()
    expect(mockMarkAsDeleted).toHaveBeenCalledWith('already-gone')
    expect(mockEmit).not.toHaveBeenCalled()
  })

  it('does not apply deletions after the account generation changes', async () => {
    let current = true
    mockListChatEventsSince.mockImplementation(async () => {
      current = false
      return events([{ id: 'old-account-chat', deletedAt }])
    })

    const result = await syncRemoteDeletions('test', () => current)

    expect(mockGetChat).not.toHaveBeenCalled()
    expect(mockDeleteChatIfUnchanged).not.toHaveBeenCalled()
    expect(mockEmit).not.toHaveBeenCalled()
    expect(result).toEqual({ reconciled: false, failed: true })
  })

  it('does not publish a deletion after the account generation changes', async () => {
    let current = true
    mockListChatEventsSince.mockResolvedValue(
      events([{ id: 'old-account-chat', deletedAt }]),
    )
    mockGetChat.mockResolvedValue({
      id: 'old-account-chat',
      isLocalOnly: false,
      updatedAt: '2026-01-02T00:00:00.000Z',
    })
    mockDeleteChatIfUnchanged.mockImplementation(async () => {
      current = false
      return true
    })

    await syncRemoteDeletions('test', () => current)

    expect(mockMarkAsDeleted).not.toHaveBeenCalled()
    expect(mockEmit).not.toHaveBeenCalled()
  })

  it('does not emit earlier deletions after a later iteration is invalidated', async () => {
    let current = true
    mockListChatEventsSince.mockResolvedValue(
      events([
        { id: 'deleted-chat', deletedAt },
        { id: 'stale-chat', deletedAt },
      ]),
    )
    mockGetChat.mockResolvedValue({
      isLocalOnly: false,
      updatedAt: '2026-01-02T00:00:00.000Z',
    })
    mockDeleteChatIfUnchanged
      .mockResolvedValueOnce(true)
      .mockImplementationOnce(async () => {
        current = false
        return false
      })

    await syncRemoteDeletions('test', () => current)

    expect(mockMarkAsDeleted).toHaveBeenCalledWith('deleted-chat')
    expect(mockEmit).not.toHaveBeenCalled()
  })

  it('starts from epoch when no watermark is persisted and resumes from it afterwards', async () => {
    mockGetChat.mockResolvedValue(null)

    await syncRemoteDeletions('test')
    expect(mockListChatEventsSince).toHaveBeenCalledWith(
      CHAT_DELETES_WATERMARK_EPOCH,
    )
    // An empty window leaves the watermark untouched.
    expect(localStorage.getItem(SYNC_CHAT_DELETES_WATERMARK)).toBeNull()

    localStorage.setItem(
      SYNC_CHAT_DELETES_WATERMARK,
      '2026-01-01T00:00:00.000Z',
    )
    await syncRemoteDeletions('test')
    expect(mockListChatEventsSince).toHaveBeenLastCalledWith(
      '2026-01-01T00:00:00.000Z',
    )
  })

  it('advances the watermark past applied tombstones with a safety overlap', async () => {
    mockListChatEventsSince.mockResolvedValue(
      events(
        [{ id: 'gone', deletedAt }],
        [{ id: 'other', updatedAt: '2026-01-01T00:00:20.000Z' }],
      ),
    )
    mockGetChat.mockResolvedValue(null)

    const result = await syncRemoteDeletions('test')

    expect(result).toEqual({ reconciled: true, failed: false })
    expect(localStorage.getItem(SYNC_CHAT_DELETES_WATERMARK)).toBe(
      new Date(
        Date.parse('2026-01-01T00:00:20.000Z') -
          CHAT_DELETES_WATERMARK_OVERLAP_MS,
      ).toISOString(),
    )
  })

  it('holds the watermark when applying a tombstone fails', async () => {
    mockListChatEventsSince.mockResolvedValue(
      events([{ id: 'failing', deletedAt }]),
    )
    mockGetChat.mockRejectedValue(new Error('idb unavailable'))

    const result = await syncRemoteDeletions('test')

    expect(result).toEqual({ reconciled: false, failed: true })
    expect(localStorage.getItem(SYNC_CHAT_DELETES_WATERMARK)).toBeNull()
  })

  it('holds the watermark when a local row changed under the tombstone, without reporting failure', async () => {
    mockListChatEventsSince.mockResolvedValue(
      events([{ id: 'edited-during-pass', deletedAt }]),
    )
    mockGetChat.mockResolvedValue({
      id: 'edited-during-pass',
      isLocalOnly: false,
      updatedAt: '2026-01-02T00:00:00.000Z',
    })
    mockDeleteChatIfUnchanged.mockResolvedValue(false)

    const result = await syncRemoteDeletions('test')

    expect(result).toEqual({ reconciled: false, failed: false })
    expect(mockMarkAsDeleted).not.toHaveBeenCalled()
    expect(localStorage.getItem(SYNC_CHAT_DELETES_WATERMARK)).toBeNull()
  })

  it('holds the watermark when a tombstone timestamp cannot be parsed', async () => {
    mockListChatEventsSince.mockResolvedValue(
      events([
        { id: 'malformed', deletedAt: 'not-a-timestamp' },
        { id: 'gone', deletedAt },
      ]),
    )
    mockGetChat.mockResolvedValue(null)

    const result = await syncRemoteDeletions('test')

    // The parseable tombstone is still applied, but the pass must not
    // advance the watermark past the deletion it could not arbitrate.
    expect(result).toEqual({ reconciled: false, failed: false })
    expect(mockMarkAsDeleted).toHaveBeenCalledWith('gone')
    // The unarbitratable tombstone is still tracked so ingestion and the
    // gone-row restore path cannot resurrect the chat in the meantime.
    expect(mockMarkAsDeleted).toHaveBeenCalledWith('malformed')
    expect(localStorage.getItem(SYNC_CHAT_DELETES_WATERMARK)).toBeNull()
  })

  it('keeps a chat whose row was re-created after its tombstone and unblocks ingestion', async () => {
    mockListChatEventsSince.mockResolvedValue(
      events(
        [{ id: 'restored', deletedAt }],
        [{ id: 'restored', updatedAt: '2026-01-01T00:00:11.000Z' }],
      ),
    )

    const result = await syncRemoteDeletions('test')

    expect(mockGetChat).not.toHaveBeenCalled()
    expect(mockDeleteChatIfUnchanged).not.toHaveBeenCalled()
    expect(mockRemoveFromDeleted).toHaveBeenCalledWith('restored')
    expect(result).toEqual({ reconciled: true, failed: false })
  })

  it('reports failure without touching local rows when the tombstone fetch fails', async () => {
    mockListChatEventsSince.mockRejectedValue(new Error('network down'))

    const result = await syncRemoteDeletions('test')

    expect(result).toEqual({ reconciled: false, failed: true })
    expect(mockGetChat).not.toHaveBeenCalled()
    expect(localStorage.getItem(SYNC_CHAT_DELETES_WATERMARK)).toBeNull()
  })
})

describe('ingestRemoteChats', () => {
  it('carries the generation predicate into the queued storage write', async () => {
    const isCurrent = vi.fn(() => true)
    mockGetChat.mockResolvedValue(null)
    mockProcessRemoteChat.mockResolvedValue({
      chat: {
        id: 'remote-chat',
        title: 'Remote',
        messages: [{ role: 'user', content: 'hello' }],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        syncVersion: 3,
      },
    })
    mockApplyRemoteChatIfFresh.mockResolvedValue({ applied: true })

    await ingestRemoteChats(
      [
        {
          id: 'remote-chat',
          content: 'encoded',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          syncVersion: 3,
        },
      ],
      { isCurrent },
    )

    expect(mockApplyRemoteChatIfFresh).toHaveBeenCalledWith(
      expect.objectContaining({ isCurrent }),
    )
  })
})
