import type { Chat } from '@/components/chat/types'
import { indexedDBStorage, type Chat as StorageChat } from './indexed-db'
import { storageMigration } from './migration'

const CHATS_STORAGE_KEY = 'chats' // Current localStorage key used by the app

export class ChatStorageService {
  private initialized = false
  private useLegacyStorage = false

  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      // Check if we need to migrate
      const needsMigration = await storageMigration.needsMigration()

      if (needsMigration) {
        const result = await storageMigration.migrate()

        if (result.success) {
          // Clean up legacy data after successful migration
          await storageMigration.cleanupLegacyData()
        } else {
          console.error('Migration failed:', result.errors)
          // Fall back to legacy storage if migration failed
          this.useLegacyStorage = true
        }
      }

      // Initialize IndexedDB if not using legacy storage
      if (!this.useLegacyStorage) {
        await indexedDBStorage.initialize()
      }

      this.initialized = true
    } catch (error) {
      console.error('Failed to initialize chat storage:', error)
      // Fall back to legacy storage
      this.useLegacyStorage = true
      this.initialized = true
    }
  }

  async saveChat(chat: Chat): Promise<void> {
    await this.initialize()

    if (this.useLegacyStorage) {
      this.saveChatToLocalStorage(chat)
    } else {
      // Convert Chat type to storage format
      const storageChat: StorageChat = {
        ...chat,
        createdAt:
          chat.createdAt instanceof Date
            ? chat.createdAt.toISOString()
            : chat.createdAt,
        updatedAt: new Date().toISOString(),
      }
      await indexedDBStorage.saveChat(storageChat)
    }
  }

  async getChat(id: string): Promise<Chat | null> {
    await this.initialize()

    if (this.useLegacyStorage) {
      return this.getChatFromLocalStorage(id)
    } else {
      const storedChat = await indexedDBStorage.getChat(id)
      if (!storedChat) return null

      // Convert StoredChat back to Chat
      const { lastAccessedAt, updatedAt, model, ...baseChat } = storedChat
      return {
        ...baseChat,
        createdAt: new Date(storedChat.createdAt),
      }
    }
  }

  async deleteChat(id: string): Promise<void> {
    await this.initialize()

    if (this.useLegacyStorage) {
      this.deleteChatFromLocalStorage(id)
    } else {
      await indexedDBStorage.deleteChat(id)
    }
  }

  async getAllChats(): Promise<Chat[]> {
    await this.initialize()

    if (this.useLegacyStorage) {
      return this.getAllChatsFromLocalStorage()
    } else {
      const storedChats = await indexedDBStorage.getAllChats()
      // Convert StoredChat[] to Chat[]
      return storedChats.map(
        ({ lastAccessedAt, updatedAt, model, ...baseChat }) => ({
          ...baseChat,
          createdAt: new Date(baseChat.createdAt),
        }),
      )
    }
  }

  // Legacy localStorage methods
  private saveChatToLocalStorage(chat: Chat): void {
    const chats = this.getAllChatsFromLocalStorage()
    const index = chats.findIndex((c) => c.id === chat.id)

    if (index >= 0) {
      chats[index] = chat
    } else {
      chats.unshift(chat)
    }

    localStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(chats))
  }

  private getChatFromLocalStorage(id: string): Chat | null {
    const chats = this.getAllChatsFromLocalStorage()
    return chats.find((chat) => chat.id === id) || null
  }

  private deleteChatFromLocalStorage(id: string): void {
    const chats = this.getAllChatsFromLocalStorage()
    const filtered = chats.filter((chat) => chat.id !== id)
    localStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(filtered))
  }

  private getAllChatsFromLocalStorage(): Chat[] {
    try {
      const stored = localStorage.getItem(CHATS_STORAGE_KEY)
      if (!stored) return []

      const parsed = JSON.parse(stored)
      if (!Array.isArray(parsed)) return []

      // Convert legacy format to current Chat type
      return parsed.map((chat) => ({
        ...chat,
        createdAt: new Date(chat.createdAt),
        messages: chat.messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp || new Date()),
        })),
      }))
    } catch (error) {
      console.error('Failed to parse localStorage chats:', error)
      return []
    }
  }
}

export const chatStorage = new ChatStorageService()
