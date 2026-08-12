import {
  SYNC_ALL_CHATS_STATUS,
  SYNC_CHAT_DELETES_WATERMARK,
  SYNC_CHAT_STATUS,
  SYNC_CHATS,
  SYNC_DELETED_CHATS,
  SYNC_PROJECT_CHAT_STATUS_PREFIX,
  SYNC_SESSION_CHATS,
} from '@/constants/storage-keys'
import { chatEvents } from '@/services/storage/chat-events'
import {
  indexedDBStorage,
  type RemoteChatState,
  type StoredChat,
} from '@/services/storage/indexed-db'
import {
  revisionEvents,
  revisionSnapshot,
  revisionSummary,
  type RevisionEvent,
  type RevisionSnapshotItem,
} from '@/services/sync-enclave/sync-api'
import { ingestRemoteChats } from './chat-ingestion'
import { cloudStorage } from './cloud-storage'
import { isUploadableChat } from './sync-predicates'

const REVISION_PAGE_LIMIT = 250
const CONTENT_BATCH_SIZE = 100
const BOOTSTRAP_RECENT_CONTENT_LIMIT = 50
const DECIMAL_REVISION_PATTERN = /^\d+$/

export interface RevisionSyncResult {
  uploaded: number
  downloaded: number
  errors: string[]
}

export interface RevisionUploadAdapter {
  upload(chat: StoredChat): Promise<void>
  isStreaming(id: string): boolean
  /**
   * Resolve once no upload for this chat is in flight. Deletes MUST
   * settle in-flight uploads first: a create push racing the delete
   * makes the enclave observe "already gone", acknowledge the intent,
   * and then commit the push — resurrecting the deleted chat.
   */
  waitForUpload(id: string): Promise<void>
}

function parseRevision(revision: string): bigint {
  if (!DECIMAL_REVISION_PATTERN.test(revision)) {
    throw new Error('Sync enclave returned an invalid revision')
  }
  return BigInt(revision)
}

function ensureCurrent(isCurrent: () => boolean): void {
  if (!isCurrent()) {
    throw new Error('Cloud account changed during synchronization')
  }
}

function etagToSyncVersion(etag: string | undefined): number {
  const version = Number(etag)
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error('Sync enclave returned an invalid chat ETag')
  }
  return version
}

function toRemoteState(
  event: RevisionEvent | RevisionSnapshotItem,
  revision: string,
  kind: 'upsert' | 'delete',
): RemoteChatState {
  return {
    id: event.id,
    revision,
    kind,
    etag: event.etag,
    keyId: 'key_id' in event ? event.key_id : undefined,
    projectId: event.project_id,
    updatedAt: event.updated_at,
  }
}

function clearLegacyChatSyncKeys(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(SYNC_CHAT_STATUS)
  localStorage.removeItem(SYNC_CHATS)
  localStorage.removeItem(SYNC_ALL_CHATS_STATUS)
  localStorage.removeItem(SYNC_CHAT_DELETES_WATERMARK)
  sessionStorage.removeItem(SYNC_SESSION_CHATS)
  sessionStorage.removeItem(SYNC_DELETED_CHATS)
  for (let index = localStorage.length - 1; index >= 0; index--) {
    const key = localStorage.key(index)
    if (key?.startsWith(SYNC_PROJECT_CHAT_STATUS_PREFIX)) {
      localStorage.removeItem(key)
    }
  }
}

