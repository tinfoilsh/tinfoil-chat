import type { Attachment, Message } from '@/components/chat/types'
import { AUTH_ACTIVE_USER_ID } from '@/constants/storage-keys'
import { isLocalRecoveryEnvelope } from '@/types/chat-recovery'
import {
  base64ToUint8Array,
  decryptAttachment,
  uint8ArrayToBase64,
} from '@/utils/binary-codec'
import { logError, logWarning } from '@/utils/error-handling'
import { authTokenManager } from '../auth'
import { type AttachmentRewrite, type StoredChat } from '../storage/indexed-db'
import {
  attachmentGet as enclaveAttachmentGet,
  attachmentPut as enclaveAttachmentPut,
  deleteRow as enclaveDeleteRow,
  listStatus as enclaveListStatus,
  pull as enclavePull,
  push as enclavePush,
  newIdempotencyKey,
  pullItemPlaintext,
  revisionSnapshot,
} from '../sync-enclave/sync-api'
import { RESTORE_DELETED_HEADERS } from '../sync-enclave/wire-contract'
import type { AccountOperationGuard } from './account-operation'
import { pullKey, requirePrimaryKeyB64 } from './cek-encoding'
import { processRemoteChat, type RemoteChatData } from './chat-codec'

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.tinfoil.sh'
const AUTH_INIT_WAIT_MS = 3000
const RESTORE_DELETED_CHAT_HEADER = RESTORE_DELETED_HEADERS.Chat
const ENCLAVE_CHAT_LIST_LIMIT = 100
const PROJECT_CHAT_LIST_LIMIT = 500
const LEGACY_ATTACHMENT_GONE_STATUS = 410
const ATTACHMENT_IDEMPOTENCY_KEY_BYTES = 16

/**
 * Lean chat list entry. Anything the caller needs beyond (id,
 * updatedAt, projectId) must come from decrypting the row's content
 * — we deliberately do NOT carry title/messageCount/size on the wire
 * any more. Those columns lived on the controlplane only to render
 * the old client-side-decrypt list UI, and surfacing them here from
 * the new enclave path either lies (zeros / empty strings) or
 * duplicates plaintext that the resolver/ingest already derives.
 */
export interface ChatListResponse {
  conversations: Array<{
    id: string
    updatedAt: string
    syncVersion: number
    content?: string
    projectId?: string
  }>
  nextContinuationToken?: string
  hasMore: boolean
}

export interface ProfileSyncStatus {
  exists: boolean
  version?: number
  lastUpdated?: string
  deleted?: boolean
}

export interface BulkConversationResult {
  conversationId: string
  success: boolean
  error?: string
}

export interface BulkUploadResponse {
  results: BulkConversationResult[]
  succeeded: number
  failed: number
}

export interface UploadChatOptions {
  restoreDeleted?: boolean
  /**
   * Idempotency key for the enclave write. Required to be stable
   * across all HTTP retries of the same logical upload (§9.6 R1).
   * The upload coalescer owns generation; when called from outside
   * the coalescer (one-shot uploads, sign-in migration), the caller
   * MUST mint a fresh UUID-shaped value once per logical write.
   * When omitted, a fresh key is generated — this is only safe for
   * fire-and-forget uploads that have no retry caller above them.
   */
  idempotencyKey?: string
}

/**
 * Result of a chat upload. `syncVersion` is the new ETag (decoded as
 * a monotonic integer); `rewrites` lists every attachment whose id
 * and per-attachment key were minted by the enclave during this
 * upload so the caller can apply them to the freshest local copy
 * via `indexedDBStorage.finalizeUpload`. The input chat is NOT
 * mutated — the rewrites are emitted as a side channel.
 */
export interface UploadChatResult {
  syncVersion: number | null
  rewrites: AttachmentRewrite[]
  projectIntentIncluded: boolean
}

/**
 * Plaintext envelope-v2 JSON returned by the sync enclave. The `2`
 * here mirrors the wire `tinfoil-sync-envelope-v2` AAD — the row is
 * sealed under v2 on the controlplane, the enclave unsealed it, so
 * what we hand back is plaintext.
 */
