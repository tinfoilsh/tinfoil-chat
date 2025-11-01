import type { Chat } from '@/components/chat/types'
import { isCloudSyncEnabled } from '@/utils/cloud-sync-settings'
import { logError, logInfo } from '@/utils/error-handling'
import { cloudSync } from '../cloud/cloud-sync'
import { r2Storage } from '../cloud/r2-storage'
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
  private serverIdCache = new Map<string, string>() // Cache temp ID -> server ID mappings

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

    let chatToSave = chat

    // If this is the first save (has temporary ID), try to get server ID
    // Only for cloud chats (not local-only) and when cloud sync is enabled globally
    if (
      chat.hasTemporaryId &&
      isCloudSyncEnabled() &&
      !(chat as any).intendedLocalOnly
    ) {
      // Check if we already have a server ID for this temp ID
      const cachedServerId = this.serverIdCache.get(chat.id)

      if (cachedServerId) {
        // Use the cached server ID
        chatToSave = {
          ...chat,
          id: cachedServerId,
          hasTemporaryId: false,
        }
      } else {
        // Try to get a new server ID
        try {
          const result = await r2Storage.generateConversationId()
          if (result) {
            // Cache the mapping
            this.serverIdCache.set(chat.id, result.conversationId)

            // Update the chat with server ID
            chatToSave = {
              ...chat,
              id: result.conversationId,
              hasTemporaryId: false,
            }

            // Delete any existing chat with the temporary ID
            try {
              await indexedDBStorage.deleteChat(chat.id)
            } catch (error) {
              // Ignore - chat might not exist yet
            }

            logInfo('Replaced temporary ID with server ID on first save', {
              component: 'ChatStorageService',
              action: 'saveChat',
              metadata: {
                oldId: chat.id,
                newId: result.conversationId,
              },
            })
          }
        } catch (error) {
          logInfo('Failed to get server ID, keeping temporary ID', {
            component: 'ChatStorageService',
            action: 'saveChat',
            metadata: { error, chatId: chat.id },
          })
        }
      }
    }

    // Check if this is a new chat (first time saving) and mark as local if intended or sync is disabled
    const existingChat = await indexedDBStorage.getChat(chatToSave.id)
    const isNewChat = !existingChat
    const shouldMarkAsLocal =
      isNewChat &&
      ((chatToSave as any).intendedLocalOnly || !isCloudSyncEnabled())

    // For local-only chats, clear the temporary ID flag since they don't need a server ID
    if (shouldMarkAsLocal && chatToSave.hasTemporaryId) {
      chatToSave = {
        ...chatToSave,
        hasTemporaryId: false,
      }
    }

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

    // Auto-backup to cloud (non-blocking) - only if not temporary, not skipped, and not streaming
    if (
      !chatToSave.hasTemporaryId &&
      !skipCloudSync &&
      !streamingTracker.isStreaming(chatToSave.id)
    ) {
      cloudSync.backupChat(chatToSave.id).catch((error) => {
        logError('Failed to backup chat to cloud', error, {
          component: 'ChatStorageService',
          action: 'saveChat',
          metadata: { chatId: chatToSave.id },
        })
      })
    } else if (streamingTracker.isStreaming(chatToSave.id)) {
      logInfo('Skipping cloud sync for streaming chat', {
        component: 'ChatStorageService',
        action: 'saveChat',
        metadata: { chatId: chatToSave.id },
      })
    }

    // Return the potentially updated chat
    return {
      ...chatToSave,
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
}

export const chatStorage = new ChatStorageService()