async function applyPulledUpserts(
  events: RevisionEvent[],
  userId: string,
  isCurrent: () => boolean,
): Promise<{ downloaded: number; states: RemoteChatState[] }> {
  if (events.length === 0) return { downloaded: 0, states: [] }
  const pendingDeleteIds = new Set(
    (await indexedDBStorage.getPendingDeletes(userId)).map((entry) => entry.id),
  )
  ensureCurrent(isCurrent)
  const latestById = new Map<string, RevisionEvent>()
  for (const event of events) latestById.set(event.id, event)
  const latest = [...latestById.values()]
  const idsToPull: string[] = []
  for (const event of latest) {
    if (pendingDeleteIds.has(event.id)) continue
    const local = await indexedDBStorage.getChat(event.id)
    ensureCurrent(isCurrent)
    if (local?.locallyModified) continue
    if (!local || String(local.syncVersion ?? 0) !== event.etag) {
      idsToPull.push(event.id)
    }
  }

  let downloaded = 0
  for (
    let offset = 0;
    offset < idsToPull.length;
    offset += CONTENT_BATCH_SIZE
  ) {
    const pulled = await cloudStorage.downloadChats(
      idsToPull.slice(offset, offset + CONTENT_BATCH_SIZE),
      { tolerateNotFound: true },
    )
    ensureCurrent(isCurrent)
    const eventById = new Map(latest.map((event) => [event.id, event]))
    const ingest = await ingestRemoteChats(
      pulled.map((chat) => {
        const event = eventById.get(chat.id)!
        return {
          ...chat,
          updatedAt: event.updated_at,
          syncVersion: etagToSyncVersion(event.etag),
        }
      }),
      { isCurrent, userId },
    )
    if (ingest.errors.length > 0) throw new Error(ingest.errors[0])
    downloaded += ingest.downloaded
  }
  return {
    downloaded,
    states: latest.map((event) =>
      toRemoteState(event, event.revision, 'upsert'),
    ),
  }
}

async function bootstrapFromSnapshot(
  userId: string,
  isCurrent: () => boolean,
): Promise<{
  downloaded: number
  revision: string
}> {
  clearLegacyChatSyncKeys()
  const items: RevisionSnapshotItem[] = []
  let cursor: string | undefined
  let snapshotRevision: string | null = null
  do {
    const page = await revisionSnapshot({ cursor, limit: REVISION_PAGE_LIMIT })
    ensureCurrent(isCurrent)
    parseRevision(page.snapshot_revision)
    if (snapshotRevision && snapshotRevision !== page.snapshot_revision) {
      throw new Error('Revision snapshot changed while paginating')
    }
    snapshotRevision = page.snapshot_revision
    items.push(...page.items)
    cursor = page.next_cursor
  } while (cursor)
  if (snapshotRevision === null) {
    throw new Error('Sync enclave returned no snapshot revision')
  }

  const staleExisting: RevisionSnapshotItem[] = []
  const recentMissing: RevisionSnapshotItem[] = []
  const pendingDeleteIds = new Set(
    (await indexedDBStorage.getPendingDeletes(userId)).map((entry) => entry.id),
  )
  ensureCurrent(isCurrent)
  for (const item of [...items].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  )) {
    const local = await indexedDBStorage.getChat(item.id)
    ensureCurrent(isCurrent)
    if (pendingDeleteIds.has(item.id) || local?.locallyModified) continue
    if (
      local &&
      (local.decryptionFailed || String(local.syncVersion ?? 0) !== item.etag)
    ) {
      staleExisting.push(item)
    } else if (
      !local &&
      recentMissing.length < BOOTSTRAP_RECENT_CONTENT_LIMIT
    ) {
      recentMissing.push(item)
    }
  }
  const candidates = [...staleExisting, ...recentMissing]

  let downloaded = 0
  for (
    let offset = 0;
    offset < candidates.length;
    offset += CONTENT_BATCH_SIZE
  ) {
    const batch = candidates.slice(offset, offset + CONTENT_BATCH_SIZE)
    const pulled = await cloudStorage.downloadChats(
      batch.map((item) => item.id),
      { tolerateNotFound: true },
    )
    ensureCurrent(isCurrent)
    const metadata = new Map(batch.map((item) => [item.id, item]))
    const ingest = await ingestRemoteChats(
      pulled.map((chat) => ({
        ...chat,
        updatedAt: metadata.get(chat.id)!.updated_at,
        syncVersion: etagToSyncVersion(metadata.get(chat.id)!.etag),
      })),
      { isCurrent, userId },
    )
    if (ingest.errors.length > 0) throw new Error(ingest.errors[0])
    downloaded += ingest.downloaded
  }

  ensureCurrent(isCurrent)
  const deletedIds = await indexedDBStorage.reconcileRevisionSnapshot(
    items.map((item) => toRemoteState(item, snapshotRevision!, 'upsert')),
    snapshotRevision,
    userId,
  )
  if (deletedIds.length > 0) {
    chatEvents.emit({ reason: 'sync', ids: deletedIds })
  }
  return { downloaded, revision: snapshotRevision }
}