export type RawChatContent = {
  plaintext: string
  formatVersion: 2
  syncVersion?: number
  projectIdSet: boolean
  projectId?: string | null
}

function etagToSyncVersion(etag: string | undefined): number | undefined {
  if (!etag) return undefined
  const parsed = parseInt(etag, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function chatUpdateToMeta(update: {
  id: string
  etag?: string
  project_id?: string | null
  updated_at: string
}): ChatListResponse['conversations'][number] {
  return {
    id: update.id,
    updatedAt: update.updated_at,
    syncVersion: etagToSyncVersion(update.etag) ?? 1,
    projectId: update.project_id ?? undefined,
  }
}

// hasNextCursor guards against truthy-but-meaningless cursor values
// (e.g. a Go zero-time `"0001-01-01T00:00:00Z"`) so paginating loops
// can't accidentally run forever if the server ever stops gating the
// field as carefully as today's `pickNextCursor` does.
function hasNextCursor(cursor: string | undefined): boolean {
  return typeof cursor === 'string' && cursor.length > 0
}

async function attachmentIdempotencyKey(
  uploadIdempotencyKey: string,
  attachmentIndex: number,
): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(
        `attachment:${uploadIdempotencyKey}:${attachmentIndex}`,
      ),
    ),
  )
  let out = ''
  for (let i = 0; i < ATTACHMENT_IDEMPOTENCY_KEY_BYTES; i++) {
    out += digest[i].toString(16).padStart(2, '0')
  }
  return out
}

function stripBase64FromMessages(messages: Message[]): Message[] {
  return messages.map((msg) => ({
    ...msg,
    attachments: msg.attachments?.map((att) => {
      const { storagePayloadId: _localReference, ...withoutLocalReference } =
        att as Attachment & { storagePayloadId?: string }
      if (
        withoutLocalReference.type === 'image' &&
        withoutLocalReference.base64
      ) {
        const { base64: _removed, ...rest } = withoutLocalReference
        return rest
      }
      return withoutLocalReference
    }),
  }))
}

export class CloudStorageService {
  private async ensureAuthReady(): Promise<void> {
    if (
      !authTokenManager.isInitialized() &&
      typeof window !== 'undefined' &&
      localStorage.getItem(AUTH_ACTIVE_USER_ID) !== null
    ) {
      await authTokenManager.waitForInit(AUTH_INIT_WAIT_MS)
    }
  }

  async generateConversationId(timestamp?: string): Promise<{
    conversationId: string
    timestamp: string
    reverseTimestamp: number
  }> {
    const response = await fetch(`${API_BASE_URL}/api/chats/generate-id`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({ timestamp }),
    })

    if (!response.ok) {
      throw new Error(
        `Failed to generate conversation ID: ${response.statusText}`,
      )
    }

