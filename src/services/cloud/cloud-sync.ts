import { PAGINATION } from '@/config'
import { ensureValidISODate } from '@/utils/chat-timestamps'
import { logError, logInfo } from '@/utils/error-handling'
import { encryptionService } from '../encryption/encryption-service'
import { chatEvents } from '../storage/chat-events'
import { deletedChatsTracker } from '../storage/deleted-chats-tracker'
import { indexedDBStorage, type StoredChat } from '../storage/indexed-db'
import { cloudStorage, type ChatSyncStatus } from './cloud-storage'
import { projectStorage } from './project-storage'
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

export interface SyncStatusResult {
  needsSync: boolean
  reason: 'no_changes' | 'count_changed' | 'updated' | 'local_changes' | 'error'
  remoteCount?: number
  remoteLastUpdated?: string | null
}

const SYNC_STATUS_STORAGE_KEY = 'tinfoil-chat-sync-status'
const PROJECT_SYNC_STATUS_STORAGE_KEY_PREFIX =
  'tinfoil-project-chat-sync-status-'

export class CloudSyncService {
  private isSyncing = false
  private uploadQueue: Map<string, Promise<void>> = new Map()
  private pendingUploads: Map<string, () => Promise<void>> = new Map()
  private streamingCallbacks: Set<string> = new Set()
  private lastSyncStatus: ChatSyncStatus | null = null
  private projectSyncStatus: Map<string, ChatSyncStatus> = new Map()

  // Set token getter for API calls
  setTokenGetter(getToken: () => Promise<string | null>) {
    cloudStorage.setTokenGetter(getToken)
    projectStorage.setTokenGetter(getToken)
  }

  // Load cached sync status from localStorage
  private loadCachedSyncStatus(): ChatSyncStatus | null {
    if (typeof window === 'undefined') return null
    try {
      const cached = localStorage.getItem(SYNC_STATUS_STORAGE_KEY)
      if (cached) {
        return JSON.parse(cached)
      }
    } catch {
      // Ignore parse errors
    }
    return null
  }

