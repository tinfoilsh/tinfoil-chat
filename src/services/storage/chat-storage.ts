import type { Chat } from '@/components/chat/types'
import { logError, logInfo } from '@/utils/error-handling'
import { cloudSync } from '../cloud/cloud-sync'
import { encryptionService } from '../encryption/encryption-service'
import { indexedDBStorage, type Chat as StorageChat } from './indexed-db'
import { storageMigration } from './migration'

export class ChatStorageService {
  private initialized = false
  private initializePromise: Promise<void> | null = null

  async initialize(): Promise<void> {
    if (this.initialized) return

    // If initialization is already in progress, wait for it
    if (this.initializePromise) {
      return this.initializePromise
    }

    // Start initialization and store the promise
    this.initializePromise = this.doInitialize()

    try {
      await this.initializePromise
      this.initialized = true
    } catch (error) {
      // Reset on failure so initialization can be retried
      this.initializePromise = null
      throw error
    }
  }

  private async doInitialize(): Promise<void> {
    try {
      // Check if we need to migrate
      const needsMigration = await storageMigration.needsMigration()

      if (needsMigration) {
        const result = await storageMigration.migrate()

        if (result.success) {
          // Clean up legacy data after successful migration
          await storageMigration.cleanupLegacyData()

          // Store migration flag to trigger sync later when auth is ready
          if (result.migratedCount > 0) {
            logInfo(
              `Migration complete: ${result.migratedCount} chats migrated`,
              { component: 'ChatStorageService', action: 'migrate' },
            )
            // Store a flag to indicate migration just completed
            sessionStorage.setItem('pendingMigrationSync', 'true')
          }
        } else {
          logError('Migration failed', new Error(result.errors.join(', ')), {
            component: 'ChatStorageService',
            action: 'migrate',
          })
          throw new Error('Migration to IndexedDB failed')
        }
      }

      // Initialize IndexedDB
      await indexedDBStorage.initialize()

      // Initialize encryption (for cloud sync)
      await encryptionService.initialize()
    } catch (error) {
      logError('Failed to initialize chat storage', error, {
        component: 'ChatStorageService',
        action: 'initialize',
      })
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

    // Auto-backup to cloud (non-blocking)
    cloudSync.backupChat(chat.id).catch((error) => {
      logError('Failed to backup chat to cloud', error, {
        component: 'ChatStorageService',
        action: 'saveChat',
        metadata: { chatId: chat.id },
      })
    })
  }

  async getChat(id: string): Promise<Chat | null> {
    await this.initialize()

    const storedChat = await indexedDBStorage.getChat(id)
    if (!storedChat) return null

    // Convert StoredChat back to Chat, removing all sync metadata
    const {
      lastAccessedAt,
      syncedAt,
      locallyModified,
      syncVersion,
      decryptionFailed,
      encryptedData,
      updatedAt,
      model,
      version,
      ...baseChat
    } = storedChat
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
    // Convert StoredChat[] to Chat[], removing all sync metadata
    return storedChats.map(
      ({
        lastAccessedAt,
        syncedAt,
        locallyModified,
        syncVersion,
        decryptionFailed,
        encryptedData,
        updatedAt,
        model,
        version,
        ...baseChat
      }) => ({
        ...baseChat,
        createdAt: new Date(baseChat.createdAt),
      }),
    )
  }
}

export const chatStorage = new ChatStorageService()
