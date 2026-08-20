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
  it('preflights aggregate record counts before returning input', async () => {
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
})
