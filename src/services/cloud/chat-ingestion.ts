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
import { indexedDBStorage, type ChatSyncMetadata } from '../storage/indexed-db'
import {
  processRemoteChat,
  type ProcessRemoteChatOptions,
  type RemoteChatData,
} from './chat-codec'
import {
  advanceChatDeletesWatermark,
  loadChatDeletesWatermark,
} from './chat-deletes-watermark'
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
  localChatMap?: Map<string, ChatSyncMetadata>
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
  /** Abort before local mutations when the owning account generation changed. */
  isCurrent?: () => boolean
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
  const {
    localChatMap,
    projectId,
    checkShouldIngest = false,
    skipDeleted = true,
    fetchMissingContent = false,
    setLoadedAt = false,
    eventReason = 'sync',
    forceOverwriteLocal = false,
    isCurrent = () => true,
  } = options

  const result: IngestResult = {
    savedIds: [],
    downloaded: 0,
    errors: [],
  }

  for (const remoteChat of remoteChats) {
    if (!isCurrent()) break
    // Skip recently deleted chats
    if (skipDeleted && deletedChatsTracker.isDeleted(remoteChat.id)) {
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
        const fetched = await cloudStorage.fetchRawChatContent(remoteChat.id)
        if (fetched) {
          codecInput.plaintext = fetched.plaintext
          codecInput.syncVersion = fetched.syncVersion
        }
      }

      if (!codecInput.plaintext) {
        continue
      }

      const codecOptions: ProcessRemoteChatOptions = { localChat }
      if (projectId) {
        codecOptions.projectId = projectId
      }

      const codecResult = await processRemoteChat(codecInput, codecOptions)
      if (!isCurrent()) break
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
          isCurrent,
        })
        if (!isCurrent()) break
        if (applyResult.applied) {
          result.savedIds.push(chat.id)
          result.downloaded++
        }
      }
    } catch (error) {
      result.errors.push(
        `Failed to process chat ${remoteChat.id}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  if (result.savedIds.length > 0) {
    if (!isCurrent()) return result
    chatEvents.emit({ reason: eventReason, ids: result.savedIds })
  }

  return result
}

export interface RemoteDeletionsResult {
  /**
   * Every tombstone in the fetched window was resolved: applied locally,
   * already absent, kept as local-only, or superseded by a newer remote
   * write. Only a reconciled pass advances the durable watermark.
   */
  reconciled: boolean
  /**
   * The tombstone fetch or an application step errored. Local state cannot
   * yet be trusted against remote deletions, so callers must not upload
   * dirty chats (a re-upload would resurrect a chat deleted elsewhere).
   */
  failed: boolean
}

/**
 * Delete local chats whose remote rows carry deletion tombstones, resuming
 * from the durable deletes watermark. Emits a chat event if any chats were
 * deleted, and advances the watermark only after a fully reconciled pass so
 * a failed or interrupted pass replays the same window next time.
 */
export async function syncRemoteDeletions(
  logAction: string,
  isCurrent: () => boolean = () => true,
): Promise<RemoteDeletionsResult> {
  try {
    const since = loadChatDeletesWatermark()
    const { updates, deletes } = await cloudStorage.listChatEventsSince(since)
    if (!isCurrent()) return { reconciled: false, failed: true }

    // Newest server-side write per chat in this window. A tombstone is only
    // authoritative when no later write exists: a row re-created after its
    // tombstone (restore, or an upload that raced the delete) must survive.
    const latestUpdateAtMs = new Map<string, number>()
    let latestEventAtMs = Number.NEGATIVE_INFINITY
    for (const update of updates) {
      const ms = Date.parse(update.updatedAt)
      if (Number.isNaN(ms)) continue
      latestEventAtMs = Math.max(latestEventAtMs, ms)
      latestUpdateAtMs.set(
        update.id,
        Math.max(ms, latestUpdateAtMs.get(update.id) ?? 0),
      )
    }
    let allResolved = true
    const latestDeleteAtMs = new Map<string, number>()
    for (const del of deletes) {
      const ms = Date.parse(del.deletedAt)
      if (Number.isNaN(ms)) {
        // A tombstone whose timestamp cannot be parsed cannot be
        // arbitrated or applied. Hold the watermark behind it so the next
        // pass replays it, instead of advancing past the deletion and
        // skipping it forever. Record it in the tracker too, so ingestion
        // and the gone-row restore path won't resurrect a dirty local
        // copy while arbitration is impossible.
        deletedChatsTracker.markAsDeleted(del.id)
        allResolved = false
        continue
      }
      latestEventAtMs = Math.max(latestEventAtMs, ms)
      latestDeleteAtMs.set(
        del.id,
        Math.max(ms, latestDeleteAtMs.get(del.id) ?? 0),
      )
    }

    let failed = false
    const successfulIds: string[] = []
    for (const [id, deletedAtMs] of latestDeleteAtMs) {
      if (!isCurrent()) return { reconciled: false, failed: true }
      if ((latestUpdateAtMs.get(id) ?? 0) > deletedAtMs) {
        // The row was re-created after the tombstone; the live row wins.
        // Unblock ingestion in case an earlier pass recorded the tombstone.
        // On a same-millisecond tie deletion wins instead: a live row
        // wrongly deleted locally is re-downloaded once the tracker entry
        // expires with the session, while a dead row wrongly kept local
        // would never be cleaned up.
        deletedChatsTracker.removeFromDeleted(id)
        continue
      }
      try {
        const localChat = await indexedDBStorage.getChat(id)
        if (!isCurrent()) return { reconciled: false, failed: true }
        // Already gone locally (e.g. a prior reconciliation pass handled
        // it) or a local-only chat the cloud never owned. Skipping keeps
        // repeated reconciliation passes idempotent and event-free.
        if (!localChat || localChat.isLocalOnly) {
          if (!localChat) {
            // Still record the tombstone: a concurrent ingest pass may
            // have listed this chat before it was deleted remotely and
            // would otherwise save it back after this pass moves on.
            deletedChatsTracker.markAsDeleted(id)
          }
          continue
        }

        const deleted = await indexedDBStorage.deleteChatIfUnchanged(
          id,
          localChat.updatedAt,
          isCurrent,
        )
        if (!isCurrent()) return { reconciled: false, failed: true }
        if (!deleted) {
          // The row changed under us (an in-flight local edit). Leave it
          // for the conflict path to arbitrate and hold the watermark
          // behind this tombstone so the next pass re-checks it.
          allResolved = false
          continue
        }
        // Mirror the deletion into the in-memory tracker so any concurrent
        // listing/ingest pass that already observed the chat won't bring
        // it back into IndexedDB before the next deletion sync runs.
        deletedChatsTracker.markAsDeleted(id)
        successfulIds.push(id)
      } catch (error) {
        failed = true
        allResolved = false
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
    if (successfulIds.length > 0 && isCurrent()) {
      chatEvents.emit({ reason: 'sync', ids: successfulIds })
    }
    if (allResolved && Number.isFinite(latestEventAtMs) && isCurrent()) {
      advanceChatDeletesWatermark(latestEventAtMs)
    }
    return { reconciled: allResolved, failed }
  } catch (error) {
    logError('Failed to check for remotely deleted chats', error, {
      component: 'CloudSync',
      action: logAction,
    })
    return { reconciled: false, failed: true }
  }
}
