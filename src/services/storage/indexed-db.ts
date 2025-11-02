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
  dataCorrupted?: boolean // True if data appears to be corrupted (e.g., compressed with wrong key)
  encryptedData?: string
  version?: number // Storage format version
  loadedAt?: number // Timestamp when chat was loaded from pagination
  isLocalOnly?: boolean // True if chat should never be synced to cloud (created when sync was disabled)
}

const DB_NAME = 'tinfoil-chat'
export const DB_VERSION = 1
const CHATS_STORE = 'chats'

export class IndexedDBStorage {
  private db: IDBDatabase | null = null
  private saveQueue: Promise<void> = Promise.resolve()

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
    // Queue saves to prevent concurrent writes from racing
    this.saveQueue = this.saveQueue.then(() => this.saveChatInternal(chat))
    return this.saveQueue
  }

  private async saveChatInternal(chat: Chat): Promise<void> {
    const db = await this.ensureDB()

    // Don't save blank chats to IndexedDB
    // Blank chats are new chats that haven't been used yet
    if ((chat as any).isBlankChat === true) {
      logWarning('Attempted to save blank chat to IndexedDB, skipping', {
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
          // Mark as locally modified if:
          // 1. It's explicitly set in the incoming chat
          // 2. OR it was already locally modified and not being updated from sync
          // 3. OR the content has changed (different message count or updated timestamp)
          locallyModified:
            (chat as StoredChat).locallyModified !== undefined
              ? (chat as StoredChat).locallyModified
              : existingChat
                ? existingChat.messages.length !== messagesForStorage.length ||
                  existingChat.updatedAt !== chat.updatedAt
                : true,
          syncVersion:
            existingChat?.syncVersion ?? (chat as StoredChat).syncVersion,
          decryptionFailed: (chat as StoredChat).decryptionFailed,
          dataCorrupted: (chat as StoredChat).dataCorrupted,
          encryptedData: (chat as StoredChat).encryptedData,
          version: 1, // Current storage format version
          loadedAt:
            (chat as StoredChat).loadedAt ??
            existingChat?.loadedAt ??
            undefined,
          // Explicitly preserve local-only flag
          isLocalOnly:
            (chat as any).isLocalOnly ?? existingChat?.isLocalOnly ?? false,
        }

        const putRequest = store.put(storedChat)

        // Wait for transaction to complete, not just the put operation
        transaction.oncomplete = () => {
          resolve()
        }

        transaction.onerror = () => {
          reject(new Error('Failed to save chat'))
        }

        putRequest.onerror = () => {
          reject(new Error('Failed to save chat'))
        }
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

  async deleteAllNonLocalChats(): Promise<number> {
    const db = await this.ensureDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CHATS_STORE], 'readwrite')
      const store = transaction.objectStore(CHATS_STORE)
      const request = store.openCursor()
      let deletedCount = 0

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          const chat = cursor.value as StoredChat
          if (!chat.isLocalOnly) {
            cursor.delete()
            deletedCount++
          }
          cursor.continue()
        } else {
          resolve(deletedCount)
        }
      }

      request.onerror = () =>
        reject(new Error('Failed to delete non-local chats'))
    })
  }

  async getAllChats(): Promise<StoredChat[]> {
    const db = await this.ensureDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CHATS_STORE], 'readonly')
      const store = transaction.objectStore(CHATS_STORE)
      // Sort by ID (primary key) which contains reverse timestamp
      const request = store.openCursor(null, 'next') // Ascending order on reverse timestamp = most recent first

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
