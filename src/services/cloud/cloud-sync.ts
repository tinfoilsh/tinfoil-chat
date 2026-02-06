import { PAGINATION } from '@/config'
import { ensureValidISODate } from '@/utils/chat-timestamps'
import { logError, logInfo } from '@/utils/error-handling'
import { encryptionService } from '../encryption/encryption-service'
import { chatEvents } from '../storage/chat-events'
import { deletedChatsTracker } from '../storage/deleted-chats-tracker'
import { indexedDBStorage, type StoredChat } from '../storage/indexed-db'
import { processRemoteChat } from './chat-codec'
import { cloudStorage, type ChatSyncStatus } from './cloud-storage'
import { projectStorage } from './project-storage'
import { streamingTracker } from './streaming-tracker'
import { isUploadableChat, shouldIngestRemoteChat } from './sync-predicates'
import { UploadCoalescer } from './upload-coalescer'

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

const UPLOAD_BASE_DELAY_MS = 1000
const UPLOAD_MAX_DELAY_MS = 8000
const UPLOAD_MAX_RETRIES = 3

const isStreaming = (id: string) => streamingTracker.isStreaming(id)

export class CloudSyncService {
  private syncLock: Promise<void> | null = null
  private syncLockResolve: (() => void) | null = null
  private uploadCoalescer: UploadCoalescer
  private streamingCallbacks: Set<string> = new Set()
  private lastSyncStatus: ChatSyncStatus | null = null
  private projectSyncStatus: Map<string, ChatSyncStatus> = new Map()

