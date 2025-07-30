import type { Chat } from '@/components/chat/types'
import { logError, logInfo, logWarning } from '@/utils/error-handling'
import { cloudSync } from '../cloud/cloud-sync'
import { r2Storage } from '../cloud/r2-storage'
import { encryptionService } from '../encryption/encryption-service'
import { indexedDBStorage, type Chat as StorageChat } from './indexed-db'
import { storageMigration } from './migration'
import { migrationEvents } from './migration-events'

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

            // Emit migration event
            migrationEvents.emit({
              type: 'migration-completed',
              migratedCount: result.migratedCount,
            })
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

    // Only try to get server ID if chat still has temporary ID
    // (initial attempt in createNewChat may have failed)
    if (chat.hasTemporaryId) {
      try {
        const serverId = await r2Storage.generateConversationId()
        if (serverId) {
          // Delete any existing chat with temporary ID
          try {
            await indexedDBStorage.deleteChat(chat.id)
          } catch (error) {
            // Ignore - chat might not exist yet
          }

          // Save with server ID
          const chatWithServerId = {
            ...chat,
            id: serverId.conversationId,
            hasTemporaryId: false,
          }

          const storageChat: StorageChat = {
            ...chatWithServerId,
            createdAt:
              chatWithServerId.createdAt instanceof Date
                ? chatWithServerId.createdAt.toISOString()
                : chatWithServerId.createdAt,
            updatedAt: new Date().toISOString(),
          }
          await indexedDBStorage.saveChat(storageChat)

          // Backup to cloud
          cloudSync.backupChat(chatWithServerId.id).catch((error) => {
            logError('Failed to backup chat to cloud', error, {
              component: 'ChatStorageService',
              action: 'saveChat',
              metadata: { chatId: chatWithServerId.id },
            })
          })

          logInfo('Saved chat with server ID', {
            component: 'ChatStorageService',
            action: 'saveChat',
            metadata: {
              oldId: chat.id,
              newId: serverId.conversationId,
            },
          })
          return
        }
      } catch (error) {
        logWarning(
          'Failed to get server ID during save, keeping temporary ID',
          {
            component: 'ChatStorageService',
            action: 'saveChat',
            metadata: { error, chatId: chat.id },
          },
        )
      }
    }

    // Normal save (either has server ID or keeping temporary ID)
    const storageChat: StorageChat = {
      ...chat,
      createdAt:
        chat.createdAt instanceof Date
          ? chat.createdAt.toISOString()
          : chat.createdAt,
      updatedAt: new Date().toISOString(),
    }
    await indexedDBStorage.saveChat(storageChat)

    // Auto-backup to cloud (non-blocking) - only if not temporary
    if (!chat.hasTemporaryId) {
      cloudSync.backupChat(chat.id).catch((error) => {
        logError('Failed to backup chat to cloud', error, {
          component: 'ChatStorageService',
          action: 'saveChat',
          metadata: { chatId: chat.id },
        })
      })
    }
  }

  async saveChatAndSync(chat: Chat): Promise<void> {
    // Just use the regular saveChat method
    await this.saveChat(chat)
  }

  async getChat(id: string): Promise<Chat | null> {
    await this.initialize()

    const storedChat = await indexedDBStorage.getChat(id)
    if (!storedChat) return null

    // Convert StoredChat back to Chat, keeping syncedAt for UI display
    const {
      lastAccessedAt,
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
      syncedAt: storedChat.syncedAt,
    }
  }

  async deleteChat(id: string): Promise<void> {
    await this.initialize()
    await indexedDBStorage.deleteChat(id)

    // Also delete from cloud storage (non-blocking)
    cloudSync.deleteFromCloud(id).catch((error: unknown) => {
      logError('Failed to delete chat from cloud', error, {
        component: 'ChatStorageService',
        action: 'deleteChat',
        metadata: { chatId: id },
      })
    })
  }

  async getAllChats(): Promise<Chat[]> {
    await this.initialize()

    const storedChats = await indexedDBStorage.getAllChats()
    // Convert StoredChat[] to Chat[], keeping syncedAt for UI display
    return storedChats.map(
      ({
        lastAccessedAt,
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
        syncedAt: baseChat.syncedAt,
      }),
    )
  }

  async getAllChatsWithSyncStatus(): Promise<Chat[]> {
    await this.initialize()

    const storedChats = await indexedDBStorage.getAllChats()
    // Convert StoredChat[] to Chat[] but preserve sync metadata
    return storedChats.map(
      ({
        lastAccessedAt,
        syncVersion,
        encryptedData,
        updatedAt,
        model,
        version,
        ...chatWithSyncData
      }) => ({
        ...chatWithSyncData,
        createdAt: new Date(chatWithSyncData.createdAt),
      }),
    )
  }
}

export const chatStorage = new ChatStorageService()