  // Save sync status to localStorage
  private saveSyncStatus(status: ChatSyncStatus): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(SYNC_STATUS_STORAGE_KEY, JSON.stringify(status))
      this.lastSyncStatus = status
    } catch {
      // Ignore storage errors
    }
  }

  // Load cached project sync status from localStorage
  private loadCachedProjectSyncStatus(
    projectId: string,
  ): ChatSyncStatus | null {
    if (typeof window === 'undefined') return null
    try {
      const cached = localStorage.getItem(
        PROJECT_SYNC_STATUS_STORAGE_KEY_PREFIX + projectId,
      )
      if (cached) {
        return JSON.parse(cached)
      }
    } catch {
      // Ignore parse errors
    }
    return null
  }

  // Save project sync status to localStorage
  private saveProjectSyncStatus(
    projectId: string,
    status: ChatSyncStatus,
  ): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(
        PROJECT_SYNC_STATUS_STORAGE_KEY_PREFIX + projectId,
        JSON.stringify(status),
      )
      this.projectSyncStatus.set(projectId, status)
    } catch {
      // Ignore storage errors
    }
  }

  /**
   * Check if sync is needed by comparing local and remote sync status.
   * @param projectId - Optional project ID. If provided, checks project chat sync status.
   */
  async checkSyncStatus(projectId?: string): Promise<SyncStatusResult> {
    if (!(await cloudStorage.isAuthenticated())) {
      return { needsSync: false, reason: 'no_changes' }
    }

    try {
      // First check if we have local unsynced changes
      const unsyncedChats = await indexedDBStorage.getUnsyncedChats()
      const chatsNeedingUpload = unsyncedChats.filter((chat) => {
        // Filter by project if specified
        if (projectId) {
          if (chat.projectId !== projectId) return false
        } else {
          // For regular chats, exclude project chats
          if (chat.projectId) return false
        }
        return (
          !(chat as any).isBlankChat &&
          !streamingTracker.isStreaming(chat.id) &&
          !chat.isLocalOnly
        )
      })

      if (chatsNeedingUpload.length > 0) {
        return {
          needsSync: true,
          reason: 'local_changes',
        }
      }

      // Fetch remote sync status
      const remoteStatus = projectId
        ? await projectStorage.getProjectChatsSyncStatus(projectId)
        : await cloudStorage.getChatSyncStatus()

      // Get cached status
      const cachedStatus = projectId
        ? this.projectSyncStatus.get(projectId) ||
          this.loadCachedProjectSyncStatus(projectId)
        : this.lastSyncStatus || this.loadCachedSyncStatus()

      // If no cached status, we need a full sync
      if (!cachedStatus) {
        return {
          needsSync: true,
          reason: 'count_changed',
          remoteCount: remoteStatus.count,
          remoteLastUpdated: remoteStatus.lastUpdated,
        }
      }

      logInfo('[CloudSync] checkSyncStatus comparing statuses', {
        component: 'CloudSync',
        action: 'checkSyncStatus.compare',
        metadata: {
          projectId,
          remoteCount: remoteStatus.count,
          cachedCount: cachedStatus.count,
          remoteLastUpdated: remoteStatus.lastUpdated,
          cachedLastUpdated: cachedStatus.lastUpdated,
        },
      })

      // Compare count
      if (remoteStatus.count !== cachedStatus.count) {
        return {
          needsSync: true,
          reason: 'count_changed',
          remoteCount: remoteStatus.count,
          remoteLastUpdated: remoteStatus.lastUpdated,
        }
      }

      // Compare lastUpdated timestamps
      if (remoteStatus.lastUpdated !== cachedStatus.lastUpdated) {
        return {
          needsSync: true,
          reason: 'updated',
          remoteCount: remoteStatus.count,
          remoteLastUpdated: remoteStatus.lastUpdated,
        }
      }

      // No changes detected
      return {
        needsSync: false,
        reason: 'no_changes',
        remoteCount: remoteStatus.count,
        remoteLastUpdated: remoteStatus.lastUpdated,
      }
    } catch (error) {
      logError('Failed to check sync status', error, {
        component: 'CloudSync',
        action: 'checkSyncStatus',
        metadata: { projectId },
      })
      return { needsSync: true, reason: 'error' }
    }
  }

  // Perform a delta sync - only fetch chats that changed since last sync
  async syncChangedChats(): Promise<SyncResult> {
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

      // Get cached sync status to determine what changed
      const cachedStatus = this.lastSyncStatus || this.loadCachedSyncStatus()

      if (!cachedStatus?.lastUpdated) {
        // No cached status, fall back to full sync (first page only)
        this.isSyncing = false
        return await this.syncAllChats()
      }

      // Fetch only chats updated since our last sync
      let updatedChats
      try {
        updatedChats = await cloudStorage.getChatsUpdatedSince({
          since: cachedStatus.lastUpdated,
          includeContent: true,
        })
      } catch (error) {
        logError(
          'Failed to get updated chats, falling back to full sync',
          error,
          {
            component: 'CloudSync',
            action: 'syncChangedChats',
          },
        )
        this.isSyncing = false
        return await this.syncAllChats()
      }

      const remoteConversations = updatedChats.conversations || []

      if (remoteConversations.length === 0) {
        logInfo('No chats updated since last sync', {
          component: 'CloudSync',
          action: 'syncChangedChats',
          metadata: { since: cachedStatus.lastUpdated },
        })
        // Update the cached status with current time to track this sync
        try {
          const newStatus = await cloudStorage.getChatSyncStatus()
          this.saveSyncStatus(newStatus)
        } catch (statusError) {
          logError('Failed to update sync status', statusError, {
            component: 'CloudSync',
            action: 'syncChangedChats',
          })
        }
        this.isSyncing = false
        return result
      }

      logInfo(`Syncing ${remoteConversations.length} changed chats`, {
        component: 'CloudSync',
        action: 'syncChangedChats',
        metadata: { since: cachedStatus.lastUpdated },
      })

      // Initialize encryption service once before processing
      await encryptionService.initialize()

      // Process updated remote chats
      const savedIds: string[] = []
      for (const remoteChat of remoteConversations) {
        // Skip if this chat was recently deleted
        if (deletedChatsTracker.isDeleted(remoteChat.id)) {
          continue
        }

        try {
          let downloadedChat: StoredChat | null = null

          if (remoteChat.content) {
            const encrypted = JSON.parse(remoteChat.content)

            try {
              const decrypted = await encryptionService.decrypt(encrypted)
              downloadedChat = decrypted
            } catch (decryptError) {
              const isCorrupted =
                decryptError instanceof Error &&
                decryptError.message.includes('DATA_CORRUPTED')

              // Preserve projectId from local chat if it exists
              const localChat = await indexedDBStorage.getChat(remoteChat.id)

              downloadedChat = {
                id: remoteChat.id,
                title: 'Encrypted',
                messages: [],
                createdAt: ensureValidISODate(
                  remoteChat.createdAt,
                  remoteChat.id,
                ),
                updatedAt: ensureValidISODate(
                  remoteChat.updatedAt ?? remoteChat.createdAt,
                  remoteChat.id,
                ),
                lastAccessedAt: Date.now(),
                decryptionFailed: true,
                dataCorrupted: isCorrupted,
                encryptedData: remoteChat.content,
                syncedAt: Date.now(),
                locallyModified: false,
                syncVersion: 1,
                // Preserve project association from local chat
                projectId: localChat?.projectId,
              } as StoredChat
            }
          } else {
            downloadedChat = await cloudStorage.downloadChat(remoteChat.id)
            if (downloadedChat) {
              downloadedChat.createdAt = ensureValidISODate(
                downloadedChat.createdAt ?? remoteChat.createdAt,
                remoteChat.id,
              )
              downloadedChat.updatedAt = ensureValidISODate(
                downloadedChat.updatedAt ??
                  remoteChat.updatedAt ??
                  remoteChat.createdAt,
                remoteChat.id,
              )
              downloadedChat.lastAccessedAt = Date.now()
              downloadedChat.syncedAt = Date.now()
              downloadedChat.locallyModified = false
              downloadedChat.syncVersion = downloadedChat.syncVersion || 1
              // Preserve project association from local chat if decryption failed
              if (downloadedChat.decryptionFailed) {
                const localChat = await indexedDBStorage.getChat(remoteChat.id)
                if (localChat?.projectId) {
                  downloadedChat.projectId = localChat.projectId
                }
              }
            }
          }

          if (downloadedChat) {
            downloadedChat.createdAt = ensureValidISODate(
              downloadedChat.createdAt,
              downloadedChat.id,
            )
            downloadedChat.updatedAt = ensureValidISODate(
              downloadedChat.updatedAt ?? downloadedChat.createdAt,
              downloadedChat.id,
            )
            await indexedDBStorage.saveChat(downloadedChat)
            await indexedDBStorage.markAsSynced(
              downloadedChat.id,
              downloadedChat.syncVersion || 0,
            )
            savedIds.push(downloadedChat.id)
            result.downloaded++
          }
        } catch (error) {
          result.errors.push(
            `Failed to process chat ${remoteChat.id}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }

      if (savedIds.length > 0) {
        chatEvents.emit({ reason: 'sync', ids: savedIds })
      }

      // Update cached sync status
      try {
        const newStatus = await cloudStorage.getChatSyncStatus()
        this.saveSyncStatus(newStatus)
      } catch (statusError) {
        logError('Failed to update sync status', statusError, {
          component: 'CloudSync',
          action: 'syncChangedChats',
        })
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

  // Clear cached sync status (useful when logging out or resetting)
  clearSyncStatus(): void {
    this.lastSyncStatus = null
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(SYNC_STATUS_STORAGE_KEY)
      } catch {
        // Ignore storage errors
      }
    }
  }

  // Backup a single chat to the cloud with rate limiting
  async backupChat(chatId: string): Promise<void> {
    // Don't attempt backup if not authenticated
    if (!(await cloudStorage.isAuthenticated())) {
      return
    }

    // Check if there's already an upload in progress for this chat
    const existingUpload = this.uploadQueue.get(chatId)
    if (existingUpload) {
      // Queue this upload to run after the current one completes
      // This ensures we upload the latest version of the chat
      return existingUpload.then(() => {
        // Run the upload again with the latest data
        return this.backupChat(chatId)
      })
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
        // Check if we already have a callback registered for this chat
        if (this.streamingCallbacks.has(chatId)) {
          logInfo('Streaming callback already registered for chat', {
            component: 'CloudSync',
            action: 'backupChat',
            metadata: { chatId },
          })
          return
        }

        logInfo('Chat is streaming, registering for sync after stream ends', {
          component: 'CloudSync',
          action: 'backupChat',
          metadata: { chatId },
        })

        // Mark that we have a callback registered
        this.streamingCallbacks.add(chatId)

        // Register to sync once streaming ends
        streamingTracker.onStreamEnd(chatId, () => {
          // Remove from tracking set
          this.streamingCallbacks.delete(chatId)

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

      // Don't sync blank chats or local-only chats
      if ((chat as any).isBlankChat || chat.isLocalOnly) {
        logInfo('Skipping sync for blank or local-only chat', {
          component: 'CloudSync',
          action: 'backupChat',
          metadata: {
            chatId,
            isBlankChat: (chat as any).isBlankChat,
            isLocalOnly: chat.isLocalOnly,
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

      const newId = await cloudStorage.uploadChat(chat)

      // If uploadChat returned null, it means ID generation failed - skip for now
      if (newId === null && chat.id.startsWith('temp-')) {
        return
      }

      // If the ID changed (temp ID was replaced with server ID), update IndexedDB
      if (newId && newId !== chatId) {
        // Re-check that the temp ID still exists - it may have been updated by another flow
        const stillExists = await indexedDBStorage.getChat(chatId)
        if (!stillExists) {
          logInfo(
            'Chat was already updated by another flow, skipping IndexedDB update',
            {
              component: 'CloudSync',
              action: 'backupChat',
              metadata: { oldId: chatId, newId },
            },
          )
          return
        }

        logInfo('Chat ID changed during upload, updating local storage', {
          component: 'CloudSync',
          action: 'backupChat',
          metadata: { oldId: chatId, newId },
        })
        await indexedDBStorage.deleteChat(chatId)
        await indexedDBStorage.saveChat({ ...chat, id: newId })
        // Notify UI about the ID change so it can reload
        chatEvents.emit({ reason: 'sync', ids: [newId] })
        chatId = newId
      }

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

      // Filter out blank chats, streaming chats, and local-only chats
      // Note: temp ID chats are allowed - uploadChat will generate server IDs for them
      const chatsToSync = unsyncedChats.filter(
        (chat) =>
          !(chat as any).isBlankChat &&
          !streamingTracker.isStreaming(chat.id) &&
          !chat.isLocalOnly,
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

          const newId = await cloudStorage.uploadChat(chat)

          // If uploadChat returned null, it means ID generation failed - skip for now
          if (newId === null && chat.id.startsWith('temp-')) {
            return
          }

          let finalId = chat.id

          // If the ID changed (temp ID was replaced with server ID), update IndexedDB
          if (newId && newId !== chat.id) {
            // Re-check that the temp ID still exists - it may have been updated by another flow
            const stillExists = await indexedDBStorage.getChat(chat.id)
            if (!stillExists) {
              logInfo(
                'Chat was already updated by another flow, skipping IndexedDB update',
                {
                  component: 'CloudSync',
                  action: 'backupUnsyncedChats',
                  metadata: { oldId: chat.id, newId },
                },
              )
              return
            }

            logInfo('Chat ID changed during upload, updating local storage', {
              component: 'CloudSync',
              action: 'backupUnsyncedChats',
              metadata: { oldId: chat.id, newId },
            })
            await indexedDBStorage.deleteChat(chat.id)
            await indexedDBStorage.saveChat({ ...chat, id: newId })
            // Notify UI about the ID change so it can reload
            chatEvents.emit({ reason: 'sync', ids: [newId] })
            finalId = newId
          }

          const newVersion = (chat.syncVersion || 0) + 1
          await indexedDBStorage.markAsSynced(finalId, newVersion)
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
        remoteList = await cloudStorage.listChats({
          includeContent: true,
          limit: PAGINATION.CHATS_PER_PAGE,
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

      const remoteConversations = [...(remoteList.conversations || [])]

      // Only sync the first page - new chats always appear at the top
      // No need to fetch older chats every 15 seconds
      logInfo(`Syncing first page only (${remoteConversations.length} chats)`, {
        component: 'CloudSync',
        action: 'syncAllChats',
        metadata: {
          remoteIds: remoteConversations.map((c) => c.id).slice(0, 10),
          firstChatUpdatedAt: remoteConversations[0]?.updatedAt,
        },
      })

      const localChats = await indexedDBStorage.getAllChats()

      // Initialize encryption service once before processing
      await encryptionService.initialize()

      // Create maps for easy lookup
      const localChatMap = new Map(localChats.map((c) => [c.id, c]))
      const remoteChatMap = new Map(remoteConversations.map((c) => [c.id, c]))

      // Process remote chats
      const savedIds: string[] = []
      for (const remoteChat of remoteConversations) {
        // Skip if this chat was recently deleted
        if (deletedChatsTracker.isDeleted(remoteChat.id)) {
          logInfo('Skipping sync for recently deleted chat', {
            component: 'CloudSync',
            action: 'syncAllChats',
            metadata: { chatId: remoteChat.id },
          })
          continue
        }

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

        if (shouldProcess) {
          try {
            let downloadedChat: StoredChat | null = null

            if (remoteChat.content) {
              const encrypted = JSON.parse(remoteChat.content)

              try {
                const decrypted = await encryptionService.decrypt(encrypted)
                downloadedChat = decrypted
              } catch (decryptError) {
                const isCorrupted =
                  decryptError instanceof Error &&
                  decryptError.message.includes('DATA_CORRUPTED')

                const safeCreatedAt = ensureValidISODate(
                  remoteChat.createdAt,
                  remoteChat.id,
                )
                const safeUpdatedAt = ensureValidISODate(
                  remoteChat.updatedAt ?? remoteChat.createdAt,
                  remoteChat.id,
                )
                downloadedChat = {
                  id: remoteChat.id,
                  title: 'Encrypted',
                  messages: [],
                  createdAt: safeCreatedAt,
                  updatedAt: safeUpdatedAt,
                  lastAccessedAt: Date.now(),
                  decryptionFailed: true,
                  dataCorrupted: isCorrupted,
                  encryptedData: remoteChat.content,
                  syncedAt: Date.now(),
                  locallyModified: false,
                  syncVersion: 1,
                  // Preserve project association from local chat
                  projectId: localChat?.projectId,
                } as StoredChat
              }
            } else {
              downloadedChat = await cloudStorage.downloadChat(remoteChat.id)
              if (downloadedChat) {
                const safeCreatedAt = ensureValidISODate(
                  downloadedChat.createdAt ?? remoteChat.createdAt,
                  remoteChat.id,
                )
                const safeUpdatedAt = ensureValidISODate(
                  downloadedChat.updatedAt ??
                    remoteChat.updatedAt ??
                    remoteChat.createdAt,
                  remoteChat.id,
                )
                downloadedChat.createdAt = safeCreatedAt
                downloadedChat.updatedAt = safeUpdatedAt
                downloadedChat.lastAccessedAt = Date.now()
                downloadedChat.syncedAt = Date.now()
                downloadedChat.locallyModified = false
                downloadedChat.syncVersion = downloadedChat.syncVersion || 1
                // Preserve project association from local chat if decryption failed
                if (downloadedChat.decryptionFailed && localChat?.projectId) {
                  downloadedChat.projectId = localChat.projectId
                }
              }
            }

            if (downloadedChat) {
              downloadedChat.createdAt = ensureValidISODate(
                downloadedChat.createdAt,
                downloadedChat.id,
              )
              downloadedChat.updatedAt = ensureValidISODate(
                downloadedChat.updatedAt ?? downloadedChat.createdAt,
                downloadedChat.id,
              )
              await indexedDBStorage.saveChat(downloadedChat)
              await indexedDBStorage.markAsSynced(
                downloadedChat.id,
                downloadedChat.syncVersion || 0,
              )
              savedIds.push(downloadedChat.id)
              result.downloaded++
            }
          } catch (error) {
            result.errors.push(
              `Failed to process chat ${remoteChat.id}: ${error instanceof Error ? error.message : String(error)}`,
            )
          }
        }
      }

      // Since we're only syncing the first page, we can't determine if chats
      // were deleted remotely (they might just be on page 2+)
      // Deletion tracking would require fetching all pages, which we're avoiding for performance

      if (savedIds.length > 0) {
        chatEvents.emit({ reason: 'sync', ids: savedIds })
      }

      // Update cached sync status after successful sync
      try {
        const newStatus = await cloudStorage.getChatSyncStatus()
        this.saveSyncStatus(newStatus)
      } catch (statusError) {
        // Non-fatal: continue even if we can't update status
        logError('Failed to update sync status after full sync', statusError, {
          component: 'CloudSync',
          action: 'syncAllChats',
        })
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

  /**
   * Smart sync: check status first and only sync if needed.
   * @param projectId - Optional project ID. If provided, syncs project chats.
   */
  async smartSync(projectId?: string): Promise<SyncResult> {
    if (this.isSyncing) {
      throw new Error('Sync already in progress')
    }

    const status = await this.checkSyncStatus(projectId)

    if (!status.needsSync) {
      logInfo('Smart sync: no changes detected, skipping sync', {
        component: 'CloudSync',
        action: 'smartSync',
        metadata: {
          projectId,
          reason: status.reason,
          remoteCount: status.remoteCount,
        },
      })
      return { uploaded: 0, downloaded: 0, errors: [] }
    }

    logInfo('Smart sync: changes detected, syncing', {
      component: 'CloudSync',
      action: 'smartSync',
      metadata: {
        projectId,
        reason: status.reason,
        remoteCount: status.remoteCount,
        remoteLastUpdated: status.remoteLastUpdated,
      },
    })

    // If we have a cached lastUpdated, use delta sync; otherwise fall back to full sync
    const cachedStatus = projectId
      ? this.projectSyncStatus.get(projectId) ||
        this.loadCachedProjectSyncStatus(projectId)
      : this.lastSyncStatus || this.loadCachedSyncStatus()

    if (cachedStatus?.lastUpdated && status.reason !== 'count_changed') {
      return projectId
        ? this.syncProjectChatsChanged(projectId)
        : this.syncChangedChats()
    }

    return projectId ? this.syncProjectChats(projectId) : this.syncAllChats()
  }

  // Check if currently syncing
  get syncing(): boolean {
    return this.isSyncing
  }

  // Delete a chat from cloud storage
  async deleteFromCloud(chatId: string): Promise<void> {
    // Don't attempt deletion if not authenticated
    if (!(await cloudStorage.isAuthenticated())) {
      return
    }

    try {
      await cloudStorage.deleteChat(chatId)

      // Successfully deleted from cloud, can remove from tracker
      // This allows the chat to be re-created with the same ID if needed
      deletedChatsTracker.removeFromDeleted(chatId)

      logInfo('Chat successfully deleted from cloud', {
        component: 'CloudSync',
        action: 'deleteFromCloud',
        metadata: { chatId },
      })
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
    if (!(await cloudStorage.isAuthenticated())) {
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
      // Initialize encryption service once before processing
      await encryptionService.initialize()

      // For authenticated users, load from R2 with content
      const remoteList = await cloudStorage.listChats({
        limit,
        continuationToken,
        includeContent: true,
      })

      // Process the chat data from each remote chat in parallel
      const downloadedChats: StoredChat[] = []
      const chatsToProcess = remoteList.conversations || []

      // Process all chats in parallel for better performance
      const processPromises = chatsToProcess.map(async (remoteChat) => {
        // Skip if this chat was recently deleted
        if (deletedChatsTracker.isDeleted(remoteChat.id)) {
          logInfo('Skipping load for recently deleted chat', {
            component: 'CloudSync',
            action: 'loadChatsWithPagination',
            metadata: { chatId: remoteChat.id },
          })
          return null
        }

        if (!remoteChat.content) return null

        try {
          const encrypted = JSON.parse(remoteChat.content)

          // Try to decrypt the chat data
          let chat: StoredChat | null = null
          try {
            const decrypted = await encryptionService.decrypt(encrypted)
            chat = decrypted
          } catch (decryptError) {
            // Check if this is corrupted data (compressed)
            const isCorrupted =
              decryptError instanceof Error &&
              decryptError.message.includes('DATA_CORRUPTED')

            // If decryption fails, store the encrypted data for later retry
            chat = {
              id: remoteChat.id,
              title: 'Encrypted',
              messages: [],
              createdAt: remoteChat.createdAt,
              updatedAt: remoteChat.updatedAt,
              lastAccessedAt: Date.now(),
              decryptionFailed: true,
              dataCorrupted: isCorrupted,
              encryptedData: remoteChat.content,
              syncedAt: Date.now(),
              locallyModified: false,
              syncVersion: 1,
            } as StoredChat
          }

          return chat
        } catch (error) {
          logError(`Failed to process chat ${remoteChat.id}`, error, {
            component: 'CloudSync',
            action: 'loadChatsWithPagination',
          })
          return null
        }
      })

      // Wait for all decryptions to complete
      const results = await Promise.all(processPromises)

      // Filter out nulls and add to downloadedChats
      for (const chat of results) {
        if (chat) {
          downloadedChats.push(chat)
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
  async retryDecryptionWithNewKey(
    options: {
      onProgress?: (current: number, total: number) => void
      batchSize?: number
    } = {},
  ): Promise<number> {
    const { onProgress } = options
    // Ensure batchSize is a positive integer, default to 5 if invalid
    const batchSize = Math.max(1, Math.floor(options.batchSize || 5))
    let decryptedCount = 0
    let chatsWithEncryptedData: any[] = []

    try {
      // Get all chats that have encrypted data
      chatsWithEncryptedData =
        await indexedDBStorage.getChatsWithEncryptedData()

      const total = chatsWithEncryptedData.length

      // Process chats in batches to avoid blocking the UI
      for (let i = 0; i < chatsWithEncryptedData.length; i += batchSize) {
        const batch = chatsWithEncryptedData.slice(i, i + batchSize)

        // Process batch in parallel
        const batchPromises = batch.map(async (chat) => {
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
            return true
          } catch (error) {
            logError(`Failed to decrypt chat ${chat.id}`, error, {
              component: 'CloudSync',
              action: 'retryDecryptionWithNewKey',
              metadata: { chatId: chat.id },
            })
            return false
          }
        })

        const results = await Promise.all(batchPromises)
        decryptedCount += results.filter(Boolean).length

        // Report progress
        if (onProgress) {
          onProgress(Math.min(i + batchSize, total), total)
        }

        // Yield to the event loop between batches
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    } catch (error) {
      logError('Failed to retry decryptions', error, {
        component: 'CloudSync',
        action: 'retryDecryptionWithNewKey',
      })
    }

    return decryptedCount
  }

  // Re-encrypt all local chats with new key and upload to cloud
  async reencryptAndUploadChats(): Promise<{
    reencrypted: number
    uploaded: number
    errors: string[]
  }> {
    const result = {
      reencrypted: 0,
      uploaded: 0,
      errors: [] as string[],
    }

    try {
      // Get all local chats
      const allChats = await indexedDBStorage.getAllChats()

      logInfo('Starting re-encryption of local chats', {
        component: 'CloudSync',
        action: 'reencryptAndUploadChats',
        metadata: { totalChats: allChats.length },
      })

      // Initialize encryption with new key
      await encryptionService.initialize()

      for (const chat of allChats) {
        try {
          // Skip blank chats
          if (chat.isBlankChat) continue

          // Skip chats that failed to decrypt
          if (chat.decryptionFailed) {
            logInfo('Skipping chat that failed to decrypt', {
              component: 'CloudSync',
              action: 'reencryptAndUploadChats',
              metadata: {
                chatId: chat.id,
                hasEncryptedData: !!chat.encryptedData,
                dataCorrupted: chat.dataCorrupted,
              },
            })
            continue
          }

          // For encrypted chats, they need to be decrypted first (will use old key from memory if available)
          // For decrypted chats, we can directly work with them
          let chatToReencrypt = chat

          if (chat.encryptedData) {
            // This chat is still encrypted with old key, skip it
            // It will be handled by retryDecryptionWithNewKey
            logInfo('Skipping encrypted chat - needs decryption first', {
              component: 'CloudSync',
              action: 'reencryptAndUploadChats',
              metadata: { chatId: chat.id },
            })
            continue
          }

          // Re-encrypt the chat with the new key by forcing a sync
          // The sync process will automatically encrypt with the current key
          if (await cloudStorage.isAuthenticated()) {
            // Increment sync version to force upload
            chatToReencrypt.syncVersion = (chatToReencrypt.syncVersion || 0) + 1

            // Save locally with new sync version
            await indexedDBStorage.saveChat(chatToReencrypt)

            // Upload to cloud (will be encrypted with new key)
            const newId = await cloudStorage.uploadChat(chatToReencrypt)

            // If uploadChat returned null, it means ID generation failed - skip
            if (newId === null && chatToReencrypt.id.startsWith('temp-')) {
              continue
            }

            let finalId = chatToReencrypt.id

            // If the ID changed (temp ID was replaced with server ID), update IndexedDB
            if (newId && newId !== chatToReencrypt.id) {
              // Re-check that the temp ID still exists - it may have been updated by another flow
              const stillExists = await indexedDBStorage.getChat(
                chatToReencrypt.id,
              )
              if (!stillExists) {
                continue
              }

              await indexedDBStorage.deleteChat(chatToReencrypt.id)
              chatToReencrypt = { ...chatToReencrypt, id: newId }
              await indexedDBStorage.saveChat(chatToReencrypt)
              // Notify UI about the ID change so it can reload
              chatEvents.emit({ reason: 'sync', ids: [newId] })
              finalId = newId
            }

            await indexedDBStorage.markAsSynced(
              finalId,
              chatToReencrypt.syncVersion || 0,
            )
            result.uploaded++
            result.reencrypted++

            logInfo('Chat re-encrypted and uploaded', {
              component: 'CloudSync',
              action: 'reencryptAndUploadChats',
              metadata: {
                chatId: finalId,
                syncVersion: chatToReencrypt.syncVersion,
              },
            })
          }
        } catch (error) {
          const errorMsg = `Failed to re-encrypt chat ${chat.id}: ${error instanceof Error ? error.message : String(error)}`
          result.errors.push(errorMsg)
          logError('Failed to re-encrypt chat', error, {
            component: 'CloudSync',
            action: 'reencryptAndUploadChats',
            metadata: { chatId: chat.id },
          })
        }
      }

      logInfo('Completed re-encryption of local chats', {
        component: 'CloudSync',
        action: 'reencryptAndUploadChats',
        metadata: result,
      })
    } catch (error) {
      const errorMsg = `Re-encryption failed: ${error instanceof Error ? error.message : String(error)}`
      result.errors.push(errorMsg)
      logError('Failed to re-encrypt chats', error, {
        component: 'CloudSync',
        action: 'reencryptAndUploadChats',
      })
    }

    return result
  }

  // Fetch a page of remote chats, decrypt, persist to IndexedDB, and return pagination info
  async fetchAndStorePage(options: {
    limit: number
    continuationToken?: string
  }): Promise<{ hasMore: boolean; nextToken?: string; saved: number }> {
    const { limit, continuationToken } = options

    // Only operate when authenticated
    if (!(await cloudStorage.isAuthenticated())) {
      return { hasMore: false, saved: 0 }
    }

    try {
      // Initialize encryption service before processing
      await encryptionService.initialize()

      // Request a page with content for decryption
      const remoteList = await cloudStorage.listChats({
        limit,
        continuationToken,
        includeContent: true,
      })

      const conversations = remoteList.conversations || []
      let saved = 0
      const savedIds: string[] = []

      // Process chats in parallel for performance
      const processPromises = conversations.map(async (remoteChat) => {
        try {
          let chat: StoredChat | null = null
          if (remoteChat.content) {
            try {
              const encrypted = JSON.parse(remoteChat.content)
              const decrypted = await encryptionService.decrypt(encrypted)
              chat = decrypted as StoredChat
            } catch (decryptError) {
              // If decryption fails, store placeholder to retry later
              const isCorrupted =
                decryptError instanceof Error &&
                decryptError.message.includes('DATA_CORRUPTED')
              chat = {
                id: remoteChat.id,
                title: 'Encrypted',
                messages: [],
                createdAt: ensureValidISODate(
                  remoteChat.createdAt,
                  remoteChat.id,
                ),
                updatedAt: ensureValidISODate(
                  remoteChat.updatedAt ?? remoteChat.createdAt,
                  remoteChat.id,
                ),
                lastAccessedAt: Date.now(),
                decryptionFailed: true,
                dataCorrupted: isCorrupted,
                encryptedData: remoteChat.content,
                syncedAt: Date.now(),
                locallyModified: false,
                syncVersion: 1,
              } as StoredChat
            }
          } else {
            // Fallback: download content by ID (should be rare when includeContent is true)
            chat = await cloudStorage.downloadChat(remoteChat.id)
            if (chat) {
              chat.createdAt = ensureValidISODate(
                chat.createdAt ?? remoteChat.createdAt,
                remoteChat.id,
              )
              chat.updatedAt = ensureValidISODate(
                chat.updatedAt ?? remoteChat.updatedAt ?? remoteChat.createdAt,
                remoteChat.id,
              )
              chat.lastAccessedAt = Date.now()
              chat.syncedAt = Date.now()
              chat.locallyModified = false
              chat.syncVersion = chat.syncVersion || 1
            }
          }

          if (chat) {
            chat.createdAt = ensureValidISODate(chat.createdAt, chat.id)
            chat.updatedAt = ensureValidISODate(
              chat.updatedAt ?? chat.createdAt,
              chat.id,
            )
            // Mark as loaded via pagination for local sort heuristics
            chat.loadedAt = Date.now()
            chat.syncedAt = Date.now()
            chat.locallyModified = false
            chat.syncVersion = chat.syncVersion || 1

            await indexedDBStorage.saveChat(chat)
            await indexedDBStorage.markAsSynced(chat.id, chat.syncVersion || 0)
            saved += 1
            savedIds.push(chat.id)
          }
        } catch (error) {
          logError(`Failed to process chat ${remoteChat.id}`, error, {
            component: 'CloudSync',
            action: 'fetchAndStorePage',
          })
        }
      })

      await Promise.all(processPromises)

      if (savedIds.length > 0) {
        chatEvents.emit({ reason: 'pagination', ids: savedIds })
      }

      return {
        hasMore: !!remoteList.nextContinuationToken,
        nextToken: remoteList.nextContinuationToken,
        saved,
      }
    } catch (error) {
      logError('Failed to fetch and store chat page', error, {
        component: 'CloudSync',
        action: 'fetchAndStorePage',
      })
      throw error
    }
  }

  /**
   * Sync chats for a specific project from the cloud.
   * This fetches project-specific chats using the /api/projects/{projectId}/chats endpoint.
   */
  async syncProjectChats(projectId: string): Promise<SyncResult> {
    const result: SyncResult = {
      uploaded: 0,
      downloaded: 0,
      errors: [],
    }

    if (!(await cloudStorage.isAuthenticated())) {
      return result
    }

    try {
      // Fetch project chats with content for decryption
      const projectChatsResponse = await projectStorage.listProjectChats(
        projectId,
        { includeContent: true },
      )

      const remoteChats = projectChatsResponse.chats || []

      if (remoteChats.length === 0) {
        logInfo('No project chats to sync', {
          component: 'CloudSync',
          action: 'syncProjectChats',
          metadata: { projectId },
        })
        return result
      }

      logInfo(`Syncing ${remoteChats.length} project chats`, {
        component: 'CloudSync',
        action: 'syncProjectChats',
        metadata: { projectId, chatCount: remoteChats.length },
      })

      // Get local chats to compare
      const localChats = await indexedDBStorage.getAllChats()
      const localChatMap = new Map(localChats.map((c) => [c.id, c]))

      // Initialize encryption service once before processing
      await encryptionService.initialize()

      const savedIds: string[] = []

      for (const remoteChat of remoteChats) {
        // Skip if this chat was recently deleted
        if (deletedChatsTracker.isDeleted(remoteChat.id)) {
          continue
        }

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
          localChat?.decryptionFailed === true

        if (!shouldProcess) {
          continue
        }

        try {
          let downloadedChat: StoredChat | null = null

          if (remoteChat.content) {
            const encrypted = JSON.parse(remoteChat.content)

            try {
              const decrypted = await encryptionService.decrypt(encrypted)
              downloadedChat = {
                ...decrypted,
                projectId, // Ensure projectId is set from the API context
              } as StoredChat
            } catch (decryptError) {
              const isCorrupted =
                decryptError instanceof Error &&
                decryptError.message.includes('DATA_CORRUPTED')

              const safeCreatedAt = ensureValidISODate(
                remoteChat.createdAt,
                remoteChat.id,
              )
              const safeUpdatedAt = ensureValidISODate(
                remoteChat.updatedAt ?? remoteChat.createdAt,
                remoteChat.id,
              )

              downloadedChat = {
                id: remoteChat.id,
                title: 'Encrypted',
                messages: [],
                createdAt: safeCreatedAt,
                updatedAt: safeUpdatedAt,
                lastAccessedAt: Date.now(),
                decryptionFailed: true,
                dataCorrupted: isCorrupted,
                encryptedData: remoteChat.content,
                syncedAt: Date.now(),
                locallyModified: false,
                syncVersion: 1,
                projectId,
              } as StoredChat
            }
          }

          if (downloadedChat) {
            downloadedChat.createdAt = ensureValidISODate(
              downloadedChat.createdAt,
              downloadedChat.id,
            )
            downloadedChat.updatedAt = ensureValidISODate(
              downloadedChat.updatedAt ?? downloadedChat.createdAt,
              downloadedChat.id,
            )
            downloadedChat.lastAccessedAt = Date.now()
            downloadedChat.syncedAt = Date.now()
            downloadedChat.locallyModified = false
            downloadedChat.projectId = projectId // Always ensure projectId is set

            await indexedDBStorage.saveChat(downloadedChat)
            await indexedDBStorage.markAsSynced(
              downloadedChat.id,
              downloadedChat.syncVersion || 0,
            )
            savedIds.push(downloadedChat.id)
            result.downloaded++
          }
        } catch (error) {
          result.errors.push(
            `Failed to process project chat ${remoteChat.id}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }

      if (savedIds.length > 0) {
        chatEvents.emit({ reason: 'sync', ids: savedIds })
      }

      logInfo('Project chat sync complete', {
        component: 'CloudSync',
        action: 'syncProjectChats',
        metadata: {
          projectId,
          downloaded: result.downloaded,
          errors: result.errors.length,
        },
      })

      // Update cached sync status after successful sync
      try {
        const newStatus =
          await projectStorage.getProjectChatsSyncStatus(projectId)
        this.saveProjectSyncStatus(projectId, newStatus)
      } catch (statusError) {
        logError(
          'Failed to update project sync status after full sync',
          statusError,
          {
            component: 'CloudSync',
            action: 'syncProjectChats',
            metadata: { projectId },
          },
        )
      }
    } catch (error) {
      result.errors.push(
        `Failed to sync project chats: ${error instanceof Error ? error.message : String(error)}`,
      )
      logError('Failed to sync project chats', error, {
        component: 'CloudSync',
        action: 'syncProjectChats',
        metadata: { projectId },
      })
    }

    return result
  }

  /**
   * Perform a delta sync for project chats - only fetch chats that changed since last sync.
   */
  async syncProjectChatsChanged(projectId: string): Promise<SyncResult> {
    const result: SyncResult = {
      uploaded: 0,
      downloaded: 0,
      errors: [],
    }

    if (!(await cloudStorage.isAuthenticated())) {
      return result
    }

    try {
      // First, backup any unsynced local project chats
      const unsyncedChats = await indexedDBStorage.getUnsyncedChats()
      const projectChatsToSync = unsyncedChats.filter(
        (chat) =>
          chat.projectId === projectId &&
          !(chat as any).isBlankChat &&
          !streamingTracker.isStreaming(chat.id) &&
          !chat.isLocalOnly,
      )

      for (const chat of projectChatsToSync) {
        try {
          await this.backupChat(chat.id)
          result.uploaded++
        } catch (error) {
          result.errors.push(
            `Failed to backup project chat ${chat.id}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }

      // Get cached sync status to determine what changed
      const cachedStatus =
        this.projectSyncStatus.get(projectId) ||
        this.loadCachedProjectSyncStatus(projectId)

      if (!cachedStatus?.lastUpdated) {
        // No cached status, fall back to full sync
        return await this.syncProjectChats(projectId)
      }

      // Fetch only chats updated since our last sync
      let updatedChats
      try {
        updatedChats = await projectStorage.getProjectChatsUpdatedSince(
          projectId,
          { since: cachedStatus.lastUpdated },
        )
      } catch (error) {
        logError(
          'Failed to get updated project chats, falling back to full sync',
          error,
          {
            component: 'CloudSync',
            action: 'syncProjectChatsChanged',
            metadata: { projectId },
          },
        )
        return await this.syncProjectChats(projectId)
      }

      const remoteChats = updatedChats.chats || []

      if (remoteChats.length === 0) {
        logInfo('No project chats updated since last sync', {
          component: 'CloudSync',
          action: 'syncProjectChatsChanged',
          metadata: { projectId, since: cachedStatus.lastUpdated },
        })
        // Update the cached status
        try {
          const newStatus =
            await projectStorage.getProjectChatsSyncStatus(projectId)
          this.saveProjectSyncStatus(projectId, newStatus)
        } catch (statusError) {
          logError('Failed to update project sync status', statusError, {
            component: 'CloudSync',
            action: 'syncProjectChatsChanged',
            metadata: { projectId },
          })
        }
        return result
      }

      logInfo(`Syncing ${remoteChats.length} changed project chats`, {
        component: 'CloudSync',
        action: 'syncProjectChatsChanged',
        metadata: { projectId, since: cachedStatus.lastUpdated },
      })

      // Initialize encryption service once before processing
      await encryptionService.initialize()

      // Process updated remote chats
      const savedIds: string[] = []
      for (const remoteChat of remoteChats) {
        // Skip if this chat was recently deleted
        if (deletedChatsTracker.isDeleted(remoteChat.id)) {
          continue
        }

        try {
          let downloadedChat: StoredChat | null = null

          if (remoteChat.content) {
            const encrypted = JSON.parse(remoteChat.content)

            try {
              const decrypted = await encryptionService.decrypt(encrypted)
              downloadedChat = {
                ...decrypted,
                projectId,
              } as StoredChat
            } catch (decryptError) {
              const isCorrupted =
                decryptError instanceof Error &&
                decryptError.message.includes('DATA_CORRUPTED')

              // Preserve projectId from local chat if it exists
              const localChat = await indexedDBStorage.getChat(remoteChat.id)

              downloadedChat = {
                id: remoteChat.id,
                title: 'Encrypted',
                messages: [],
                createdAt: ensureValidISODate(
                  remoteChat.createdAt,
                  remoteChat.id,
                ),
                updatedAt: ensureValidISODate(
                  remoteChat.updatedAt ?? remoteChat.createdAt,
                  remoteChat.id,
                ),
                lastAccessedAt: Date.now(),
                decryptionFailed: true,
                dataCorrupted: isCorrupted,
                encryptedData: remoteChat.content,
                syncedAt: Date.now(),
                locallyModified: false,
                syncVersion: 1,
                projectId: localChat?.projectId || projectId,
              } as StoredChat
            }
          }

          if (downloadedChat) {
            downloadedChat.createdAt = ensureValidISODate(
              downloadedChat.createdAt,
              downloadedChat.id,
            )
            downloadedChat.updatedAt = ensureValidISODate(
              downloadedChat.updatedAt ?? downloadedChat.createdAt,
              downloadedChat.id,
            )
            downloadedChat.lastAccessedAt = Date.now()
            downloadedChat.syncedAt = Date.now()
            downloadedChat.locallyModified = false
            downloadedChat.projectId = projectId

            await indexedDBStorage.saveChat(downloadedChat)
            await indexedDBStorage.markAsSynced(
              downloadedChat.id,
              downloadedChat.syncVersion || 0,
            )
            savedIds.push(downloadedChat.id)
            result.downloaded++
          }
        } catch (error) {
          result.errors.push(
            `Failed to process project chat ${remoteChat.id}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }

      if (savedIds.length > 0) {
        chatEvents.emit({ reason: 'sync', ids: savedIds })
      }

      // Update cached sync status
      try {
        const newStatus =
          await projectStorage.getProjectChatsSyncStatus(projectId)
        this.saveProjectSyncStatus(projectId, newStatus)
      } catch (statusError) {
        logError('Failed to update project sync status', statusError, {
          component: 'CloudSync',
          action: 'syncProjectChatsChanged',
          metadata: { projectId },
        })
      }
    } catch (error) {
      result.errors.push(
        `Project chat sync failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    return result
  }
}

export const cloudSync = new CloudSyncService()