  constructor() {
    // Initialize upload coalescer with doBackupChat as the upload function
    this.uploadCoalescer = new UploadCoalescer(
      (chatId) => this.doBackupChat(chatId),
      {
        baseDelayMs: UPLOAD_BASE_DELAY_MS,
        maxDelayMs: UPLOAD_MAX_DELAY_MS,
        maxRetries: UPLOAD_MAX_RETRIES,
      },
    )
    // Listen for storage changes from other tabs to invalidate sync status cache
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === SYNC_STATUS_STORAGE_KEY) {
          // Another tab updated sync status, invalidate our cache
          this.lastSyncStatus = null
        } else if (e.key?.startsWith(PROJECT_SYNC_STATUS_STORAGE_KEY_PREFIX)) {
          // Another tab updated project sync status, invalidate that project's cache
          const projectId = e.key.slice(
            PROJECT_SYNC_STATUS_STORAGE_KEY_PREFIX.length,
          )
          this.projectSyncStatus.delete(projectId)
        }
      })
    }
  }

  /**
   * Execute a function with sync lock protection.
   * Only one sync operation can run at a time.
   * Returns null if a sync is already in progress.
   */
  private async withSyncLock<T>(
    fn: () => Promise<T>,
  ): Promise<{ result: T; skipped: false } | { result: null; skipped: true }> {
    // Check if sync is already in progress (atomic check)
    if (this.syncLock) {
      logInfo('[CloudSync] Sync already in progress, skipping', {
        component: 'CloudSync',
        action: 'withSyncLock',
      })
      return { result: null, skipped: true }
    }

    // Acquire lock
    let resolve: () => void
    this.syncLock = new Promise<void>((r) => {
      resolve = r
    })
    this.syncLockResolve = resolve!

    try {
      const result = await fn()
      return { result, skipped: false }
    } finally {
      // Release lock
      this.syncLock = null
      if (this.syncLockResolve) {
        this.syncLockResolve()
        this.syncLockResolve = null
      }
    }
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
        // Use centralized predicate for upload eligibility
        return isUploadableChat(chat, isStreaming)
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
    const lockResult = await this.withSyncLock(() => this.doSyncChangedChats())

    if (lockResult.skipped) {
      throw new Error('Sync already in progress')
    }

    return lockResult.result
  }

  private async doSyncChangedChats(): Promise<SyncResult> {
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
        return await this.doSyncAllChats()
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
        return await this.doSyncAllChats()
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
            // Use centralized chat codec for decryption/placeholder logic
            const localChat = await indexedDBStorage.getChat(remoteChat.id)
            const codecResult = await processRemoteChat(remoteChat, {
              localChat,
            })
            downloadedChat = codecResult.chat
          } else {
            // No inline content - fetch via downloadChat (handles its own decryption)
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

  // Backup a single chat to the cloud with coalescing and retry
  async backupChat(chatId: string): Promise<void> {
    // Don't attempt backup if not authenticated
    if (!(await cloudStorage.isAuthenticated())) {
      return
    }

    // Use the upload coalescer - it handles:
    // - Coalescing rapid edits into a single upload
    // - Exponential backoff retry on failure
    // - Proper concurrency control per chat
    this.uploadCoalescer.enqueue(chatId)
  }

  /**
   * Wait for a specific chat's upload to complete.
   * Useful for testing and ensuring uploads complete before proceeding.
   */
  async waitForUpload(chatId: string): Promise<void> {
    await this.uploadCoalescer.waitForUpload(chatId)
  }

  /**
   * Wait for all pending uploads to complete.
   * Useful for testing and cleanup.
   */
  async waitForAllUploads(): Promise<void> {
    await this.uploadCoalescer.waitForAllUploads()
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
          // Re-trigger the backup after streaming ends.
          // Errors are handled internally by the upload coalescer.
          this.backupChat(chatId)
        })

        return
      }

      const chat = await indexedDBStorage.getChat(chatId)
      if (!chat) {
        return // Chat might have been deleted
      }

      // Use centralized predicate for upload eligibility
      // Note: streaming is checked here AND after potential delay
      if (!isUploadableChat(chat, isStreaming)) {
        logInfo('Skipping sync for ineligible chat', {
          component: 'CloudSync',
          action: 'backupChat',
          metadata: {
            chatId,
            isBlankChat: (chat as any).isBlankChat,
            isLocalOnly: chat.isLocalOnly,
            decryptionFailed: chat.decryptionFailed,
            hasEncryptedData: !!chat.encryptedData,
          },
        })
        return
      }

      // Double-check streaming status right before upload (in case it started during async ops)
      if (streamingTracker.isStreaming(chatId)) {
        logInfo('Chat started streaming during backup process, aborting sync', {
          component: 'CloudSync',
          action: 'backupChat',
          metadata: { chatId },
        })
        return
      }

      await cloudStorage.uploadChat(chat)

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

      // Use centralized predicate for upload eligibility
      // Note: temp ID chats are allowed - uploadChat will generate server IDs for them
      // IMPORTANT: Never upload chats that failed to decrypt - they are placeholders with empty
      // messages that would overwrite real encrypted data on the server
      const chatsToSync = unsyncedChats.filter((chat) =>
        isUploadableChat(chat, isStreaming),
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

          await cloudStorage.uploadChat(chat)

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
    const lockResult = await this.withSyncLock(() => this.doSyncAllChats())

    if (lockResult.skipped) {
      throw new Error('Sync already in progress')
    }

    return lockResult.result
  }

  private async doSyncAllChats(): Promise<SyncResult> {
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

        // Use centralized predicate to determine if we should ingest this remote chat
        if (shouldIngestRemoteChat(remoteChat, localChat)) {
          try {
            let downloadedChat: StoredChat | null = null

            if (remoteChat.content) {
              // Use centralized chat codec for decryption/placeholder logic
              const codecResult = await processRemoteChat(remoteChat, { localChat })
              downloadedChat = codecResult.chat
            } else {
              // No inline content - fetch via downloadChat (handles its own decryption)
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
    }

    return result
  }

  /**
   * Smart sync: check status first and only sync if needed.
   * @param projectId - Optional project ID. If provided, syncs project chats.
   */
  async smartSync(projectId?: string): Promise<SyncResult> {
    // Note: smartSync doesn't need its own lock because it delegates to
    // syncChangedChats/syncAllChats/syncProjectChats which have their own locks
    if (this.syncLock) {
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
    return this.syncLock !== null
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
          // Use centralized chat codec for decryption/placeholder logic
          const result = await processRemoteChat(remoteChat)
          return result.chat
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
          // Use centralized predicate for upload eligibility
          // Note: No streaming check needed here since we're processing all chats in sequence
          if (!isUploadableChat(chat)) {
            if (
              chat.isLocalOnly ||
              chat.decryptionFailed ||
              chat.encryptedData
            ) {
              logInfo('Skipping ineligible chat during re-encryption', {
                component: 'CloudSync',
                action: 'reencryptAndUploadChats',
                metadata: {
                  chatId: chat.id,
                  isLocalOnly: chat.isLocalOnly,
                  isBlankChat: (chat as any).isBlankChat,
                  decryptionFailed: chat.decryptionFailed,
                  hasEncryptedData: !!chat.encryptedData,
                  dataCorrupted: chat.dataCorrupted,
                },
              })
            }
            continue
          }

          // For encrypted chats, they need to be decrypted first (handled by isUploadableChat above)
          // For decrypted chats, we can directly work with them
          let chatToReencrypt = chat

          // Re-encrypt the chat with the new key by forcing a sync
          // The sync process will automatically encrypt with the current key
          if (await cloudStorage.isAuthenticated()) {
            // Increment sync version to force upload
            chatToReencrypt.syncVersion = (chatToReencrypt.syncVersion || 0) + 1

            // Save locally with new sync version
            await indexedDBStorage.saveChat(chatToReencrypt)

            // Upload to cloud (will be encrypted with new key)
            await cloudStorage.uploadChat(chatToReencrypt)

            await indexedDBStorage.markAsSynced(
              chatToReencrypt.id,
              chatToReencrypt.syncVersion || 0,
            )
            result.uploaded++
            result.reencrypted++

            logInfo('Chat re-encrypted and uploaded', {
              component: 'CloudSync',
              action: 'reencryptAndUploadChats',
              metadata: {
                chatId: chatToReencrypt.id,
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
            // Use centralized chat codec for decryption/placeholder logic
            const result = await processRemoteChat(remoteChat)
            chat = result.chat
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
            // Mark as loaded via pagination for local sort heuristics
            chat.loadedAt = Date.now()

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
    const lockResult = await this.withSyncLock(() =>
      this.doSyncProjectChats(projectId),
    )

    if (lockResult.skipped) {
      throw new Error('Sync already in progress')
    }

    return lockResult.result
  }

  private async doSyncProjectChats(projectId: string): Promise<SyncResult> {
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

        // Use centralized predicate to determine if we should ingest this remote chat
        if (!shouldIngestRemoteChat(remoteChat, localChat)) {
          continue
        }

        try {
          let downloadedChat: StoredChat | null = null

          if (remoteChat.content) {
            // Use centralized chat codec for decryption/placeholder logic
            const codecResult = await processRemoteChat(remoteChat, {
              localChat,
              projectId,
            })
            downloadedChat = codecResult.chat
          }

          if (downloadedChat) {
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
    const lockResult = await this.withSyncLock(() =>
      this.doSyncProjectChatsChanged(projectId),
    )

    if (lockResult.skipped) {
      throw new Error('Sync already in progress')
    }

    return lockResult.result
  }

  private async doSyncProjectChatsChanged(
    projectId: string,
  ): Promise<SyncResult> {
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
          chat.projectId === projectId && isUploadableChat(chat, isStreaming),
      )

      for (const chat of projectChatsToSync) {
        try {
          // Call doBackupChat directly (not via coalescer) so we can
          // await completion and accurately track upload results
          await this.doBackupChat(chat.id)
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
        return await this.doSyncProjectChats(projectId)
      }

      // Initialize encryption service once before processing
      await encryptionService.initialize()

      // Fetch and process chats updated since our last sync, with pagination
      const savedIds: string[] = []
      let cursorId: string | undefined
      let hasMore = true
      let isFirstPage = true

      while (hasMore) {
        let updatedChats
        try {
          updatedChats = await projectStorage.getProjectChatsUpdatedSince(
            projectId,
            { since: cachedStatus.lastUpdated, cursorId },
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
          return await this.doSyncProjectChats(projectId)
        }

        const remoteChats = updatedChats.chats || []

        if (isFirstPage && remoteChats.length === 0) {
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

        if (isFirstPage) {
          logInfo(`Syncing changed project chats`, {
            component: 'CloudSync',
            action: 'syncProjectChatsChanged',
            metadata: {
              projectId,
              since: cachedStatus.lastUpdated,
              firstPageCount: remoteChats.length,
              hasMore: updatedChats.hasMore,
            },
          })
        }
        isFirstPage = false

        // Process this page of remote chats
        for (const remoteChat of remoteChats) {
          // Skip if this chat was recently deleted
          if (deletedChatsTracker.isDeleted(remoteChat.id)) {
            continue
          }

          try {
            let downloadedChat: StoredChat | null = null

            if (remoteChat.content) {
              // Fetch local chat for project ID preservation
              const localChat = await indexedDBStorage.getChat(remoteChat.id)

              // Use centralized chat codec for decryption/placeholder logic
              const codecResult = await processRemoteChat(remoteChat, {
                localChat,
                projectId,
              })
              downloadedChat = codecResult.chat
            }

            if (downloadedChat) {
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

        // Check if there are more pages
        hasMore = updatedChats.hasMore === true
        cursorId = updatedChats.nextCursor
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
