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
    listChats: async () => ({ items: [] }),
    getCloudChat: async () => null,
    getCloudImage: async () => null,
    listProjects: async () => ({ items: [] }),
    getProject: async () => null,
    listDocuments: async () => [],
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

  it('stops pagination immediately after an awaited page aborts', async () => {
    const controller = new AbortController()
    const reason = new DOMException('Canceled', 'AbortError')
    const getCloudChat = vi.fn()
    const listChats = vi.fn().mockImplementation(async () => {
      controller.abort(reason)
      return { items: [], next: 'another-page' }
    })

    await expect(
      collectNativeBackupV1(
        dependencies({ listChats, getCloudChat }),
        controller.signal,
      ),
    ).rejects.toBe(reason)
    expect(listChats).toHaveBeenCalledTimes(1)
    expect(getCloudChat).not.toHaveBeenCalled()
  })

  it('does not schedule more bounded document workers after abort', async () => {
    const controller = new AbortController()
    const reason = new DOMException('Canceled', 'AbortError')
    const getProject = vi.fn()
    const listDocuments = vi.fn().mockImplementation(async () => {
      controller.abort(reason)
      return []
    })
    const projects = Array.from({ length: 8 }, (_, index) => ({
      id: `project-${index}`,
      syncVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    }))

    await expect(
      collectNativeBackupV1(
        dependencies({
          listProjects: async () => ({ items: projects }),
          listDocuments,
          getProject,
        }),
        controller.signal,
      ),
    ).rejects.toBe(reason)
    expect(listDocuments).toHaveBeenCalledTimes(1)
    expect(listDocuments).toHaveBeenCalledWith('project-0')
    expect(getProject).not.toHaveBeenCalled()
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
          listChats: async () => ({
            items: [{ id: chat.id, syncVersion: 1 }],
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
