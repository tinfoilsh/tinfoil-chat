import { logError, logInfo } from '@/utils/error-handling'
import { encryptionService } from '../encryption/encryption-service'
import { indexedDBStorage, type StoredChat } from '../storage/indexed-db'
import { r2Storage } from './r2-storage'
import { streamingTracker } from './streaming-tracker'

export interface SyncResult {
  uploaded: number
  downloaded: number
  errors: string[]
}

export interface PaginatedChatsResult {
  chats: StoredChat[]
  hasMore: boolean
  nextToken?: string
}

export class CloudSyncService {
  private isSyncing = false
  private uploadQueue: Map<string, Promise<void>> = new Map()

  // Set token getter for API calls
  setTokenGetter(getToken: () => Promise<string | null>) {
    r2Storage.setTokenGetter(getToken)
  }

  // Backup a single chat to the cloud with rate limiting
  async backupChat(chatId: string): Promise<void> {
    // Don't attempt backup if not authenticated
    if (!(await r2Storage.isAuthenticated())) {
      return
    }

    // Check if there's already an upload in progress for this chat
    const existingUpload = this.uploadQueue.get(chatId)
    if (existingUpload) {
      return existingUpload
    }

    // Create the upload promise
    const uploadPromise = this.doBackupChat(chatId)
    this.uploadQueue.set(chatId, uploadPromise)

    // Clean up the queue when done
    uploadPromise.finally(() => {
      this.uploadQueue.delete(chatId)
    })

    return uploadPromise
  }

  private async doBackupChat(chatId: string): Promise<void> {
    try {
      // Check if chat is currently streaming
      if (streamingTracker.isStreaming(chatId)) {
        logInfo('Chat is streaming, registering for sync after stream ends', {
          component: 'CloudSync',
          action: 'backupChat',
          metadata: { chatId },
        })

        // Register to sync once streaming ends
        streamingTracker.onStreamEnd(chatId, () => {
          logInfo('Streaming ended, triggering delayed sync', {
            component: 'CloudSync',
            action: 'backupChat',
            metadata: { chatId },
          })
          // Re-trigger the backup after streaming ends
          this.backupChat(chatId).catch((error) => {
            logError('Failed to backup chat after streaming', error, {
              component: 'CloudSync',
              action: 'backupChat',
              metadata: { chatId },
            })
          })
        })

        return
      }

      const chat = await indexedDBStorage.getChat(chatId)
      if (!chat) {
        return // Chat might have been deleted
      }

      // Don't sync blank chats or chats with temporary IDs
      if ((chat as any).isBlankChat || (chat as any).hasTemporaryId) {
        logInfo('Skipping sync for blank or temporary chat', {
          component: 'CloudSync',
          action: 'backupChat',
          metadata: {
            chatId,
            isBlankChat: (chat as any).isBlankChat,
            hasTemporaryId: (chat as any).hasTemporaryId,
          },
        })
        return
      }

      // Double-check streaming status right before upload
      if (streamingTracker.isStreaming(chatId)) {
        logInfo('Chat started streaming during backup process, aborting sync', {
          component: 'CloudSync',
          action: 'backupChat',
          metadata: { chatId },
        })
        return
      }

      await r2Storage.uploadChat(chat)

      // Mark as synced with incremented version
      const newVersion = (chat.syncVersion || 0) + 1
      await indexedDBStorage.markAsSynced(chatId, newVersion)
    } catch (error) {
      // Silently fail if no auth token set
      if (
        error instanceof Error &&
        error.message.includes('Authentication token not set')
      ) {
        return
      }
      throw error
    }
  }

