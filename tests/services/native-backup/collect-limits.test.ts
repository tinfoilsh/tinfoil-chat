import { CloudBackupReadError } from '@/services/cloud/backup-read-error'
import {
  NativeBackupCollectionError,
  type NativeBackupCollectionDependencies,
} from '@/services/native-backup/collect'
import type { StoredChat } from '@/services/storage/indexed-db'
import type { BackupInventoryItem } from '@/services/sync-enclave/sync-api'

vi.mock('@/services/native-backup/constants', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/services/native-backup/constants')>()
  return {
    ...actual,
    NATIVE_BACKUP_LIMITS: {
      ...actual.NATIVE_BACKUP_LIMITS,
      messages: 1,
      attachments: 1,
      entries: 5,
      discoveredRecords: 2,
      omissions: 1,
    },
  }
})

const timestamp = '2026-08-20T12:00:00.000Z'
const cloudChat: StoredChat = {
  id: 'chat',
  title: 'Chat',
  messages: [
    { role: 'user', content: 'one', timestamp: new Date(timestamp) },
    { role: 'assistant', content: 'two', timestamp: new Date(timestamp) },
  ],
  createdAt: timestamp,
  updatedAt: timestamp,
  lastAccessedAt: 0,
  syncVersion: 1,
}

function item(id: string): BackupInventoryItem {
  return {
    scope: 'chat',
    id,
    etag: 'opaque-etag',
    created_at: timestamp,
    updated_at: timestamp,
  }
}

function dependencies(
  overrides: Partial<NativeBackupCollectionDependencies> = {},
): NativeBackupCollectionDependencies {
  return {
    isAuthenticated: async () => true,
    activeUserId: () => 'user',
    requireUnlockedCek: () => {},
    getCloudInventory: async () => ({
      captured_at: timestamp,
      total_items: 0,
      items: [],
    }),
    getCloudChat: async () => null,
    getCloudImage: async () => null,
    getProject: async () => null,
    getDocument: async () => null,
    getLocalChats: async () => [],
    getLocalChat: async () => null,
    ...overrides,
  }
}

describe('native backup collection limits', () => {
  it('guards message counts before reading attachments', async () => {
    const { collectNativeBackupV2 } =
      await import('@/services/native-backup/collect')
    const getCloudImage = vi.fn()

    await expect(
      collectNativeBackupV2(
        dependencies({
          getCloudInventory: async () => ({
            captured_at: timestamp,
            total_items: 1,
            items: [item('chat')],
          }),
          getCloudChat: async () => cloudChat,
          getCloudImage,
        }),
      ),
    ).rejects.toThrow('message limit exceeded')
    expect(getCloudImage).not.toHaveBeenCalled()
  })

  it('bounds captured inventory before reading record contents', async () => {
    const { collectNativeBackupV2 } =
      await import('@/services/native-backup/collect')
    const getCloudChat = vi.fn()

    await expect(
      collectNativeBackupV2(
        dependencies({
          getCloudInventory: async () => ({
            captured_at: timestamp,
            total_items: 3,
            items: [item('chat-1'), item('chat-2'), item('chat-3')],
          }),
          getCloudChat,
        }),
      ),
    ).rejects.toThrow('discovered record limit exceeded')
    expect(getCloudChat).not.toHaveBeenCalled()
  })

  it('bounds structured omissions incrementally', async () => {
    const { collectNativeBackupV2 } =
      await import('@/services/native-backup/collect')
    const getCloudChat = vi.fn(async () => {
      throw new CloudBackupReadError(
        'item_invalid',
        'chat_payload_invalid',
        true,
      )
    })

    await expect(
      collectNativeBackupV2(
        dependencies({
          getCloudInventory: async () => ({
            captured_at: timestamp,
            total_items: 2,
            items: [item('chat-1'), item('chat-2')],
          }),
          getCloudChat,
        }),
      ),
    ).rejects.toThrow('omission limit exceeded')
    expect(getCloudChat).toHaveBeenCalledTimes(6)
  })

  it('recomputes partial chat limits after dropping an unavailable image', async () => {
    const { collectNativeBackupV2 } =
      await import('@/services/native-backup/collect')
    const source: StoredChat = {
      ...cloudChat,
      messages: [
        {
          role: 'user',
          content: 'images',
          timestamp: new Date(timestamp),
          attachments: [
            {
              id: 'available',
              type: 'image',
              fileName: 'available.png',
              encryptionKey: 'key',
            },
            {
              id: 'missing',
              type: 'image',
              fileName: 'missing.png',
              encryptionKey: 'key',
            },
          ],
        },
      ],
    }
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

    const result = await collectNativeBackupV2(
      dependencies({
        getCloudInventory: async () => ({
          captured_at: timestamp,
          total_items: 1,
          items: [item('chat')],
        }),
        getCloudChat: async () => source,
        getCloudImage: async ({ id }) => (id === 'available' ? png : null),
      }),
    )

    expect(result.cloudChats[0].messages[0].attachments).toHaveLength(1)
    expect(result.images).toHaveLength(1)
    expect(result.omissions).toHaveLength(1)
  })

  it('stops scheduling later downloads after an incremental limit failure', async () => {
    const { collectNativeBackupV2 } =
      await import('@/services/native-backup/collect')
    const attachmentIds = Array.from(
      { length: 8 },
      (_, index) => `image-${index}`,
    )
    const source: StoredChat = {
      ...cloudChat,
      messages: [
        {
          role: 'user',
          content: 'images',
          timestamp: new Date(timestamp),
          attachments: attachmentIds.map((id) => ({
            id,
            type: 'image' as const,
            fileName: `${id}.png`,
            encryptionKey: 'key',
          })),
        },
      ],
    }
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    let releaseEarlier!: (bytes: Uint8Array) => void
    const earlier = new Promise<Uint8Array>((resolve) => {
      releaseEarlier = resolve
    })
    let rejectLater!: (error: Error) => void
    const later = new Promise<Uint8Array>((_resolve, reject) => {
      rejectLater = reject
    })
    const failure = new NativeBackupCollectionError(
      'limits',
      'collection',
      'image budget exceeded',
    )
    const getCloudImage = vi.fn(({ id }: { id: string }) => {
      if (id === 'image-1') return later
      return earlier
    })

    const collection = collectNativeBackupV2(
      dependencies({
        getCloudInventory: async () => ({
          captured_at: timestamp,
          total_items: 1,
          items: [item('chat')],
        }),
        getCloudChat: async () => source,
        getCloudImage,
      }),
    )
    await vi.waitFor(() => expect(getCloudImage).toHaveBeenCalledTimes(4))
    rejectLater(failure)
    releaseEarlier(png)

    await expect(collection).rejects.toBe(failure)
    expect(getCloudImage.mock.calls.map(([{ id }]) => id)).toEqual(
      attachmentIds.slice(0, 4),
    )
  })
})
