import type { Chat } from '@/components/chat/types'
import { indexedDBStorage, type Chat as StorageChat } from './indexed-db'
import { storageMigration } from './migration'

export class ChatStorageService {
  private initialized = false

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
          throw new Error('Migration to IndexedDB failed')
        }
      }

      // Initialize IndexedDB
      await indexedDBStorage.initialize()
      this.initialized = true
    } catch (error) {
      console.error('Failed to initialize chat storage:', error)
      throw error
    }
  }

  async saveChat(chat: Chat): Promise<void> {
    await this.initialize()

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

  async getChat(id: string): Promise<Chat | null> {
    await this.initialize()

    const storedChat = await indexedDBStorage.getChat(id)
    if (!storedChat) return null

    // Convert StoredChat back to Chat
    const { lastAccessedAt, updatedAt, model, ...baseChat } = storedChat
    return {
      ...baseChat,
      createdAt: new Date(storedChat.createdAt),
    }
  }

  async deleteChat(id: string): Promise<void> {
    await this.initialize()
    await indexedDBStorage.deleteChat(id)
  }

  async getAllChats(): Promise<Chat[]> {
    await this.initialize()

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

export const chatStorage = new ChatStorageService()
