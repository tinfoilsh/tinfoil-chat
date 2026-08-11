import type { Chat } from '@/components/chat/types'
import { AUTH_ACTIVE_USER_ID } from '@/constants/storage-keys'
import { isCloudSyncEnabled } from '@/utils/cloud-sync-settings'
import { logError, logInfo } from '@/utils/error-handling'
import { cloudStorage } from '../cloud/cloud-storage'
import { cloudSync } from '../cloud/cloud-sync'
import { streamingTracker } from '../cloud/streaming-tracker'
import { newIdempotencyKey } from '../sync-enclave/sync-api'
import { chatEvents } from './chat-events'
import { deletedChatsTracker } from './deleted-chats-tracker'
import { indexedDBStorage, type Chat as StorageChat } from './indexed-db'

export class ChatStorageService {
  private initialized = false
  private initializePromise: Promise<void> | null = null

  private readActiveUserId(): string | null {
    try {
      return localStorage.getItem(AUTH_ACTIVE_USER_ID)
    } catch {
      return null
    }
  }

  private ensureActiveUser(userId: string): void {
    if (this.readActiveUserId() !== userId) {
      throw new Error('Cloud account changed during project deletion')
    }
  }

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
      await indexedDBStorage.initialize()
    } catch (error) {
      logError('Failed to initialize chat storage', error, {
        component: 'ChatStorageService',
        action: 'initialize',
      })
      throw error
    }
  }

  async saveChat(chat: Chat, skipCloudSync = false): Promise<Chat> {
    return (await this.saveChatInternal(chat, skipCloudSync, false)) ?? chat
  }

  async saveExistingChat(
    chat: Chat,
    skipCloudSync = false,
  ): Promise<Chat | null> {
    return this.saveChatInternal(chat, skipCloudSync, true)
  }

  private async saveChatInternal(
    chat: Chat,
    skipCloudSync: boolean,
    requireExisting: boolean,
  ): Promise<Chat | null> {
    if (deletedChatsTracker.isDeleted(chat.id)) return null
    await this.initialize()
    if (deletedChatsTracker.isDeleted(chat.id)) return null

    // Never save blank chats to storage
    if (chat.isBlankChat) {
      return chat
    }

    const chatToSave = chat

    // Save the chat. pendingSave is a transient UI flag that drives the
    // "Syncing with cloud" badge; persisting it makes the badge resurface
    // on every reload, so strip it before writing to storage.
    const { pendingSave, ...persistableChat } = chatToSave
    const storageChat: StorageChat = {
      ...persistableChat,
      createdAt:
        chatToSave.createdAt instanceof Date
          ? chatToSave.createdAt.toISOString()
          : chatToSave.createdAt,
      updatedAt: new Date().toISOString(),
      // The user's global opt-out is invariant (§9.6 R6): while cloud
      // sync is disabled, every save classifies as local-only so the
      // chat never enters the cloud write path.
      isLocalOnly: chatToSave.isLocalOnly === true || !isCloudSyncEnabled(),
    }

    const saveResult = requireExisting
      ? await indexedDBStorage.saveExistingChat(storageChat)
      : await indexedDBStorage.saveChat(storageChat)
    if (!saveResult.saved) return null
    const isLocalOnly = saveResult.isLocalOnly

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
      !isLocalOnly
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
      isLocalOnly,
      updatedAt: storageChat.updatedAt,
      createdAt:
        chatToSave.createdAt instanceof Date
          ? chatToSave.createdAt
          : new Date(chatToSave.createdAt),
    }
  }

  async saveChatAndSync(chat: Chat): Promise<Chat> {
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
      syncPending,
      syncVersion,
      decryptionFailed,
      version,
      pendingSave,
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

    const existingChat = await indexedDBStorage.getChat(id)
    const userId = localStorage.getItem(AUTH_ACTIVE_USER_ID)
    let idempotencyKey =
      existingChat?.isLocalOnly || !userId ? null : newIdempotencyKey()
    const queued =
      idempotencyKey && userId
        ? await indexedDBStorage.deleteChatWithPendingIntent(
            id,
            idempotencyKey,
            userId,
          )
        : false
    if (!idempotencyKey) {
      await indexedDBStorage.deleteChat(id)
    } else if (!queued) {
      idempotencyKey = null
    }
    chatEvents.emit({ reason: 'delete', ids: [id] })

    // Also delete from cloud storage (non-blocking)
    if (!idempotencyKey) return
    cloudSync.deleteFromCloud(id, idempotencyKey).catch((error: unknown) => {
      logError('Failed to delete chat from cloud', error, {
        component: 'ChatStorageService',
        action: 'deleteChat',
        metadata: { chatId: id },
      })
    })
  }

  async deleteChatsByProject(projectId: string): Promise<number> {
    const userId = this.readActiveUserId()
    if (!userId) {
      throw new Error('Authenticated user ID is unavailable')
    }
    await this.initialize()
    this.ensureActiveUser(userId)

    // Delete locally and tombstone the ids before touching the cloud. An
    // in-flight backup re-reads the chat from local storage right before
    // uploading, so removing the local row first stops a concurrent upload
    // from resurrecting a chat in the cloud after the bulk delete. This
    // mirrors the ordering used by the single-chat deleteChat path.
    this.ensureActiveUser(userId)
    const remoteIds = await cloudStorage.listChatIdsByProject(projectId)
    this.ensureActiveUser(userId)
    await cloudSync.waitForAllUploads()
    this.ensureActiveUser(userId)

    const deletedIds = await indexedDBStorage.deleteChatsByProject(
      projectId,
      remoteIds,
      userId,
      newIdempotencyKey,
      () => this.readActiveUserId() === userId,
    )
    this.ensureActiveUser(userId)

    for (const id of deletedIds) deletedChatsTracker.markAsDeleted(id)

    if (deletedIds.length > 0) {
      chatEvents.emit({ reason: 'delete', ids: deletedIds })
    }

    try {
      this.ensureActiveUser(userId)
      await cloudStorage.deleteChatsByProject(projectId)
      this.ensureActiveUser(userId)
      await indexedDBStorage.acknowledgePendingDeletes(
        deletedIds,
        userId,
        () => this.readActiveUserId() === userId,
      )
      this.ensureActiveUser(userId)
    } catch (error) {
      logError('Failed to delete every remote project chat', error, {
        component: 'ChatStorageService',
        action: 'deleteChatsByProject.remoteDelete',
        metadata: { projectId },
      })
      throw error
    }

    logInfo(`Deleted ${deletedIds.length} chats for project`, {
      component: 'ChatStorageService',
      action: 'deleteChatsByProject',
      metadata: { projectId, count: deletedIds.length },
    })

    return deletedIds.length
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

  async deleteAllChats(): Promise<{
    localDeleted: number
    cloudDeleted: number
    notificationSent: boolean
  }> {
    await this.initialize()

    // Snapshot local IDs up front so we know what to mark as deleted in the
    // tracker after a successful wipe, but don't mark anything yet — if the
    // cloud delete fails we must leave sync state untouched, otherwise we'd
    // tombstone chats that still exist on the server and lose them on the
    // next pull.
    const localIds = await indexedDBStorage.getAllChatIds()

    // Attempt the cloud bulk-delete first. If it fails, surface the error
    // and skip both the tracker update and the local wipe so the user can
    // retry without partial-deletion side effects.
    let cloudDeleted = 0
    let notificationSent = false
    if (await cloudStorage.isAuthenticated()) {
      try {
        const result = await cloudStorage.deleteAllChats()
        cloudDeleted = result.deleted
        notificationSent = result.notificationSent ?? false
      } catch (error) {
        logError('Failed to bulk-delete cloud chats', error, {
          component: 'ChatStorageService',
          action: 'deleteAllChats',
        })
        throw error
      }
    }

    // Cloud delete succeeded (or user is anonymous); now it's safe to
    // tombstone the IDs locally and wipe IndexedDB.
    for (const id of localIds) {
      if (id) deletedChatsTracker.markAsDeleted(id)
    }

    const localDeleted = await indexedDBStorage.deleteAllChats()
    chatEvents.emit({ reason: 'delete', ids: [] })

    logInfo('Deleted all chats', {
      component: 'ChatStorageService',
      action: 'deleteAllChats',
      metadata: { localDeleted, cloudDeleted },
    })

    return { localDeleted, cloudDeleted, notificationSent }
  }

  async getAllChats(): Promise<Chat[]> {
    await this.initialize()

    const storedChats = await indexedDBStorage.getAllChats()
    // Convert StoredChat[] to Chat[], keeping syncedAt for UI display
    return storedChats.map(
      ({
        lastAccessedAt,
        locallyModified,
        syncPending,
        syncVersion,
        decryptionFailed,
        version,
        pendingSave,
        ...baseChat
      }) => ({
        ...baseChat,
        createdAt: new Date(baseChat.createdAt),
        syncedAt: baseChat.syncedAt,
      }),
    )
  }

  async getChatCount(): Promise<number> {
    await this.initialize()
    return indexedDBStorage.getChatCount()
  }

  async getAllChatsWithSyncStatus(): Promise<Chat[]> {
    await this.initialize()

    const storedChats = await indexedDBStorage.getAllChats()
    // Convert StoredChat[] to Chat[] but preserve sync metadata
    return storedChats.map(
      ({
        lastAccessedAt,
        syncPending,
        syncVersion,
        version,
        pendingSave,
        ...chatWithSyncData
      }) => ({
        ...chatWithSyncData,
        createdAt: new Date(chatWithSyncData.createdAt),
      }),
    )
  }

  async getChatSummariesWithSyncStatus(): Promise<Chat[]> {
    await this.initialize()

    const storedChats = await indexedDBStorage.getChatSummaries()
    return storedChats.map(
      ({
        lastAccessedAt,
        syncPending,
        syncVersion,
        version,
        pendingSave,
        ...chatWithSyncData
      }) => ({
        ...chatWithSyncData,
        createdAt: new Date(chatWithSyncData.createdAt),
      }),
    )
  }

  async convertChatToCloud(chatId: string): Promise<void> {
    await this.initialize()

    const existingChat = await indexedDBStorage.getChat(chatId)
    if (!existingChat) {
      throw new Error('Chat not found')
    }

    await indexedDBStorage.resetChatTimestamps(chatId)
    await indexedDBStorage.updateChatLocalOnly(chatId, false)

    try {
      await cloudSync.backupChatNow(chatId, { restoreDeleted: true })
    } catch (error) {
      await indexedDBStorage.saveChat(existingChat)
      throw error
    }

    chatEvents.emit({ reason: 'save', ids: [chatId] })
  }

  async convertChatToLocal(chatId: string): Promise<void> {
    await this.initialize()

    const existingChat = await indexedDBStorage.getChat(chatId)
    if (!existingChat) {
      throw new Error('Chat not found')
    }

    await indexedDBStorage.resetChatTimestamps(chatId)
    await indexedDBStorage.updateChatLocalOnly(chatId, true)
    await indexedDBStorage.updateChatProject(chatId, null)

    const userId = localStorage.getItem(AUTH_ACTIVE_USER_ID)
    const idempotencyKey = newIdempotencyKey()
    if (userId) {
      await indexedDBStorage.enqueuePendingDelete(
        chatId,
        idempotencyKey,
        userId,
      )
    }
    try {
      await cloudSync.deleteFromCloud(chatId, idempotencyKey)
    } catch (error) {
      // Plain saves treat local-only as sticky, so restore the original
      // classification explicitly before rewriting the pre-conversion row.
      await indexedDBStorage.updateChatLocalOnly(
        chatId,
        existingChat.isLocalOnly === true,
      )
      await indexedDBStorage.saveChat(existingChat)
      logError(
        'Failed to delete chat from cloud during local conversion',
        error,
        {
          component: 'ChatStorageService',
          action: 'convertChatToLocal',
          metadata: { chatId },
        },
      )
      throw error
    }

    chatEvents.emit({ reason: 'save', ids: [chatId] })
  }

  async removeChatFromProject(chatId: string): Promise<void> {
    await this.initialize()

    await indexedDBStorage.resetChatTimestamps(chatId)
    await indexedDBStorage.updateChatProject(chatId, null)

    chatEvents.emit({ reason: 'save', ids: [chatId] })

    // Update server-side project association, then re-upload the full encrypted blob
    await cloudSync.updateChatProject(chatId, null)
    await cloudSync.backupChat(chatId)
  }
}

export const chatStorage = new ChatStorageService()
