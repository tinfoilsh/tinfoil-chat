import { ingestRemoteChats } from '@/services/cloud/chat-ingestion'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getChat, applyRemoteChatIfFresh, processRemoteChat, emit } = vi.hoisted(
  () => ({
    getChat: vi.fn(),
    applyRemoteChatIfFresh: vi.fn(),
    processRemoteChat: vi.fn(),
    emit: vi.fn(),
  }),
)

vi.mock('@/services/storage/indexed-db', () => ({
  indexedDBStorage: { getChat, applyRemoteChatIfFresh },
}))
vi.mock('@/services/cloud/chat-codec', () => ({ processRemoteChat }))
vi.mock('@/services/storage/chat-events', () => ({ chatEvents: { emit } }))
vi.mock('@/services/cloud/cloud-storage', () => ({
  cloudStorage: { fetchRawChatContent: vi.fn() },
}))

describe('ingestRemoteChats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getChat.mockResolvedValue(null)
    processRemoteChat.mockResolvedValue({
      chat: { id: 'chat-1', messages: [], syncVersion: 2 },
    })
    applyRemoteChatIfFresh.mockResolvedValue({ applied: true })
  })

  it('durably applies decoded content and emits its saved ID', async () => {
    const result = await ingestRemoteChats([
      { id: 'chat-1', content: '{}', syncVersion: 2 },
    ])

    expect(result).toEqual({
      savedIds: ['chat-1'],
      downloaded: 1,
      errors: [],
    })
    expect(applyRemoteChatIfFresh).toHaveBeenCalledWith(
      expect.objectContaining({
        syncVersion: 2,
        expectedLocalUpdatedAt: null,
      }),
    )
    expect(emit).toHaveBeenCalledWith({ reason: 'sync', ids: ['chat-1'] })
  })
})
