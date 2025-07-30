import { logError, logInfo } from '@/utils/error-handling'
import { encryptionService } from '../encryption/encryption-service'
import { indexedDBStorage } from '../storage/indexed-db'
import { r2Storage } from './r2-storage'

export interface SyncResult {
  uploaded: number
  downloaded: number
  errors: string[]
}

export class CloudSyncService {
  private isSyncing = false
  private uploadQueue: Map<string, Promise<void>> = new Map()
  private lastUploadTime = 0
  private readonly MIN_UPLOAD_INTERVAL = 1000 // 1 second between uploads

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
      // Rate limiting: ensure minimum interval between uploads
      const now = Date.now()
      const timeSinceLastUpload = now - this.lastUploadTime
      if (timeSinceLastUpload < this.MIN_UPLOAD_INTERVAL) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.MIN_UPLOAD_INTERVAL - timeSinceLastUpload),
        )
      }
      this.lastUploadTime = Date.now()

      const chat = await indexedDBStorage.getChat(chatId)
      if (!chat) {
        return // Chat might have been deleted
      }

      // Don't sync empty chats
      if (!chat.messages || chat.messages.length === 0) {
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

      // Filter out empty chats - they shouldn't be synced
      const chatsToSync = unsyncedChats.filter(
        (chat) => chat.messages && chat.messages.length > 0,
      )

      logInfo(`Chats with messages to sync: ${chatsToSync.length}`, {
        component: 'CloudSync',
        action: 'backupUnsyncedChats',
      })

      for (const chat of chatsToSync) {
        try {
          await r2Storage.uploadChat(chat)
          const newVersion = (chat.syncVersion || 0) + 1
          await indexedDBStorage.markAsSynced(chat.id, newVersion)
          result.uploaded++
        } catch (error) {
          result.errors.push(`Failed to backup chat ${chat.id}: ${error}`)
        }
      }
    } catch (error) {
      result.errors.push(`Failed to get unsynced chats: ${error}`)
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

      // Then, get list of remote chats
      let remoteList
      try {
        remoteList = await r2Storage.listChats()
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

      // Download new or updated chats from remote
      for (const remoteChat of remoteConversations) {
        const localChat = localChatMap.get(remoteChat.id)

        // Download if:
        // 1. Chat doesn't exist locally
        // 2. Remote is newer (based on updatedAt)
        // 3. Chat failed decryption (to retry with new key)
        const remoteTimestamp = Date.parse(remoteChat.updatedAt)
        const shouldDownload =
          !localChat ||
          (!isNaN(remoteTimestamp) &&
            remoteTimestamp > (localChat.syncedAt || 0)) ||
          (localChat as any).decryptionFailed === true

        if (shouldDownload) {
          try {
            const downloadedChat = await r2Storage.downloadChat(remoteChat.id)
            if (downloadedChat) {
              await indexedDBStorage.saveChat(downloadedChat)
              await indexedDBStorage.markAsSynced(
                downloadedChat.id,
                downloadedChat.syncVersion || 0,
              )
              result.downloaded++
            }
          } catch (error) {
            result.errors.push(
              `Failed to download chat ${remoteChat.id}: ${error}`,
            )
          }
        }
      }

      // Delete local chats that were deleted remotely
      for (const localChat of localChats) {
        if (!remoteChatMap.has(localChat.id) && localChat.syncedAt) {
          // This chat was previously synced but now deleted from R2
          try {
            await indexedDBStorage.deleteChat(localChat.id)
          } catch (error) {
            result.errors.push(
              `Failed to delete local chat ${localChat.id}: ${error}`,
            )
          }
        }
      }
    } catch (error) {
      result.errors.push(`Sync failed: ${error}`)
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

  // Retry decryption for chats that failed to decrypt
  async retryDecryptionWithNewKey(): Promise<number> {
    let decryptedCount = 0

    try {
      // Get all chats that have encrypted data
      const chatsWithEncryptedData =
        await indexedDBStorage.getChatsWithEncryptedData()

      for (const chat of chatsWithEncryptedData) {
        if (chat.encryptedData) {
          try {
            const encrypted = JSON.parse(chat.encryptedData)

            // Try to decrypt with the current key (already set by setKey)
            const decrypted = await encryptionService.decrypt(encrypted)

            // Successfully decrypted - update the chat
            // Need to preserve the ID and sync metadata
            const updatedChat = {
              ...decrypted,
              id: chat.id, // Preserve the original ID
              decryptionFailed: false,
              encryptedData: undefined,
              syncedAt: chat.syncedAt,
              locallyModified: false,
              syncVersion: chat.syncVersion,
            }

            await indexedDBStorage.saveChat(updatedChat)
            decryptedCount++
          } catch (error) {
            // Silent fail - keep the encrypted placeholder
            logError(`Failed to retry decryption for chat ${chat.id}`, error, {
              component: 'CloudSync',
              action: 'retryDecryptionWithNewKey',
              metadata: { chatId: chat.id },
            })
          }
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