    return response.json()
  }

  private async getHeaders(): Promise<Record<string, string>> {
    await this.ensureAuthReady()
    return authTokenManager.getAuthHeaders()
  }

  async isAuthenticated(): Promise<boolean> {
    await this.ensureAuthReady()
    return authTokenManager.isAuthenticated()
  }

  async uploadChat(
    chat: StoredChat,
    options: UploadChatOptions = {},
  ): Promise<UploadChatResult> {
    // §9.6 R6 — the user's opt-out is invariant: a chat marked
    // localOnly MUST NEVER reach the enclave. Throw rather than
    // silently drop so an upstream caller bug is caught instead of
    // becoming a data-leak shaped like a successful upload.
    if (chat.isLocalOnly) {
      throw new Error(
        'cloud-storage: refusing to upload a local-only chat (§9.6 R6)',
      )
    }
    // Deep-clone messages so attachment id/key rewrites land in the
    // outgoing envelope only — never in the caller's chat object.
    // The `finalizeUpload` path applies the rewrites against the
    // FRESHEST local copy by stable client id, so an interleaved
    // user edit can't carry the wrong server id back to disk (§H5).
    const messages: Message[] = ((chat.messages as Message[]) || []).map(
      (msg) => ({
        ...msg,
        attachments: msg.attachments
          ? msg.attachments.map((a) => ({ ...a }))
          : undefined,
      }),
    )

    const idempotencyKey = options.idempotencyKey ?? newIdempotencyKey()
    const rewrites = await this.encryptAndUploadAttachments(
      messages,
      chat.id,
      idempotencyKey,
    )
    // Stamp the clock version this push will create so a remote reader
    // can tell the clock is current (etag === clockVersion) versus a
    // later clock-unaware write that would force the updatedAt fallback.
    const baseVersion = options.restoreDeleted ? 0 : (chat.syncVersion ?? 0)
    const syncedRecoveries = chat.pendingRecoveries?.filter(
      (recovery) => !isLocalRecoveryEnvelope(recovery),
    )
    const {
      pendingUpload: _pendingUpload,
      syncUserId: _syncUserId,
      projectLocallyModified: _projectLocallyModified,
      ...chatContent
    } = chat
    const strippedChat = {
      ...chatContent,
      messages: stripBase64FromMessages(messages),
      pendingRecoveries:
        syncedRecoveries && syncedRecoveries.length > 0
          ? syncedRecoveries
          : undefined,
      clockVersion: baseVersion + 1,
    }
    const plaintext = new TextEncoder().encode(JSON.stringify(strippedChat))

    const metadata: Record<string, unknown> = { messageCount: messages.length }
    const projectIntentIncluded =
      options.restoreDeleted ||
      (chat.syncVersion ?? 0) === 0 ||
      chat.projectLocallyModified === true
    if (projectIntentIncluded) metadata.projectId = chat.projectId ?? null
    if (options.restoreDeleted) {
      metadata.restoreDeleted = true
    }

    const pushResp = await enclavePush({
      scope: 'chat',
      id: chat.id,
      keyB64: requirePrimaryKeyB64(),
      plaintext,
      ifMatch: options.restoreDeleted ? null : String(chat.syncVersion ?? 0),
      idempotencyKey,
      metadata,
    })

    // The blob stored fine but the enclave's inline search-index
    // update failed; the chat won't surface in search until the next
    // reindex (the search UI kicks one when queries report the gap).
    if (pushResp.search_indexed === false) {
      logWarning('Chat stored but not search-indexed', {
        component: 'CloudStorage',
        action: 'uploadChat',
        metadata: { chatId: chat.id },
      })
    }

    return {
      syncVersion: etagToSyncVersion(pushResp.etag) ?? null,
      rewrites,
      projectIntentIncluded,
    }
  }

  private async encryptAndUploadAttachments(
    messages: Message[],
    chatId: string,
    idempotencyKey: string,
  ): Promise<AttachmentRewrite[]> {
    const rewrites: AttachmentRewrite[] = []
    let attachmentIndex = 0
    for (const msg of messages) {
      for (const att of msg.attachments || []) {
        if (att.type === 'image' && att.base64 && !att.encryptionKey) {
          const raw = base64ToUint8Array(att.base64)
          // The enclave mints both the durable attachment id and a
          // fresh per-attachment AES-256 key. It uploads the raw
          // plaintext to buckets sealed under that key (buckets's
          // v1 envelope), then returns the id + key here so we can
          // (a) adopt the enclave-minted id everywhere we used a
          // local temp id and (b) embed the key in the chat JSON
          // as `att.encryptionKey`. The chat envelope (sealed under
          // the user's CEK) is what keeps the per-attachment keys
          // confidential at rest; this is also how sharing keeps
          // working — re-sealing only the chat plaintext for a
          // recipient hands them every attachment key transitively.
          const attachmentIdemKey = await attachmentIdempotencyKey(
            idempotencyKey,
            attachmentIndex,
          )
          const { id: enclaveID, att_key } = await enclaveAttachmentPut({
            chatId,
            plaintext: raw,
            idempotencyKey: attachmentIdemKey,
          })
          const clientId = att.id
          const storagePayloadId = (
            att as Attachment & { storagePayloadId?: string }
          ).storagePayloadId
          att.id = enclaveID
          att.encryptionKey = att_key
          rewrites.push({
            clientId,
            serverId: enclaveID,
            encryptionKey: att_key,
            storagePayloadId,
          })
        }
        attachmentIndex++
      }
    }
    return rewrites
  }

  async bulkUploadChats(
    chats: Array<{
      id: string
      title: string
      messages: Array<unknown>
      createdAt: Date | string
      projectId?: string
      isLocalOnly?: boolean
    }>,
  ): Promise<BulkUploadResponse> {
    if (chats.length === 0) {
      return { results: [], succeeded: 0, failed: 0 }
    }

    if (chats.length > 100) {
      throw new Error('Maximum 100 chats per bulk upload request')
    }

    // Each row goes through the enclave push pipeline. There's no bulk
    // push on the enclave wire today, so we fan out single-row pushes
    // and aggregate results to keep the BulkUploadResponse contract
    // intact for callers (sign-in migration, bulk re-encrypt).
    // §9.6 R6 — local-only chats are silently filtered out of the
    // upload set instead of being attempted-and-failed. The caller
    // already chose not to sync them; reporting them as failures
    // would be misleading.
    const eligible = chats.filter((c) => !c.isLocalOnly)
    const results: BulkConversationResult[] = []
    let succeeded = 0
    let failed = 0
    for (const chat of eligible) {
      try {
        await this.uploadChat(chat as unknown as StoredChat)
        results.push({ conversationId: chat.id, success: true })
        succeeded += 1
      } catch (err) {
        results.push({
          conversationId: chat.id,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        })
        failed += 1
      }
    }
    return { results, succeeded, failed }
  }

  /**
   * Fetch raw encrypted content for a single chat by ID.
   * Returns v0 JSON string or v1 binary ArrayBuffer based on X-Format-Version header.
   */
  async fetchRawChatContent(chatId: string): Promise<RawChatContent | null> {
    const keys = pullKey()
    if (keys.length === 0) return null

    const resp = await enclavePull({
      scope: 'chat',
      ids: [chatId],
      keys,
    })
    const item = resp.items[0]
    if (!item || !item.ok) {
      if (item && item.code === 'NOT_FOUND') return null
      throw new Error(item?.code || 'Failed to pull chat from sync enclave')
    }
    const plaintext = pullItemPlaintext(item)
    if (!plaintext) return null
    return {
      plaintext: new TextDecoder().decode(plaintext),
      formatVersion: 2,
      syncVersion: etagToSyncVersion(item.etag),
      projectIdSet: item.project_id_set === true,
      projectId: item.project_id,
    }
  }

  async downloadChat(chatId: string): Promise<StoredChat | null> {
    try {
      const raw = await this.fetchRawChatContent(chatId)

      if (raw === null) {
        return null
      }

      const remote: RemoteChatData = {
        id: chatId,
        plaintext: raw.plaintext,
        formatVersion: 2,
        syncVersion: raw.syncVersion,
      }

      const result = await processRemoteChat(
        remote,
        raw.projectIdSet ? { projectId: raw.projectId } : {},
      )
      return result.chat
    } catch (error) {
      logError(`Failed to download chat ${chatId}`, error, {
        component: 'CloudStorage',
        action: 'downloadChat',
        metadata: { chatId },
      })
      throw error
    }
  }

  async downloadChats(
    chatIds: string[],
    options: { tolerateNotFound?: boolean } = {},
  ): Promise<ChatListResponse['conversations']> {
    if (chatIds.length === 0) return []
    const keys = pullKey()
    if (keys.length === 0) {
      throw new Error('Cloud sync key is unavailable')
    }
    const response = await enclavePull({ scope: 'chat', ids: chatIds, keys })
    const conversations: ChatListResponse['conversations'] = []
    const requestedIds = new Set(chatIds)
    const returnedIds = new Set<string>()
    for (const item of response.items) {
      if (!requestedIds.has(item.id) || returnedIds.has(item.id)) {
        throw new Error('Sync enclave returned an unexpected chat batch item')
      }
      returnedIds.add(item.id)
      if (!item.ok) {
        if (options.tolerateNotFound && item.code === 'NOT_FOUND') continue
        throw new Error(item.code ?? 'Failed to batch-pull chat content')
      }
      const plaintext = pullItemPlaintext(item)
      if (!plaintext) {
        throw new Error('Sync enclave returned empty chat content')
      }
      conversations.push({
        id: item.id,
        updatedAt: '',
        syncVersion: etagToSyncVersion(item.etag) ?? 1,
        content: new TextDecoder().decode(plaintext),
      })
    }
    if (returnedIds.size !== requestedIds.size) {
      throw new Error('Sync enclave returned an incomplete chat batch')
    }
    return conversations
  }

  /**
   * Fetch and decrypt all image attachments that have no base64 yet.
   * V2 attachments carry their own AES-256 key in `att.encryptionKey`;
   * legacy attachments use the public storage route plus the same key
   * material from older chat JSON.
   *
   * Returns a map of attachmentId -> base64 string so the caller
   * can merge results into the current (possibly updated) messages
   * without overwriting the entire array with a stale snapshot.
   */
  async loadChatImages(
    _chatId: string,
    messages: Message[],
  ): Promise<Record<string, string>> {
    const results: Record<string, string> = {}
    const tasks: Promise<void>[] = []

    for (const msg of messages) {
      for (const att of msg.attachments || []) {
        if (att.type !== 'image' || att.base64) {
          continue
        }
        const attId = att.id
        const keyB64 = att.encryptionKey
        const legacyKeyB64 = (att as { key?: string }).key
        if (!keyB64 && !legacyKeyB64) {
          continue
        }
        tasks.push(
          (async () => {
            try {
              let plaintext: Uint8Array | null = null
              if (keyB64) {
                plaintext = await enclaveAttachmentGet({
                  id: attId,
                  attKeyB64: keyB64,
                })
              } else if (legacyKeyB64) {
                plaintext = await this.fetchLegacyAttachment(
                  attId,
                  legacyKeyB64,
                )
              }
              if (!plaintext) return
              results[attId] = uint8ArrayToBase64(plaintext)
            } catch {
              // Silently skip failed attachments — thumbnail is still available
            }
          })(),
        )
      }
    }

    await Promise.all(tasks)
    return results
  }

  // Part of the v0/v1 → v2 attachment migration. Safe to remove once
  // the controlplane `chat_attachments_legacy` table is drained and
  // no client (web or iOS) still depends on this fallback.
  private async fetchLegacyAttachment(
    attachmentId: string,
    keyB64: string,
  ): Promise<Uint8Array> {
    const response = await fetch(
      `${API_BASE_URL}/api/storage/attachment/${attachmentId}`,
    )
    if (!response.ok || response.status === LEGACY_ATTACHMENT_GONE_STATUS) {
      throw new Error(`Failed to fetch legacy attachment: ${response.status}`)
    }
    const encrypted = new Uint8Array(await response.arrayBuffer())
    return decryptAttachment(encrypted, base64ToUint8Array(keyB64))
  }

  async listChats(options?: {
    limit?: number
    continuationToken?: string
    includeContent?: boolean
  }): Promise<ChatListResponse> {
    await this.ensureAuthReady()
    const limit = Math.min(options?.limit ?? ENCLAVE_CHAT_LIST_LIMIT, 500)
    const status = await enclaveListStatus({
      scope: 'chat',
      cursor: options?.continuationToken,
      limit,
      direction: 'desc',
    })
    const conversations = status.updates.map(chatUpdateToMeta)

    if (options?.includeContent && conversations.length > 0) {
      await this.attachInlineContent(conversations)
    }

    return {
      conversations,
      nextContinuationToken: status.next_cursor,
      hasMore: hasNextCursor(status.next_cursor),
    }
  }

  private async attachInlineContent(
    conversations: ChatListResponse['conversations'],
  ): Promise<void> {
    const keys = pullKey()
    if (keys.length === 0) return
    const pulled = await enclavePull({
      scope: 'chat',
      ids: conversations.map((c) => c.id),
      keys,
    })
    const pulledById = new Map<
      string,
      { content: string; syncVersion?: number }
    >()
    for (const item of pulled.items) {
      if (!item.ok) {
        // Batch pull is best-effort: surface per-item failures via
        // structured logging and keep filling in the rest of the
        // page. Throwing here would tear down the whole sync on the
        // first legacy row encrypted under a key this device no
        // longer holds, which is exactly the scenario the recovery
        // wizard is supposed to surface. NOT_FOUND is silent because
        // it just means the row was deleted between list and pull.
        if (item.code !== 'NOT_FOUND') {
          logWarning('Skipping chat the sync enclave could not return', {
            component: 'CloudStorage',
            action: 'attachInlineContent',
            metadata: {
              chatId: item.id,
              code: item.code ?? 'unknown',
              reason: item.reason,
            },
          })
        }
        continue
      }
      const plaintext = pullItemPlaintext(item)
      if (plaintext) {
        pulledById.set(item.id, {
          content: new TextDecoder().decode(plaintext),
          syncVersion: etagToSyncVersion(item.etag),
        })
      }
    }
    for (const conversation of conversations) {
      const pulled = pulledById.get(conversation.id)
      if (pulled) {
        conversation.content = pulled.content
        if (pulled.syncVersion) {
          conversation.syncVersion = pulled.syncVersion
        }
      }
    }
  }

  async deleteChat(
    chatId: string,
    idempotencyKey = newIdempotencyKey(),
  ): Promise<void> {
    await enclaveDeleteRow({
      scope: 'chat',
      id: chatId,
      ifMatch: null,
      idempotencyKey,
      keyB64: requirePrimaryKeyB64(),
    })
  }

  async deleteAllChats(guard?: AccountOperationGuard): Promise<{
    deleted: number
  }> {
    let deleted = 0
    let cursor: string | undefined
    const ids: string[] = []
    do {
      guard?.assertCurrent()
      const status = await revisionSnapshot({ cursor, limit: 500 })
      ids.push(...status.items.map((item) => item.id))
      cursor = status.next_cursor
    } while (cursor)
    for (const id of ids) {
      guard?.assertCurrent()
      // Unconditional delete (ifMatch: null) matches single-chat
      // `deleteChat` and the "nuke everything" semantic of this
      // entry point. A CAS-guarded delete would 412 on any chat
      // that was concurrently written between the listStatus page
      // and the delete, aborting the whole loop and leaving the
      // tail of pending pages un-deleted.
      await enclaveDeleteRow({
        scope: 'chat',
        id,
        ifMatch: null,
        idempotencyKey: newIdempotencyKey(),
        keyB64: requirePrimaryKeyB64(),
      })
      deleted++
    }
    return { deleted }
  }

  async deleteChatsByProject(
    projectId: string,
    guard?: AccountOperationGuard,
  ): Promise<{
    deleted: number
  }> {
    // Single server-side bulk delete: the controlplane removes every chat
    // in the project and writes one tombstone per row, so other devices
    // converge on the next sync without a per-chat round trip from here.
    guard?.assertCurrent()
    const headers = await this.getHeaders()
    guard?.assertCurrent()
    const response = await fetch(
      `${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}/chats`,
      {
        method: 'DELETE',
        headers,
      },
    )
    guard?.assertCurrent()

    if (!response.ok) {
      throw new Error(`Failed to delete project chats: ${response.statusText}`)
    }

    const result: { deleted: number } = await response.json()
    guard?.assertCurrent()
    return { deleted: result.deleted }
  }

  async listChatIdsByProject(
    projectId: string,
    guard?: AccountOperationGuard,
  ): Promise<string[]> {
    const ids = new Set<string>()
    let cursor: string | undefined
    do {
      guard?.assertCurrent()
      const status = await enclaveListStatus({
        scope: 'chat',
        projectId,
        cursor,
        limit: PROJECT_CHAT_LIST_LIMIT,
      })
      guard?.assertCurrent()
      for (const update of status.updates) {
        if (update.project_id === projectId) ids.add(update.id)
      }
      cursor = status.next_cursor
    } while (cursor)
    return [...ids]
  }

  /**
   * Intentionally a no-op. Project membership rides on the next
   * `uploadChat` (via `metadata.projectId`) and the controlplane
   * stamps the row's `project_id` column from there. Callers MUST
   * pair this with a `backupChat` so the change actually propagates.
   */
  async updateChatProject(
    _chatId: string,
    _projectId: string | null,
  ): Promise<void> {
    return
  }
}

export const cloudStorage = new CloudStorageService()