async function applyEvents(
  afterRevision: string,
  throughRevision: string,
  userId: string,
  isCurrent: () => boolean,
): Promise<number> {
  let cursor: string | undefined
  let lastRevision = parseRevision(afterRevision)
  let downloaded = 0
  const committedStates: RemoteChatState[] = []
  let pendingUpserts: RevisionEvent[] = []

  const flushUpserts = async () => {
    const applied = await applyPulledUpserts(pendingUpserts, userId, isCurrent)
    downloaded += applied.downloaded
    committedStates.push(...applied.states)
    pendingUpserts = []
  }

  do {
    const page = await revisionEvents({
      afterRevision,
      throughRevision,
      cursor,
      limit: REVISION_PAGE_LIMIT,
    })
    ensureCurrent(isCurrent)
    for (const event of page.events) {
      const revision = parseRevision(event.revision)
      if (
        revision <= lastRevision ||
        revision > parseRevision(throughRevision)
      ) {
        throw new Error('Sync enclave returned out-of-order revision events')
      }
      lastRevision = revision
      if (event.kind === 'upsert') {
        pendingUpserts.push(event)
        continue
      }
      await flushUpserts()
      ensureCurrent(isCurrent)
      const deleted = await indexedDBStorage.applyRemoteDeletion(
        event.id,
        userId,
        isCurrent,
      )
      committedStates.push(toRemoteState(event, event.revision, 'delete'))
      if (deleted) chatEvents.emit({ reason: 'sync', ids: [event.id] })
    }
    cursor = page.next_cursor
  } while (cursor)
  await flushUpserts()
  ensureCurrent(isCurrent)
  await indexedDBStorage.commitRevisionBatch(
    committedStates,
    throughRevision,
    userId,
  )
  return downloaded
}

async function uploadPendingWork(
  adapter: RevisionUploadAdapter,
  userId: string,
  isCurrent: () => boolean,
): Promise<number> {
  const deletes = await indexedDBStorage.getPendingDeletes(userId)
  ensureCurrent(isCurrent)
  for (const entry of deletes) {
    await adapter.waitForUpload(entry.id)
    ensureCurrent(isCurrent)
    await cloudStorage.deleteChat(entry.id, entry.idempotencyKey)
    ensureCurrent(isCurrent)
    await indexedDBStorage.acknowledgePendingDelete(entry.id, userId)
  }

  let uploaded = 0
  const chats = await indexedDBStorage.getPendingUploadChats(userId)
  ensureCurrent(isCurrent)
  for (const chat of chats) {
    if (!isUploadableChat(chat, (id) => adapter.isStreaming(id))) continue
    await adapter.upload(chat)
    ensureCurrent(isCurrent)
    uploaded++
  }
  return uploaded
}

export async function drainChatRevisionSync(
  adapter: RevisionUploadAdapter,
  userId: string,
  isCurrent: () => boolean = () => true,
): Promise<RevisionSyncResult> {
  const result: RevisionSyncResult = { uploaded: 0, downloaded: 0, errors: [] }
  const state = await indexedDBStorage.getSyncState(userId)
  const [pending, summary] = await Promise.all([
    indexedDBStorage.hasPendingSyncWork(userId),
    revisionSummary(),
  ])
  ensureCurrent(isCurrent)
  const current = parseRevision(summary.current_revision)
  const oldest = parseRevision(summary.oldest_replayable_revision)

  let appliedRevision = state?.appliedRevision ?? null
  if (
    !state?.bootstrapped ||
    appliedRevision === null ||
    parseRevision(appliedRevision) < oldest ||
    parseRevision(appliedRevision) > current
  ) {
    const bootstrap = await bootstrapFromSnapshot(userId, isCurrent)
    result.downloaded += bootstrap.downloaded
    appliedRevision = bootstrap.revision
  }

  if (parseRevision(appliedRevision) === current && !pending) return result
  if (parseRevision(appliedRevision) < current) {
    result.downloaded += await applyEvents(
      appliedRevision,
      summary.current_revision,
      userId,
      isCurrent,
    )
  }
  result.uploaded = await uploadPendingWork(adapter, userId, isCurrent)
  return result
}
