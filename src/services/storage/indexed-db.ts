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
}

const DB_NAME = 'tinfoil-chat'
const DB_VERSION = 1
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

    // Get existing chat to preserve sync metadata
    let existingChat: StoredChat | null = null
    try {
      existingChat = await this.getChatInternal(chat.id)
    } catch (error) {
      // Log database errors but continue with save operation
      logError('Database error while retrieving existing chat', error, {
        component: 'IndexedDBStorage',
      })
      // existingChat remains null, so sync metadata won't be preserved
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CHATS_STORE], 'readwrite')
      const store = transaction.objectStore(CHATS_STORE)

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
          existingChat?.locallyModified ?? (chat as StoredChat).locallyModified,
        syncVersion:
          existingChat?.syncVersion ?? (chat as StoredChat).syncVersion,
        decryptionFailed:
          existingChat?.decryptionFailed ??
          (chat as StoredChat).decryptionFailed,
        encryptedData:
          existingChat?.encryptedData ?? (chat as StoredChat).encryptedData,
      }

      const request = store.put(storedChat)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(new Error('Failed to save chat'))
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
      // Sort by ID which now contains reverse timestamp
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

  async getChatsWithEncryptedData(): Promise<StoredChat[]> {
    const allChats = await this.getAllChats()
    return allChats.filter(
      (chat) => chat.decryptionFailed && chat.encryptedData,
    )
  }
}

export const indexedDBStorage = new IndexedDBStorage()
