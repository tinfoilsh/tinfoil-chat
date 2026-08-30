import { CloudBackupReadError } from '@/services/cloud/backup-read-error'
import type { NativeBackupCollectionDependencies } from '@/services/native-backup/collect'
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
})
