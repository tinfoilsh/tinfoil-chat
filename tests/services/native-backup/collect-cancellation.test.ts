import type { NativeBackupCollectionDependencies } from '@/services/native-backup'
import { collectNativeBackupV1 } from '@/services/native-backup'
import type { StoredChat } from '@/services/storage/indexed-db'

const timestamp = '2026-08-20T12:00:00.000Z'

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

function cloudChat(): StoredChat {
  return {
    id: 'chat',
    title: 'Chat',
    messages: [
      {
        role: 'user',
        content: 'image',
        timestamp: new Date(timestamp),
        attachments: Array.from({ length: 6 }, (_, index) => ({
          id: `image-${index}`,
          type: 'image' as const,
          fileName: `image-${index}.png`,
          encryptionKey: 'key',
        })),
      },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
    lastAccessedAt: 0,
    syncVersion: 1,
  }
}

describe('native backup collection cancellation', () => {
  it('does not start collection for an already-aborted signal', async () => {
    const controller = new AbortController()
    const reason = new DOMException('Canceled', 'AbortError')
    const isAuthenticated = vi.fn().mockResolvedValue(true)
    controller.abort(reason)

    await expect(
      collectNativeBackupV1(
        dependencies({ isAuthenticated }),
        controller.signal,
      ),
    ).rejects.toBe(reason)
    expect(isAuthenticated).not.toHaveBeenCalled()
  })

  it('stops immediately when the one-shot inventory request aborts', async () => {
    const controller = new AbortController()
    const reason = new DOMException('Canceled', 'AbortError')
    const getCloudChat = vi.fn()
    const getCloudInventory = vi.fn().mockImplementation(async () => {
      controller.abort(reason)
      return { captured_at: timestamp, total_items: 0, items: [] }
    })

    await expect(
      collectNativeBackupV1(
        dependencies({ getCloudInventory, getCloudChat }),
        controller.signal,
      ),
    ).rejects.toBe(reason)
    expect(getCloudInventory).toHaveBeenCalledTimes(1)
    expect(getCloudChat).not.toHaveBeenCalled()
  })

  it('does not read later projects after a project read aborts', async () => {
    const controller = new AbortController()
    const reason = new DOMException('Canceled', 'AbortError')
    const getProject = vi.fn().mockImplementation(async () => {
      controller.abort(reason)
      return null
    })
    const projects = Array.from({ length: 8 }, (_, index) => ({
      id: `project-${index}`,
      scope: 'project' as const,
      etag: 'etag',
      created_at: timestamp,
      updated_at: timestamp,
    }))

    await expect(
      collectNativeBackupV1(
        dependencies({
          getCloudInventory: async () => ({
            captured_at: timestamp,
            total_items: projects.length,
            items: projects,
          }),
          getProject,
        }),
        controller.signal,
      ),
    ).rejects.toBe(reason)
    expect(getProject).toHaveBeenCalledTimes(1)
    expect(getProject).toHaveBeenCalledWith('project-0', 'etag')
  })

  it('stops image reads and never returns partial input after abort', async () => {
    const controller = new AbortController()
    const reason = new DOMException('Canceled', 'AbortError')
    const chat = cloudChat()
    const getCloudImage = vi.fn().mockImplementation(async () => {
      controller.abort(reason)
      return new Uint8Array([1])
    })
    const getCloudChat = vi.fn().mockResolvedValue(chat)

    await expect(
      collectNativeBackupV1(
        dependencies({
          getCloudInventory: async () => ({
            captured_at: timestamp,
            total_items: 1,
            items: [
              {
                scope: 'chat',
                id: chat.id,
                etag: 'etag',
                created_at: timestamp,
                updated_at: timestamp,
              },
            ],
          }),
          getCloudChat,
          getCloudImage,
        }),
        controller.signal,
      ),
    ).rejects.toBe(reason)
    expect(getCloudImage).toHaveBeenCalledTimes(1)
    expect(getCloudChat).toHaveBeenCalledTimes(1)
  })
})
