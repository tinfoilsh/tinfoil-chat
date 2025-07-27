import { indexedDBStorage } from '../storage/indexed-db'
import { r2Storage } from './r2-storage'

export interface SyncResult {
  uploaded: number
  downloaded: number
  errors: string[]
}

export class CloudSyncService {
  private isSyncing = false

  // Set auth token for API calls
  setAuthToken(authToken: string) {
    r2Storage.setAuthToken(authToken)
  }

  // Backup a single chat to the cloud
  async backupChat(chatId: string): Promise<void> {
    try {
      const chat = await indexedDBStorage.getChat(chatId)
      if (!chat) {
        return // Chat might have been deleted
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

      for (const chat of unsyncedChats) {
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
      const remoteList = await r2Storage.listChats()
      const localChats = await indexedDBStorage.getAllChats()

      // Create maps for easy lookup
      const localChatMap = new Map(localChats.map((c) => [c.id, c]))
      const remoteChatMap = new Map(remoteList.chats.map((c) => [c.id, c]))

      // Download new or updated chats from remote
      for (const remoteChat of remoteList.chats) {
        const localChat = localChatMap.get(remoteChat.id)

        // Download if:
        // 1. Chat doesn't exist locally
        // 2. Remote is newer (based on lastModified)
        const shouldDownload =
          !localChat ||
          new Date(remoteChat.lastModified).getTime() >
            (localChat.syncedAt || 0)

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
          // This chat was synced before but no longer exists remotely
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
}

export const cloudSync = new CloudSyncService()
