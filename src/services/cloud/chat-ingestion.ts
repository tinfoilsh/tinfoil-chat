/**
 * Chat Ingestion
 *
 * Shared helpers for processing batches of remote chats into local IndexedDB storage.
 * Extracts the repeated "check deleted -> decode -> save -> mark synced" loop that
 * appears in every sync method.
 */

import { logError } from '@/utils/error-handling'
import { chatEvents, type ChatChangeReason } from '../storage/chat-events'
import { deletedChatsTracker } from '../storage/deleted-chats-tracker'
import { indexedDBStorage, type StoredChat } from '../storage/indexed-db'
import {
  processRemoteChat,
  type ProcessRemoteChatOptions,
  type RemoteChatData,
} from './chat-codec'
import { cloudStorage } from './cloud-storage'
import { shouldIngestRemoteChat } from './sync-predicates'

/**
 * A remote chat from any API response that carries at least an id.
 * The enclave only ever returns plaintext v2 rows. `content` carries
 * that plaintext when present; otherwise the ingestion loop fetches
 * it via `cloudStorage.fetchRawChatContent`. `createdAt` is optional
 * because the list-status surface only emits `updated_at` — the
 * codec derives `createdAt` from the reverse-timestamp encoded in
 * `id` when needed.
 */
export interface RemoteChatEntry {
  id: string
  content?: string | null
  createdAt?: string
  updatedAt?: string
  syncVersion?: number
}

export interface IngestOptions {
  /** Pre-built map of local chats by ID. If omitted, each chat is fetched individually. */
  localChatMap?: Map<string, StoredChat>
  /** Project ID to associate with ingested chats */
  projectId?: string
  /** When true, call shouldIngestRemoteChat to skip chats that are already up-to-date locally */
  checkShouldIngest?: boolean
  /** When true, skip chats that appear in the deleted-chats tracker */
  skipDeleted?: boolean
  /** When true, fetch raw content from the server for chats without inline content */
  fetchMissingContent?: boolean
  /** When true, stamp chat.loadedAt = Date.now() (used by pagination) */
  setLoadedAt?: boolean
  /** Event reason emitted via chatEvents when chats are saved */
  eventReason?: ChatChangeReason
  /**
   * Last-write-wins conflict resolution (§C5): write the remote chat
   * even if the local copy is `locallyModified` or moved since the
   * snapshot. Default false enforces the §H6 CAS so routine ingest
   * never silently overwrites in-progress local edits.
   */
  forceOverwriteLocal?: boolean
}

export interface IngestResult {
  savedIds: string[]
  downloaded: number
  errors: string[]
}

/**
 * Process a batch of remote chats: decode, save to IndexedDB, and mark as synced.
 *
 * This is the shared core of every sync method's "download loop". Variations are
 * controlled via IngestOptions.
 */