  // Backup all unsynced chats
  async backupUnsyncedChats(): Promise<SyncResult> {
    const result: SyncResult = {
      uploaded: 0,
      downloaded: 0,
      errors: [],
    }

    try {
      const unsyncedChats = await indexedDBStorage.getUnsyncedChats()

      // Debug logging
      logInfo(`Found unsynced chats: ${unsyncedChats.length}`, {
        component: 'CloudSync',
        action: 'backupUnsyncedChats',
      })

      // Filter out blank chats, chats with temporary IDs, and streaming chats
      const chatsToSync = unsyncedChats.filter(
        (chat) =>
          !(chat as any).isBlankChat &&
          !(chat as any).hasTemporaryId &&
          !streamingTracker.isStreaming(chat.id),
      )

      logInfo(`Chats with messages to sync: ${chatsToSync.length}`, {
        component: 'CloudSync',
        action: 'backupUnsyncedChats',
      })

      // Upload all chats in parallel for better performance
      const uploadPromises = chatsToSync.map(async (chat) => {
        try {
          // Skip if chat started streaming while in queue
          if (streamingTracker.isStreaming(chat.id)) {
            logInfo(`Skipping sync for chat ${chat.id} - started streaming`, {
              component: 'CloudSync',
              action: 'backupUnsyncedChats',
            })
            return
          }

          await r2Storage.uploadChat(chat)
          const newVersion = (chat.syncVersion || 0) + 1
          await indexedDBStorage.markAsSynced(chat.id, newVersion)
          result.uploaded++
        } catch (error) {
          result.errors.push(
            `Failed to backup chat ${chat.id}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      })

      await Promise.all(uploadPromises)
    } catch (error) {
      result.errors.push(
        `Failed to get unsynced chats: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    return result
  }

  // Sync all chats (upload local changes, download remote changes)
  async syncAllChats(): Promise<SyncResult> {
    if (this.isSyncing) {
      throw new Error('Sync already in progress')
    }

    this.isSyncing = true
    const result: SyncResult = {
      uploaded: 0,
      downloaded: 0,
      errors: [],
    }

    try {
      // First, backup any unsynced local changes
      const backupResult = await this.backupUnsyncedChats()
      result.uploaded = backupResult.uploaded
      result.errors.push(...backupResult.errors)

      // Then, get list of remote chats with content
      let remoteList
      try {
        // Only fetch first 10 chats during initial sync to match pagination
        remoteList = await r2Storage.listChats({
          includeContent: true,
          limit: 10,
        })
      } catch (error) {
        // Log the error but continue with sync
        logError('Failed to list remote chats', error, {
          component: 'CloudSync',
          action: 'syncAllChats',
        })
        this.isSyncing = false
        return result
      }

      const localChats = await indexedDBStorage.getAllChats()

      // Create maps for easy lookup
      const localChatMap = new Map(localChats.map((c) => [c.id, c]))
      // Handle null conversations array
      const remoteConversations = remoteList.conversations || []
      const remoteChatMap = new Map(remoteConversations.map((c) => [c.id, c]))

      // Process remote chats
      for (const remoteChat of remoteConversations) {
        const localChat = localChatMap.get(remoteChat.id)

        // Process if:
        // 1. Chat doesn't exist locally
        // 2. Remote is newer (based on updatedAt)
        // 3. Chat failed decryption (to retry with new key)
        const remoteTimestamp = Date.parse(remoteChat.updatedAt)
        const shouldProcess =
          !localChat ||
          (!isNaN(remoteTimestamp) &&
            remoteTimestamp > (localChat.syncedAt || 0)) ||
          (localChat as any).decryptionFailed === true

        if (shouldProcess && remoteChat.content) {
          try {
            const encrypted = JSON.parse(remoteChat.content)

            // Try to decrypt the chat data
            let downloadedChat: StoredChat | null = null
            try {
              await encryptionService.initialize()
              const decrypted = await encryptionService.decrypt(encrypted)
              downloadedChat = decrypted
            } catch (decryptError) {
              // If decryption fails, store the encrypted data for later retry
              downloadedChat = {
                id: remoteChat.id,
                title: 'Encrypted',
                messages: [],
                createdAt: remoteChat.createdAt,
                updatedAt: remoteChat.updatedAt,
                lastAccessedAt: Date.now(),
                decryptionFailed: true,
                encryptedData: remoteChat.content,
                syncedAt: Date.now(),
                locallyModified: false,
                syncVersion: 1,
              } as StoredChat
            }

            if (downloadedChat) {
              // Save all downloaded chats (including encrypted ones)
              // The isBlankChat check in IndexedDB will prevent blank chats from being saved
              await indexedDBStorage.saveChat(downloadedChat)
              await indexedDBStorage.markAsSynced(
                downloadedChat.id,
                downloadedChat.syncVersion || 0,
              )
              result.downloaded++
            }
          } catch (error) {
            result.errors.push(
              `Failed to process chat ${remoteChat.id}: ${error instanceof Error ? error.message : String(error)}`,
            )
          }
        }
      }

      // Delete local chats that were deleted remotely
      // First, sort all synced local chats by createdAt to determine their position
      const sortedSyncedLocalChats = localChats
        .filter(
          (chat) => chat.syncedAt && !chat.isBlankChat && !chat.hasTemporaryId,
        )
        .sort((a, b) => {
          const timeA = new Date(a.createdAt).getTime()
          const timeB = new Date(b.createdAt).getTime()
          return timeB - timeA // Descending (newest first)
        })

      // Only consider chats in the first 10 positions for deletion check
      const localChatsInFirstPage = sortedSyncedLocalChats.slice(0, 10)

      for (const localChat of localChatsInFirstPage) {
        if (!remoteChatMap.has(localChat.id)) {
          // This chat should be in the first page but isn't in remote - it was deleted
          try {
            await indexedDBStorage.deleteChat(localChat.id)
          } catch (error) {
            result.errors.push(
              `Failed to delete local chat ${localChat.id}: ${error instanceof Error ? error.message : String(error)}`,
            )
          }
        }
      }
    } catch (error) {
      result.errors.push(
        `Sync failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      this.isSyncing = false
    }

    return result
  }

  // Check if currently syncing
  get syncing(): boolean {
    return this.isSyncing
  }

  // Delete a chat from cloud storage
  async deleteFromCloud(chatId: string): Promise<void> {
    // Don't attempt deletion if not authenticated
    if (!(await r2Storage.isAuthenticated())) {
      return
    }

    try {
      await r2Storage.deleteChat(chatId)
    } catch (error) {
      // Silently fail if no auth token set
      if (
        error instanceof Error &&
        error.message.includes('Authentication token not set')
      ) {
        return
      }
      throw error
    }
  }

  // Load chats with pagination - combines local and remote chats
  async loadChatsWithPagination(options: {
    limit: number
    continuationToken?: string
    loadLocal?: boolean
  }): Promise<PaginatedChatsResult> {
    const { limit, continuationToken, loadLocal = true } = options

    // If no authentication, just return local chats
    if (!(await r2Storage.isAuthenticated())) {
      if (loadLocal) {
        const localChats = await indexedDBStorage.getAllChats()
        const sortedChats = localChats.sort((a, b) => {
          const timeA = new Date(a.createdAt).getTime()
          const timeB = new Date(b.createdAt).getTime()
          return timeB - timeA
        })

        const start = continuationToken ? parseInt(continuationToken, 10) : 0
        const paginatedChats = sortedChats.slice(start, start + limit)

        return {
          chats: paginatedChats,
          hasMore: start + limit < sortedChats.length,
          nextToken:
            start + limit < sortedChats.length
              ? (start + limit).toString()
              : undefined,
        }
      }
      return { chats: [], hasMore: false }
    }

    try {
      // For authenticated users, load from R2 with content
      const remoteList = await r2Storage.listChats({
        limit,
        continuationToken,
        includeContent: true,
      })

      // Process the chat data from each remote chat
      const downloadedChats: StoredChat[] = []
      for (const remoteChat of remoteList.conversations || []) {
        if (!remoteChat.content) continue

        try {
          const encrypted = JSON.parse(remoteChat.content)

          // Try to decrypt the chat data
          let chat: StoredChat | null = null
          try {
            await encryptionService.initialize()
            const decrypted = await encryptionService.decrypt(encrypted)
            chat = decrypted
          } catch (decryptError) {
            // If decryption fails, store the encrypted data for later retry
            chat = {
              id: remoteChat.id,
              title: 'Encrypted',
              messages: [],
              createdAt: remoteChat.createdAt,
              updatedAt: remoteChat.updatedAt,
              lastAccessedAt: Date.now(),
              decryptionFailed: true,
              encryptedData: remoteChat.content,
              syncedAt: Date.now(),
              locallyModified: false,
              syncVersion: 1,
            } as StoredChat
          }

          if (chat) {
            downloadedChats.push(chat)
          }
        } catch (error) {
          logError(`Failed to process chat ${remoteChat.id}`, error, {
            component: 'CloudSync',
            action: 'loadChatsWithPagination',
          })
        }
      }

      return {
        chats: downloadedChats,
        hasMore: !!remoteList.nextContinuationToken,
        nextToken: remoteList.nextContinuationToken,
      }
    } catch (error) {
      logError('Failed to load remote chats with pagination', error, {
        component: 'CloudSync',
        action: 'loadChatsWithPagination',
      })

      // Fall back to local chats if remote loading fails
      if (loadLocal) {
        const localChats = await indexedDBStorage.getAllChats()
        const sortedChats = localChats.sort((a, b) => {
          const timeA = new Date(a.createdAt).getTime()
          const timeB = new Date(b.createdAt).getTime()
          return timeB - timeA
        })

        const start = continuationToken ? parseInt(continuationToken, 10) : 0
        const paginatedChats = sortedChats.slice(start, start + limit)

        return {
          chats: paginatedChats,
          hasMore: start + limit < sortedChats.length,
          nextToken:
            start + limit < sortedChats.length
              ? (start + limit).toString()
              : undefined,
        }
      }

      throw error
    }
  }

  // Retry decryption for chats that failed to decrypt
  async retryDecryptionWithNewKey(): Promise<number> {
    let decryptedCount = 0
    let chatsWithEncryptedData: any[] = []

    try {
      // Get all chats that have encrypted data
      chatsWithEncryptedData =
        await indexedDBStorage.getChatsWithEncryptedData()

      for (const chat of chatsWithEncryptedData) {
        try {
          // Parse the stored encrypted data
          const encryptedData = JSON.parse(chat.encryptedData)

          // Decrypt the chat data
          const decryptedData = await encryptionService.decrypt(encryptedData)

          logInfo(`Decrypted chat ${chat.id}`, {
            component: 'CloudSync',
            action: 'retryDecryptionWithNewKey',
            metadata: {
              chatId: chat.id,
              decryptedTitle: decryptedData.title,
              messageCount: decryptedData.messages?.length || 0,
            },
          })

          // Create properly decrypted chat with original data
          const updatedChat: StoredChat = {
            ...decryptedData, // Use all decrypted data first
            id: chat.id, // Preserve the original ID
            decryptionFailed: false,
            encryptedData: undefined,
            syncedAt: chat.syncedAt,
            syncVersion: chat.syncVersion,
            locallyModified: false,
          }

          await indexedDBStorage.saveChat(updatedChat)
          decryptedCount++
        } catch (error) {
          logError(`Failed to decrypt chat ${chat.id}`, error, {
            component: 'CloudSync',
            action: 'retryDecryptionWithNewKey',
            metadata: { chatId: chat.id },
          })
        }
      }
    } catch (error) {
      logError('Failed to retry decryptions', error, {
        component: 'CloudSync',
        action: 'retryDecryptionWithNewKey',
      })
    }

    return decryptedCount
  }
}

export const cloudSync = new CloudSyncService()
