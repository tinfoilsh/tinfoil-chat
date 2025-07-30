import type { Chat as ChatType } from '@/components/chat/types'
import { logError, logWarning } from '@/utils/error-handling'

export interface Chat extends Omit<ChatType, 'createdAt'> {
  createdAt: string
  updatedAt: string
  model?: string
}

export interface StoredChat extends Chat {
  lastAccessedAt: number
  syncedAt?: number
  locallyModified?: boolean
  syncVersion?: number
  decryptionFailed?: boolean
  encryptedData?: string
  version?: number // Storage format version
}

const DB_NAME = 'tinfoil-chat'
export const DB_VERSION = 1
const CHATS_STORE = 'chats'

export class IndexedDBStorage {
  private db: IDBDatabase | null = null

  async initialize(): Promise<void> {
    // Check if IndexedDB is available
    if (typeof window === 'undefined' || !window.indexedDB) {
      throw new Error('IndexedDB not available')
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = (event) => {
        const error = (event.target as IDBOpenDBRequest).error
        logError('IndexedDB open error', error, {
          component: 'IndexedDBStorage',
        })
        reject(
          new Error(
            `Failed to open database: ${error?.message || 'Unknown error'}`,
          ),
        )
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        try {
          if (!db.objectStoreNames.contains(CHATS_STORE)) {
            const store = db.createObjectStore(CHATS_STORE, { keyPath: 'id' })
            store.createIndex('lastAccessedAt', 'lastAccessedAt', {
              unique: false,
            })
            store.createIndex('createdAt', 'createdAt', { unique: false })
            // Add index on id for sorting by reverse timestamp
            store.createIndex('id', 'id', { unique: true })
            // Add sync-related indexes
            store.createIndex('syncedAt', 'syncedAt', { unique: false })
            store.createIndex('locallyModified', 'locallyModified', {
              unique: false,
            })
          }
        } catch (error) {
          logError('Failed to create object store', error, {
            component: 'IndexedDBStorage',
          })
          reject(new Error(`Failed to upgrade database: ${error}`))
        }
      }

      request.onblocked = () => {
        logWarning('IndexedDB upgrade blocked - close other tabs', {
          component: 'IndexedDBStorage',
        })
        reject(new Error('Database upgrade blocked'))
      }
    })
  }

  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.initialize()
    }
    if (!this.db) {
      throw new Error('Database not initialized')
    }
    return this.db
  }

  async saveChat(chat: Chat): Promise<void> {
    const db = await this.ensureDB()

    // Don't save empty chats to IndexedDB
    // Empty chats should only exist in memory until they have messages
    if (!chat.messages || chat.messages.length === 0) {
      logWarning('Attempted to save empty chat to IndexedDB, skipping', {
        component: 'IndexedDBStorage',
        metadata: { chatId: chat.id },
      })
      return
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CHATS_STORE], 'readwrite')
      const store = transaction.objectStore(CHATS_STORE)

      // First, get the existing chat if it exists
      const getRequest = store.get(chat.id)

      getRequest.onsuccess = () => {
        const existingChat = getRequest.result as StoredChat | undefined

        // Convert Date timestamps to strings for storage
        const messagesForStorage = chat.messages.map((msg) => ({
          ...msg,
          timestamp:
            msg.timestamp instanceof Date
              ? msg.timestamp.toISOString()
              : msg.timestamp,
        }))

        const storedChat: StoredChat = {
          ...chat,
          messages: messagesForStorage as any, // Type assertion needed due to timestamp conversion
          lastAccessedAt: Date.now(),
          // Preserve sync metadata if it exists
          syncedAt: existingChat?.syncedAt ?? (chat as StoredChat).syncedAt,
          locallyModified:
            existingChat?.locallyModified ??
            (chat as StoredChat).locallyModified,
          syncVersion:
            existingChat?.syncVersion ?? (chat as StoredChat).syncVersion,
          decryptionFailed: (chat as StoredChat).decryptionFailed,
          encryptedData: (chat as StoredChat).encryptedData,
          version: 1, // Current storage format version
        }

        const putRequest = store.put(storedChat)
        putRequest.onsuccess = () => resolve()
        putRequest.onerror = () => reject(new Error('Failed to save chat'))
      }

      getRequest.onerror = () =>
        reject(new Error('Failed to check existing chat'))
    })
  }

  private async getChatInternal(id: string): Promise<StoredChat | null> {
    const db = await this.ensureDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CHATS_STORE], 'readonly')
      const store = transaction.objectStore(CHATS_STORE)
      const request = store.get(id)

      request.onsuccess = () => {
        const chat = request.result
        if (chat) {
          // Convert string timestamps back to Date objects
          chat.messages = chat.messages.map((msg: any) => ({
            ...msg,
            timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
          }))
        }
        resolve(chat || null)
      }
      request.onerror = () => reject(new Error('Failed to get chat'))
    })
  }

  async getChat(id: string): Promise<StoredChat | null> {
    const chat = await this.getChatInternal(id)
    if (chat) {
      // Update last accessed time
      this.updateLastAccessed(id).catch((error) =>
        logError('Failed to update last accessed time', error, {
          component: 'IndexedDBStorage',
          metadata: { chatId: id },
        }),
      )
    }
    return chat
  }

  async deleteChat(id: string): Promise<void> {
    const db = await this.ensureDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CHATS_STORE], 'readwrite')
      const store = transaction.objectStore(CHATS_STORE)
      const request = store.delete(id)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(new Error('Failed to delete chat'))
    })
  }

  async getAllChats(): Promise<StoredChat[]> {
    const db = await this.ensureDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CHATS_STORE], 'readonly')
      const store = transaction.objectStore(CHATS_STORE)
      // Sort by ID which contains reverse timestamp
      const index = store.index('id')
      const request = index.openCursor(null, 'next') // Ascending order on reverse timestamp = most recent first

      const chats: StoredChat[] = []

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          const chat = cursor.value
          // Convert string timestamps back to Date objects
          chat.messages = chat.messages.map((msg: any) => ({
            ...msg,
            timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
          }))
          chats.push(chat)
          cursor.continue()
        } else {
          resolve(chats)
        }
      }

      request.onerror = () => reject(new Error('Failed to get all chats'))
    })
  }

  async clearAll(): Promise<void> {
    const db = await this.ensureDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CHATS_STORE], 'readwrite')
      const store = transaction.objectStore(CHATS_STORE)
      const request = store.clear()

      request.onsuccess = () => resolve()
      request.onerror = () => reject(new Error('Failed to clear all chats'))
    })
  }

  private async updateLastAccessed(id: string): Promise<void> {
    const db = await this.ensureDB()
    const chat = await this.getChatInternal(id)

    if (chat) {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([CHATS_STORE], 'readwrite')
        const store = transaction.objectStore(CHATS_STORE)

        chat.lastAccessedAt = Date.now()
        const request = store.put(chat)

        request.onsuccess = () => resolve()
        request.onerror = () =>
          reject(new Error('Failed to update last accessed'))
      })
    }
  }

  async getUnsyncedChats(): Promise<StoredChat[]> {
    // Get all chats and filter for those that need syncing
    const allChats = await this.getAllChats()

    // Return chats that are either:
    // 1. Marked as locally modified
    // 2. Never synced (syncedAt is undefined/null)
    return allChats.filter(
      (chat) =>
        chat.locallyModified === true ||
        chat.syncedAt === undefined ||
        chat.syncedAt === null,
    )
  }

  async markAsSynced(id: string, syncVersion: number): Promise<void> {
    const db = await this.ensureDB()
    const chat = await this.getChatInternal(id)

    if (chat) {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([CHATS_STORE], 'readwrite')
        const store = transaction.objectStore(CHATS_STORE)

        chat.syncedAt = Date.now()
        chat.locallyModified = false
        chat.syncVersion = syncVersion

        const request = store.put(chat)

        request.onsuccess = () => resolve()
        request.onerror = () => reject(new Error('Failed to mark as synced'))
      })
    }
  }

  async getChatsWithEncryptedData(): Promise<StoredChat[]> {
    const allChats = await this.getAllChats()
    return allChats.filter(
      (chat) => chat.decryptionFailed && chat.encryptedData,
    )
  }
}

export const indexedDBStorage = new IndexedDBStorage()
