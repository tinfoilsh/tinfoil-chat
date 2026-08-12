import {
  DB_NAME,
  DB_VERSION,
  IndexedDBStorage,
  type StoredChat,
} from '@/services/storage/indexed-db'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'

function storedChat(
  id: string,
  overrides: Partial<StoredChat> = {},
): StoredChat {
  return {
    id,
    title: id,
    messages: [],
    createdAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
    lastAccessedAt: Date.now(),
    ...overrides,
  }
}

async function seedVersionThree(chats: StoredChat[]): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      const chatsStore = request.result.createObjectStore('chats', {
        keyPath: 'id',
      })
      chatsStore.createIndex('lastAccessedAt', 'lastAccessedAt')
      chatsStore.createIndex('createdAt', 'createdAt')
      chatsStore.createIndex('syncedAt', 'syncedAt')
      chatsStore.createIndex('locallyModified', 'locallyModified')
      chatsStore.createIndex('projectId', 'projectId')
      const projectsStore = request.result.createObjectStore('projects', {
        keyPath: 'cacheKey',
      })
      projectsStore.createIndex('userId', 'userId')
    }
    request.onsuccess = () => resolve(request.result)
  })

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('chats', 'readwrite')
    const store = transaction.objectStore('chats')
    for (const chat of chats) store.put(chat)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  db.close()
}

describe('IndexedDB pending sync index', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: new IDBFactory(),
    })
  })

  it('migrates existing rows and queries only uploadable pending chats', async () => {
    await seedVersionThree([
      storedChat('dirty', { locallyModified: true, syncedAt: Date.now() }),
      storedChat('never-synced', { locallyModified: false }),
      storedChat('clean', { locallyModified: false, syncedAt: Date.now() }),
      storedChat('local', { locallyModified: true, isLocalOnly: true }),
      storedChat('undecryptable', {
        locallyModified: true,
        decryptionFailed: true,
      }),
    ])

    const storage = new IndexedDBStorage()
    const pending = await storage.getUnsyncedChats()

    expect(pending.map((chat) => chat.id).sort()).toEqual([
      'dirty',
      'never-synced',
    ])

    const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
    const indexNames = upgraded
      .transaction('chats')
      .objectStore('chats').indexNames
    expect(indexNames.contains('syncPending')).toBe(true)
    expect(indexNames.contains('locallyModified')).toBe(false)
    upgraded.close()
  })
})