export async function ingestRemoteChats(
  remoteChats: RemoteChatEntry[],
  options: IngestOptions = {},
): Promise<IngestResult> {
  const ingestStartedAt = Date.now()
  const {
    localChatMap,
    projectId,
    checkShouldIngest = false,
    skipDeleted = true,
    fetchMissingContent = false,
    setLoadedAt = false,
    eventReason = 'sync',
    forceOverwriteLocal = false,
  } = options

  console.log('[v2-launch] ingestRemoteChats: start', {
    remoteCount: remoteChats.length,
    projectId: projectId ?? null,
    forceOverwriteLocal,
    fetchMissingContent,
    checkShouldIngest,
  })

  const result: IngestResult = {
    savedIds: [],
    downloaded: 0,
    errors: [],
  }

  for (const remoteChat of remoteChats) {
    // Skip recently deleted chats
    if (skipDeleted && deletedChatsTracker.isDeleted(remoteChat.id)) {
      console.log('[v2-launch] ingestRemoteChats: skip (deleted)', {
        chatId: remoteChat.id,
      })
      continue
    }

    // Optionally check if we should ingest (skip if local copy is already up-to-date)
    const localChat = localChatMap
      ? (localChatMap.get(remoteChat.id) ?? null)
      : await indexedDBStorage.getChat(remoteChat.id)

    if (
      !forceOverwriteLocal &&
      checkShouldIngest &&
      !shouldIngestRemoteChat(remoteChat, localChat)
    ) {
      console.log('[v2-launch] ingestRemoteChats: skip (local up-to-date)', {
        chatId: remoteChat.id,
        localSyncVersion: localChat?.syncVersion ?? null,
        remoteSyncVersion: remoteChat.syncVersion ?? null,
      })
      continue
    }

    try {
      const codecInput: RemoteChatData = {
        id: remoteChat.id,
        createdAt: remoteChat.createdAt,
        updatedAt: remoteChat.updatedAt,
        formatVersion: 2,
        syncVersion: remoteChat.syncVersion,
      }

      if (remoteChat.content) {
        codecInput.plaintext = remoteChat.content
      } else if (fetchMissingContent) {
        console.log('[v2-launch] ingestRemoteChats: fetching raw content', {
          chatId: remoteChat.id,
        })
        const fetched = await cloudStorage.fetchRawChatContent(remoteChat.id)
        if (fetched) {
          codecInput.plaintext = fetched.plaintext
          codecInput.syncVersion = fetched.syncVersion
        }
      }

      if (!codecInput.plaintext) {
        console.log('[v2-launch] ingestRemoteChats: skip (no plaintext)', {
          chatId: remoteChat.id,
        })
        continue
      }

      const codecOptions: ProcessRemoteChatOptions = { localChat }
      if (projectId) {
        codecOptions.projectId = projectId
      }

      const codecResult = await processRemoteChat(codecInput, codecOptions)
      const chat = codecResult.chat

      if (chat) {
        // §H6 CAS: only apply the remote write when the on-disk row
        // still matches the snapshot we observed. `forceOverwriteLocal`
        // bypasses the CAS for conflict resolution (§C5 last-write-wins).
        const expectedLocalUpdatedAt = forceOverwriteLocal
          ? undefined
          : (localChat?.updatedAt ?? null)
        const applyResult = await indexedDBStorage.applyRemoteChatIfFresh({
          chat,
          syncVersion: chat.syncVersion ?? 0,
          expectedLocalUpdatedAt,
          setLoadedAt,
        })
        if (applyResult.applied) {
          console.log('[v2-launch] ingestRemoteChats: applied remote chat', {
            chatId: chat.id,
            syncVersion: chat.syncVersion ?? 0,
            messageCount: chat.messages?.length ?? 0,
          })
          result.savedIds.push(chat.id)
          result.downloaded++
        } else {
          console.log(
            '[v2-launch] ingestRemoteChats: CAS rejected (local newer)',
            { chatId: chat.id },
          )
        }
      }
    } catch (error) {
      console.log('[v2-launch] ingestRemoteChats: per-chat FAILED', {
        chatId: remoteChat.id,
        error: error instanceof Error ? error.message : String(error),
      })
      result.errors.push(
        `Failed to process chat ${remoteChat.id}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  if (result.savedIds.length > 0) {
    chatEvents.emit({ reason: eventReason, ids: result.savedIds })
  }

  console.log('[v2-launch] ingestRemoteChats: done', {
    elapsedMs: Date.now() - ingestStartedAt,
    downloaded: result.downloaded,
    savedCount: result.savedIds.length,
    errors: result.errors.length,
  })
  return result
}

/**
 * Delete local chats that were deleted remotely since the given timestamp.
 * Emits a chat event if any chats were deleted.
 */
export async function syncRemoteDeletions(
  since: string,
  logAction: string,
): Promise<void> {
  console.log('[v2-launch] syncRemoteDeletions: start', { since, logAction })
  try {
    const { deletedIds } = await cloudStorage.getDeletedChatsSince(since)
    console.log('[v2-launch] syncRemoteDeletions: server returned', {
      deletedCount: deletedIds.length,
      deletedIds: deletedIds.slice(0, 20),
    })
    const successfulIds: string[] = []
    for (const id of deletedIds) {
      try {
        const localChat = await indexedDBStorage.getChat(id)
        if (localChat?.isLocalOnly) {
          continue
        }

        await indexedDBStorage.deleteChat(id)
        // Mirror the deletion into the in-memory tracker so any concurrent
        // listing/ingest pass that already observed the chat won't bring
        // it back into IndexedDB before the next deletion sync runs.
        deletedChatsTracker.markAsDeleted(id)
        successfulIds.push(id)
      } catch (error) {
        logError(
          `Failed to delete chat ${id} during remote deletion sync`,
          error,
          {
            component: 'CloudSync',
            action: logAction,
          },
        )
      }
    }
    if (successfulIds.length > 0) {
      chatEvents.emit({ reason: 'sync', ids: successfulIds })
    }
    console.log('[v2-launch] syncRemoteDeletions: done', {
      successfullyDeleted: successfulIds.length,
    })
  } catch (error) {
    console.log('[v2-launch] syncRemoteDeletions: FAILED', {
      error: error instanceof Error ? error.message : String(error),
    })
    logError('Failed to check for remotely deleted chats', error, {
      component: 'CloudSync',
      action: logAction,
    })
  }
}
