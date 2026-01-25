import type { Chat } from '@/components/chat/types'
import { isCloudSyncEnabled } from '@/utils/cloud-sync-settings'
import { logError, logInfo } from '@/utils/error-handling'
import { cloudSync } from '../cloud/cloud-sync'
import { streamingTracker } from '../cloud/streaming-tracker'
import { encryptionService } from '../encryption/encryption-service'
import { chatEvents } from './chat-events'
import { deletedChatsTracker } from './deleted-chats-tracker'
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

  async saveChat(chat: Chat, skipCloudSync = false): Promise<Chat> {
    await this.initialize()

    // Never save blank chats to storage
    if (chat.isBlankChat) {
      return chat
    }

    const chatToSave = chat

    // Check if this is a new chat (first time saving) and mark as local if intended or sync is disabled
    const existingChat = await indexedDBStorage.getChat(chatToSave.id)

    // Check if chat should be local-only
    // 1. If it's already marked as local
    // 2. If cloud sync is disabled globally
    // 3. If the existing chat is already local
    const shouldMarkAsLocal =
      chatToSave.isLocalOnly ||
      !isCloudSyncEnabled() ||
      existingChat?.isLocalOnly

    // Save the chat
    const storageChat: StorageChat = {
      ...chatToSave,
      createdAt:
        chatToSave.createdAt instanceof Date
          ? chatToSave.createdAt.toISOString()
          : chatToSave.createdAt,
      updatedAt: new Date().toISOString(),
      isLocalOnly: shouldMarkAsLocal || (existingChat?.isLocalOnly ?? false),
    }

    await indexedDBStorage.saveChat(storageChat)

    // Emit change event after local save
    chatEvents.emit({ reason: 'save', ids: [chatToSave.id] })

    // Auto-backup to cloud (non-blocking)
    // only if:
    // - not skipped
    // - not streaming
    // - not local-only
    if (
      !skipCloudSync &&
      !streamingTracker.isStreaming(chatToSave.id) &&
      !storageChat.isLocalOnly
    ) {
      cloudSync.backupChat(chatToSave.id).catch((error) => {
        logError('Failed to backup chat to cloud', error, {
          component: 'ChatStorageService',
          action: 'saveChat',
          metadata: { chatId: chatToSave.id },
        })
      })
    }

    return {
      ...chatToSave,
      isLocalOnly: storageChat.isLocalOnly,
      createdAt:
        chatToSave.createdAt instanceof Date
          ? chatToSave.createdAt
          : new Date(chatToSave.createdAt),
    }
  }

  async saveChatAndSync(chat: Chat): Promise<Chat> {
    // Just use the regular saveChat method with sync enabled
    return await this.saveChat(chat, false)
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

    // Mark as deleted to prevent re-sync
    deletedChatsTracker.markAsDeleted(id)

    await indexedDBStorage.deleteChat(id)
    chatEvents.emit({ reason: 'delete', ids: [id] })

    // Also delete from cloud storage (non-blocking)
    cloudSync.deleteFromCloud(id).catch((error: unknown) => {
      logError('Failed to delete chat from cloud', error, {
        component: 'ChatStorageService',
        action: 'deleteChat',
        metadata: { chatId: id },
      })
    })
  }

  async deleteAllNonLocalChats(): Promise<number> {
    await this.initialize()

    const deletedCount = await indexedDBStorage.deleteAllNonLocalChats()

    if (deletedCount > 0) {
      chatEvents.emit({ reason: 'delete', ids: [] })
      logInfo(`Deleted ${deletedCount} non-local chats`, {
        component: 'ChatStorageService',
        action: 'deleteAllNonLocalChats',
      })
    }

    return deletedCount
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

  async convertChatToCloud(chatId: string): Promise<string> {
    await this.initialize()

    // Clone the chat with a new ID and fresh timestamps so it appears at the top
    const newChatId = await indexedDBStorage.cloneChatWithNewId(chatId)
    if (!newChatId) {
      throw new Error('Failed to clone chat for cloud conversion')
    }

    // Mark as cloud chat (not local-only)
    await indexedDBStorage.updateChatLocalOnly(newChatId, false)

    // Emit event immediately so UI reflects the local change
    chatEvents.emit({ reason: 'save', ids: [newChatId] })

    // Trigger cloud backup (failure shouldn't hide the local chat)
    await cloudSync.backupChat(newChatId)

    return newChatId
  }

  async convertChatToLocal(chatId: string): Promise<void> {
    await this.initialize()

    // Update local storage to mark as local-only
    await indexedDBStorage.updateChatLocalOnly(chatId, true)

    // Emit event immediately so UI reflects the local change
    chatEvents.emit({ reason: 'save', ids: [chatId] })

    // Delete from cloud (failure shouldn't affect local state)
    await cloudSync.deleteFromCloud(chatId)
  }
}

export const chatStorage = new ChatStorageService()
