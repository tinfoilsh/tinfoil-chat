import { CloudBackupReadError } from '@/services/cloud/backup-read-error'
import type { NativeBackupCollectionDependencies } from '@/services/native-backup/collect'
import type { StoredChat } from '@/services/storage/indexed-db'

vi.mock('@/services/native-backup/constants', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/services/native-backup/constants')>()
  return {
    ...actual,
    NATIVE_BACKUP_LIMITS: {
      ...actual.NATIVE_BACKUP_LIMITS,
      messages: 1,
      discoveredRecords: 2,
      omissions: 1,
    },
  }
})

const timestamp = '2026-08-20T12:00:00.000Z'
const localChat: StoredChat = {
  id: 'local',
  title: 'Local',
  messages: [
    {
      role: 'user',
      content: 'one',
      timestamp: new Date(timestamp),
      attachments: [
        {
          id: 'image',
          type: 'image',
          fileName: 'image.png',
          encryptionKey: 'key',
        },
      ],
    },
    { role: 'assistant', content: 'two', timestamp: new Date(timestamp) },
  ],
  createdAt: timestamp,
  updatedAt: timestamp,
  lastAccessedAt: 0,
  syncVersion: 1,
}

describe('native backup collection limits', () => {
  it('guards message counts before reading attachments', async () => {
    const { collectNativeBackupV1 } =
      await import('@/services/native-backup/collect')
    const getCloudImage = vi.fn().mockResolvedValue(new Uint8Array([1]))
    const dependencies: NativeBackupCollectionDependencies = {
      isAuthenticated: async () => true,
      activeUserId: () => 'user',
      requireUnlockedCek: () => {},
      listChats: async () => ({
        items: [{ id: localChat.id, syncVersion: 1 }],
      }),
      getCloudChat: async () => localChat,
      getCloudImage,
      listProjects: async () => ({ items: [] }),
      getProject: async () => null,
      listDocuments: async () => [],
      getDocument: async () => null,
      getLocalChats: async () => [],
      getLocalChat: async () => null,
    }

    await expect(collectNativeBackupV1(dependencies)).rejects.toThrow(
      'message limit exceeded',
    )
    expect(getCloudImage).not.toHaveBeenCalled()
  })

  it('bounds discovered records before reading record contents', async () => {
    const { collectNativeBackupV2 } =
      await import('@/services/native-backup/collect')
    const getCloudChat = vi.fn()
    const dependencies: NativeBackupCollectionDependencies = {
      isAuthenticated: async () => true,
      activeUserId: () => 'user',
      requireUnlockedCek: () => {},
      listChats: async () => ({
        items: [1, 2, 3].map((index) => ({
          id: `chat-${index}`,
          syncVersion: 1,
        })),
      }),
      getCloudChat,
      getCloudImage: async () => null,
      listProjects: async () => ({ items: [] }),
      getProject: async () => null,
      listDocuments: async () => [],
      getDocument: async () => null,
      getLocalChats: async () => [],
      getLocalChat: async () => null,
    }

    await expect(collectNativeBackupV2(dependencies)).rejects.toThrow(
      'discovered record limit exceeded',
    )
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
    const dependencies: NativeBackupCollectionDependencies = {
      isAuthenticated: async () => true,
      activeUserId: () => 'user',
      requireUnlockedCek: () => {},
      listChats: async () => ({
        items: [
          { id: 'chat-1', syncVersion: 1 },
          { id: 'chat-2', syncVersion: 1 },
        ],
      }),
      getCloudChat,
      getCloudImage: async () => null,
      listProjects: async () => ({ items: [] }),
      getProject: async () => null,
      listDocuments: async () => [],
      getDocument: async () => null,
      getLocalChats: async () => [],
      getLocalChat: async () => null,
    }

    await expect(collectNativeBackupV2(dependencies)).rejects.toThrow(
      'omission limit exceeded',
    )
    expect(getCloudChat).toHaveBeenCalledTimes(6)
  })
})
