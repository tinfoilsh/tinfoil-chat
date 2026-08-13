import type {
  Attachment,
  Chat as ChatType,
  Message,
} from '@/components/chat/types'
import { ACCOUNT_RESET_FAILED_EVENT } from '@/constants/auth-events'
import {
  AUTH_ACCOUNT_RESET_FAILED,
  AUTH_ACCOUNT_RESET_SIGNAL,
} from '@/constants/storage-keys'
import { nextClock } from '@/services/cloud/edit-clock'
import type { Project } from '@/types/project'
import { logError, logWarning } from '@/utils/error-handling'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

export interface Chat extends Omit<ChatType, 'createdAt'> {
  createdAt: string
  updatedAt: string
  model?: string
}

export interface StoredChat extends Chat {
  lastAccessedAt: number
  syncedAt?: number
  locallyModified?: boolean
  syncPending?: 0 | 1
  syncVersion?: number
  formatVersion?: number
  decryptionFailed?: boolean
  dataCorrupted?: boolean
  version?: number
  loadedAt?: number
  isLocalOnly?: boolean
  isBlankChat?: boolean
  // Logical edit clock for conflict arbitration. `clock`/`writer` are
  // bumped on each local content edit; `clockVersion` records the
  // syncVersion the clock was last maintained at, so a reader can tell
  // whether a clock-unaware client wrote since (see remoteWins).
  clock?: number
  writer?: string
  clockVersion?: number
}

export interface SaveChatResult {
  saved: boolean
  isLocalOnly: boolean
}

interface StoredProject {
  cacheKey: string
  userId: string
  project: Project
}

interface StoredAttachmentPayload {
  id: string
  chatId: string
  base64?: string
  thumbnailBase64?: string
  textContent?: string
  pages?: Attachment['pages']
}

type StoredAttachmentReference = Attachment & {
  storagePayloadId?: string
}

/**
 * Rewrite emitted by the upload path when the enclave mints a fresh
 * attachment id + per-attachment key. `clientId` is what the local
 * attachment used before the upload; `serverId` and `encryptionKey`
 * are what the chat envelope was sealed with. `finalizeUpload`
 * applies these against the freshest local copy so we never mutate
 * the wrong attachment after a concurrent edit.
 */
export interface AttachmentRewrite {
  clientId: string
  serverId: string
  encryptionKey: string
  storagePayloadId?: string
}

export class AttachmentPayloadIdUnavailableError extends Error {
  readonly code = 'ATTACHMENT_PAYLOAD_ID_UNAVAILABLE'

  constructor() {
    super('Secure random UUID generation is unavailable')
    this.name = 'AttachmentPayloadIdUnavailableError'
  }
}

export const DB_NAME = 'tinfoil-chat'
export const DB_VERSION = 5
export const INDEXED_DB_UPGRADE_BLOCKED_EVENT = 'indexedDBUpgradeBlocked'
const CHATS_STORE = 'chats'
const CHATS_PROJECT_INDEX = 'projectId'
const CHATS_SYNC_PENDING_INDEX = 'syncPending'
const PROJECTS_STORE = 'projects'
const PROJECTS_USER_INDEX = 'userId'
const MIGRATIONS_STORE = 'migrations'
const SYNC_PENDING_MIGRATION_ID = 'sync-pending-v4'
const ATTACHMENT_PAYLOADS_STORE = 'attachmentPayloads'
const ATTACHMENT_PAYLOADS_CHAT_INDEX = 'chatId'
const GENERATED_ATTACHMENT_PAYLOAD_PREFIX = 'attachment-payload:'
const ACCOUNT_CHANGE_RESET_TIMEOUT_MS = 10_000
const ACCOUNT_CHANGE_READ_ERROR = 'IndexedDB read superseded by account change'
const ACCOUNT_CHANGE_WRITE_ERROR =
  'IndexedDB write superseded by account change'
let isUpgradeBlocked = false
const textEncoder = new TextEncoder()

export function isIndexedDBUpgradeBlocked(): boolean {
  return isUpgradeBlocked
}

function hashString(input: string): string {
  return bytesToHex(sha256(textEncoder.encode(input)))
}

function deserializeStoredChat(chat: StoredChat): StoredChat {
  if (!Array.isArray(chat.messages)) {
    throw new Error('Stored chat has invalid messages')
  }

  return {
    ...chat,
    messages: chat.messages.map((message) => ({
      ...message,
      timestamp: message.timestamp ? new Date(message.timestamp) : new Date(),
    })),
  } as StoredChat
}

/**
 * Computes a stable fingerprint for a chat's meaningful content.
 * Used to decide if a chat is "locally modified" (and should be re-uploaded).
 *
 * Intentionally ignores `updatedAt` so we don't treat "save time changed" as a content change.
 * Avoids hashing huge blobs (documentContent/image base64) by hashing or summarizing those fields.
 */
export function chatContentFingerprint(chat: {
  title?: string
  projectId?: string
  messages?: any[]
  pendingRecoveries?: any[]
}): string {
  const messages = (chat.messages || []).map((m) => ({
    role: m.role,
    content: m.content,
    turnId: m.turnId,
    thoughts: m.thoughts,
    isThinking: m.isThinking,
    thinkingDuration: m.thinkingDuration,
    isError: m.isError,
    timestamp: m.timestamp,
    timeline: m.timeline,
    // New format: hash attachment data to avoid huge fingerprints
    attachments:
      Array.isArray(m.attachments) && m.attachments.length > 0
        ? m.attachments.map((a: any) => ({
            id: a.id,
            type: a.type,
            fileName: a.fileName,
            mimeType: a.mimeType,
            fileSize: a.fileSize,
            description: a.description,
            encryptionKey: a.encryptionKey,
            base64Hash:
              typeof a.base64 === 'string' ? hashString(a.base64) : null,
            base64Length: typeof a.base64 === 'string' ? a.base64.length : 0,
            thumbnailBase64Hash:
              typeof a.thumbnailBase64 === 'string'
                ? hashString(a.thumbnailBase64)
                : null,
            thumbnailBase64Length:
              typeof a.thumbnailBase64 === 'string'
                ? a.thumbnailBase64.length
                : 0,
            textContentHash:
              typeof a.textContent === 'string'
                ? hashString(a.textContent)
                : null,
            textContentLength:
              typeof a.textContent === 'string' ? a.textContent.length : 0,
            pagesHash: Array.isArray(a.pages)
              ? hashString(JSON.stringify(a.pages))
              : null,
          }))
        : [],
    // Legacy fields — still included for old messages that haven't been migrated
    documents: m.documents,
    documentContentHash:
      typeof m.documentContent === 'string'
        ? hashString(m.documentContent)
        : null,
    documentContentLength:
      typeof m.documentContent === 'string' ? m.documentContent.length : 0,
    imageData:
      Array.isArray(m.imageData) && m.imageData.length > 0
        ? m.imageData.map((img: any) => ({
            mimeType: img?.mimeType,
            base64Hash:
              typeof img?.base64 === 'string' ? hashString(img.base64) : null,
            base64Length:
              typeof img?.base64 === 'string' ? img.base64.length : 0,
          }))
        : [],
  }))

  return JSON.stringify({
    title: chat.title ?? '',
    projectId: chat.projectId ?? null,
    messages,
    pendingRecoveries: chat.pendingRecoveries ?? [],
  })
}

/**
 * Determine whether a chat should be marked as locally modified (needing upload).
 *
 * Rules:
 * 1. Chats that failed decryption are NEVER marked modified — they are placeholders
 *    with empty messages that would overwrite real encrypted data on the server.
 * 2. Existing chats: mark modified if meaningful content changed, or preserve the
 *    existing modified flag so previously-dirty chats stay dirty.
 * 3. New chats: use the caller-provided value, defaulting to true.
 */
export function computeLocallyModified(opts: {
  isFailedDecryption: boolean
  existingChat: StoredChat | undefined
  hasContentChanges: boolean
  callerValue: boolean | undefined
}): boolean {
  if (opts.isFailedDecryption) {
    return false
  }
  if (opts.existingChat) {
    return opts.hasContentChanges || opts.existingChat.locallyModified === true
  }
  return opts.callerValue ?? true
}

export function chatNeedsSync(
  chat: Pick<
    StoredChat,
    'locallyModified' | 'syncedAt' | 'isLocalOnly' | 'decryptionFailed'
  >,
): 0 | 1 {
  if (chat.isLocalOnly || chat.decryptionFailed) return 0
  return chat.locallyModified === true || chat.syncedAt == null ? 1 : 0
}

export function resolveStoredLocalOnly(
  incoming: boolean | undefined,
  existing: boolean | undefined,
  allowExplicitChange = false,
): boolean {
  if (allowExplicitChange) return incoming === true
  return incoming === true || existing === true
}

function updateSyncPending(chat: StoredChat): StoredChat {
  chat.syncPending = chatNeedsSync(chat)
  return chat
}

/**
 * Copies mutable chat containers without duplicating immutable attachment
 * payload strings. New nested message fields must be snapshotted here.
 */
export function snapshotChatForStorage(chat: Chat): Chat {
  return {
    ...chat,
    pendingRecoveries: chat.pendingRecoveries?.map((recovery) => ({
      ...recovery,
    })),
    messages: chat.messages.map((message) => ({
      ...message,
      attachments: message.attachments?.map((attachment) => ({
        ...attachment,
        pages: attachment.pages?.map((page) => ({ ...page })),
      })),
      annotations: message.annotations?.map((annotation) => ({
        ...annotation,
        url_citation: { ...annotation.url_citation },
      })),
      codeExecCalls: message.codeExecCalls?.map((call) => ({ ...call })),
      documents: message.documents?.map((document) => ({ ...document })),
      imageData: message.imageData?.map((image) => ({ ...image })),
      timeline: message.timeline
        ? structuredClone(message.timeline)
        : undefined,
      toolCalls: message.toolCalls?.map((call) => ({ ...call })),
      urlFetches: message.urlFetches?.map((urlFetch) => ({ ...urlFetch })),
      webSearch: message.webSearch
        ? {
            ...message.webSearch,
            sources: message.webSearch.sources?.map((source) => ({
              ...source,
            })),
          }
        : undefined,
    })),
  }
}

function attachmentHasPayload(attachment: Attachment): boolean {
  return (
    attachment.base64 !== undefined ||
    attachment.thumbnailBase64 !== undefined ||
    attachment.textContent !== undefined ||
    attachment.pages !== undefined
  )
}

function createAttachmentPayloadId(
  chatId: string,
  reservedPayloadIds: Set<string>,
): string {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new AttachmentPayloadIdUnavailableError()
  }

  const token = globalThis.crypto.randomUUID()
  const encodedChatId = bytesToHex(textEncoder.encode(chatId))
  const baseId = `${GENERATED_ATTACHMENT_PAYLOAD_PREFIX}${encodedChatId}:${token}`
  let payloadId = baseId
  let collision = 0
  while (reservedPayloadIds.has(payloadId)) {
    collision += 1
    payloadId = `${baseId}:${collision}`
  }
  reservedPayloadIds.add(payloadId)
  return payloadId
}

function normalizeAttachmentPayloads(chat: Chat): {
  messages: Message[]
  payloads: StoredAttachmentPayload[]
  referencedPayloadIds: Set<string>
} {
  const payloads: StoredAttachmentPayload[] = []
  const referencedPayloadIds = new Set<string>()
  const attachmentIdOccurrences = new Map<string, number>()
  const reservedPayloadIds = new Set<string>()
  const explicitlyReferencedPayloadIds = new Set<string>()

  for (const message of chat.messages) {
    for (const attachment of message.attachments ?? []) {
      reservedPayloadIds.add(`${chat.id}:${attachment.id}`)
      const storagePayloadId = (attachment as StoredAttachmentReference)
        .storagePayloadId
      if (storagePayloadId) {
        reservedPayloadIds.add(storagePayloadId)
        explicitlyReferencedPayloadIds.add(storagePayloadId)
      }
    }
  }

  const messages = chat.messages.map((message) => ({
    ...message,
    attachments: message.attachments?.map((attachment) => {
      const storedAttachment = attachment as StoredAttachmentReference
      const occurrence = attachmentIdOccurrences.get(attachment.id) ?? 0
      attachmentIdOccurrences.set(attachment.id, occurrence + 1)
      const legacyPayloadId = `${chat.id}:${attachment.id}`
      const referencedPayloadId = storedAttachment.storagePayloadId
      const payloadId =
        referencedPayloadId && !referencedPayloadIds.has(referencedPayloadId)
          ? referencedPayloadId
          : occurrence === 0 &&
              !referencedPayloadIds.has(legacyPayloadId) &&
              !explicitlyReferencedPayloadIds.has(legacyPayloadId)
            ? legacyPayloadId
            : createAttachmentPayloadId(chat.id, reservedPayloadIds)
      referencedPayloadIds.add(payloadId)
      const { base64, thumbnailBase64, textContent, pages, ...metadata } =
        storedAttachment

      if (attachmentHasPayload(attachment)) {
        payloads.push({
          id: payloadId,
          chatId: chat.id,
          base64,
          thumbnailBase64,
          textContent,
          pages,
        })
      }

      return {
        ...metadata,
        storagePayloadId: payloadId,
      }
    }),
  }))

  return {
    messages,
    payloads,
    referencedPayloadIds,
  }
}

function normalizeAttachmentPayloadsInTransaction(
  chat: Chat,
  transaction: IDBTransaction,
  reject: (reason?: unknown) => void,
): ReturnType<typeof normalizeAttachmentPayloads> | null {
  try {
    return normalizeAttachmentPayloads(chat)
  } catch (error) {
    transaction.abort()
    reject(error)
    return null
  }
}

function inheritAttachmentPayloadReferences(
  chat: Chat,
  existing: StoredChat | null | undefined,
): Chat {
  if (!existing) return chat
  type PayloadCandidate = {
    payloadId: string
    messageKey: string
    attachmentKey: string
    used: boolean
  }
  type IncomingAttachment = {
    attachment: StoredAttachmentReference
    messageKey: string
    attachmentKey: string
  }
  const candidatesByAttachmentId = new Map<string, PayloadCandidate[]>()
  const incomingByAttachmentId = new Map<string, IncomingAttachment[]>()

  const messageKey = (message: Message): string => {
    if (message.turnId) return `turn:${message.turnId}`
    const timestamp =
      message.timestamp instanceof Date
        ? message.timestamp.toISOString()
        : String(message.timestamp)
    return `${message.role}:${timestamp}`
  }
  const attachmentKey = (attachment: Attachment): string =>
    JSON.stringify([
      attachment.type,
      attachment.fileName,
      attachment.mimeType ?? null,
      attachment.fileSize ?? null,
    ])

  for (const message of existing.messages) {
    for (const attachment of message.attachments ?? []) {
      const storedAttachment = attachment as StoredAttachmentReference
      if (storedAttachment.storagePayloadId) {
        const candidates =
          candidatesByAttachmentId.get(storedAttachment.id) ?? []
        candidates.push({
          payloadId: storedAttachment.storagePayloadId,
          messageKey: messageKey(message),
          attachmentKey: attachmentKey(storedAttachment),
          used: false,
        })
        candidatesByAttachmentId.set(storedAttachment.id, candidates)
      }
    }
  }

  const messages = chat.messages.map((message) => ({
    ...message,
    attachments: message.attachments?.map((attachment) => {
      const clonedAttachment = { ...attachment } as StoredAttachmentReference
      const incoming = incomingByAttachmentId.get(attachment.id) ?? []
      incoming.push({
        attachment: clonedAttachment,
        messageKey: messageKey(message),
        attachmentKey: attachmentKey(attachment),
      })
      incomingByAttachmentId.set(attachment.id, incoming)
      return clonedAttachment
    }),
  }))

  for (const [attachmentId, incomingAttachments] of incomingByAttachmentId) {
    const candidates = candidatesByAttachmentId.get(attachmentId) ?? []

    for (const incoming of incomingAttachments) {
      const exactCandidates = candidates.filter(
        (candidate) =>
          !candidate.used && candidate.attachmentKey === incoming.attachmentKey,
      )
      const candidate =
        exactCandidates.find(
          (item) => item.messageKey === incoming.messageKey,
        ) ?? exactCandidates[0]
      if (!candidate) continue
      candidate.used = true
      if (
        !attachmentHasPayload(incoming.attachment) &&
        !incoming.attachment.storagePayloadId
      ) {
        incoming.attachment.storagePayloadId = candidate.payloadId
      }
    }

    for (const incoming of incomingAttachments) {
      if (
        attachmentHasPayload(incoming.attachment) ||
        incoming.attachment.storagePayloadId
      ) {
        continue
      }
      const candidate =
        candidates.find(
          (item) => !item.used && item.messageKey === incoming.messageKey,
        ) ?? candidates.find((item) => !item.used)
      if (!candidate) continue
      candidate.used = true
      incoming.attachment.storagePayloadId = candidate.payloadId
    }
  }

  return {
    ...chat,
    messages,
  }
}

function hydrateAttachmentPayloads(
  chat: StoredChat,
  payloads: StoredAttachmentPayload[],
): StoredChat {
  const payloadById = new Map(payloads.map((payload) => [payload.id, payload]))

  return {
    ...chat,
    messages: chat.messages.map((message) => ({
      ...message,
      attachments: message.attachments?.map((attachment) => {
        const { storagePayloadId, ...metadata } =
          attachment as StoredAttachmentReference
        const payload = storagePayloadId
          ? payloadById.get(storagePayloadId)
          : undefined
        if (!payload) return metadata
        const { id, chatId, ...content } = payload
        return { ...metadata, storagePayloadId, ...content }
      }),
    })),
  }
}

function deleteAttachmentPayloadsForChat(
  store: IDBObjectStore,
  chatId: string,
): void {
  const request = store
    .index(ATTACHMENT_PAYLOADS_CHAT_INDEX)
    .openKeyCursor(IDBKeyRange.only(chatId))
  request.onsuccess = () => {
    const cursor = request.result
    if (!cursor) return
    store.delete(cursor.primaryKey)
    cursor.continue()
  }
}

export class IndexedDBStorage {
  private db: IDBDatabase | null = null
  private initializationPromise: Promise<void> | null = null
  private saveQueue: Promise<unknown> = Promise.resolve()
  private syncPendingIndexReady = false
  private saveGeneration = 0
  // Account cleanup always reloads; keep this instance fail-closed until then.
  private accountResetStarted = false
  private accountResetPromise: Promise<void> | null = null
  private activeSaveGeneration: number | null = null
  private readonly accountResetSignal: Promise<never>
  private rejectAccountReads!: (reason: Error) => void

  constructor() {
    this.accountResetSignal = new Promise((_, reject) => {
      this.rejectAccountReads = reject
    })
    void this.accountResetSignal.catch(() => {})
  }

  async initialize(): Promise<void> {
    if (this.db) return
    if (this.initializationPromise) return this.initializationPromise

    // Check if IndexedDB is available
    if (typeof window === 'undefined' || !window.indexedDB) {
      throw new Error('IndexedDB not available')
    }

    const saveGeneration = this.saveGeneration
    const initializationPromise = new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = (event) => {
        const error = (event.target as IDBOpenDBRequest).error
        logError('IndexedDB open error', error, {
          component: 'IndexedDBStorage',
        })
        reject(
          new Error(
            `Failed to open database: ${error?.message || 'Unknown error'}`,
          ),
        )
      }

      request.onsuccess = () => {
        isUpgradeBlocked = false
        const db = request.result
        db.onversionchange = () => {
          db.close()
          if (this.db === db) {
            this.db = null
          }
        }

        if (saveGeneration !== this.saveGeneration) {
          db.close()
          reject(new Error('Database open superseded by account change'))
          return
        }

        this.db = db
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        try {
          if (!db.objectStoreNames.contains(CHATS_STORE)) {
            const store = db.createObjectStore(CHATS_STORE, { keyPath: 'id' })
            store.createIndex('lastAccessedAt', 'lastAccessedAt', {
              unique: false,
            })
            store.createIndex('createdAt', 'createdAt', { unique: false })
            // Add sync-related indexes
            store.createIndex('syncedAt', 'syncedAt', { unique: false })
            store.createIndex(CHATS_SYNC_PENDING_INDEX, 'syncPending', {
              unique: false,
            })
            store.createIndex(CHATS_PROJECT_INDEX, 'projectId', {
              unique: false,
            })
          } else {
            const store = request.transaction?.objectStore(CHATS_STORE)
            if (store?.indexNames.contains('locallyModified')) {
              store.deleteIndex('locallyModified')
            }
            if (store && !store.indexNames.contains(CHATS_PROJECT_INDEX)) {
              store.createIndex(CHATS_PROJECT_INDEX, 'projectId', {
                unique: false,
              })
            }
            if (store && !store.indexNames.contains(CHATS_SYNC_PENDING_INDEX)) {
              store.createIndex(CHATS_SYNC_PENDING_INDEX, 'syncPending', {
                unique: false,
              })
            }
          }
          if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
            const store = db.createObjectStore(PROJECTS_STORE, {
              keyPath: 'cacheKey',
            })
            store.createIndex(PROJECTS_USER_INDEX, 'userId', { unique: false })
          }
          if (!db.objectStoreNames.contains(MIGRATIONS_STORE)) {
            db.createObjectStore(MIGRATIONS_STORE, { keyPath: 'id' })
          }
          if (!db.objectStoreNames.contains(ATTACHMENT_PAYLOADS_STORE)) {
            const store = db.createObjectStore(ATTACHMENT_PAYLOADS_STORE, {
              keyPath: 'id',
            })
            store.createIndex(
              ATTACHMENT_PAYLOADS_CHAT_INDEX,
              ATTACHMENT_PAYLOADS_CHAT_INDEX,
              { unique: false },
            )
          }
          if ((event as IDBVersionChangeEvent).oldVersion === 0) {
            request.transaction?.objectStore(MIGRATIONS_STORE).put({
              id: SYNC_PENDING_MIGRATION_ID,
              completedAt: Date.now(),
            })
          }
        } catch (error) {
          logError('Failed to create object store', error, {
            component: 'IndexedDBStorage',
          })
          reject(new Error(`Failed to upgrade database: ${error}`))
        }
      }

      request.onblocked = () => {
        isUpgradeBlocked = true
        logWarning('IndexedDB upgrade blocked - close other tabs', {
          component: 'IndexedDBStorage',
        })
        window.dispatchEvent(new Event(INDEXED_DB_UPGRADE_BLOCKED_EVENT))
      }
    })

    this.initializationPromise = initializationPromise

    try {
      await initializationPromise
    } finally {
      if (this.initializationPromise === initializationPromise) {
        this.initializationPromise = null
      }
    }
  }

  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.initialize()
    }
    if (!this.db) {
      throw new Error('Database not initialized')
    }
    return this.db
  }

  private async waitForSaveQueue(): Promise<void> {
    if (this.accountResetStarted) {
      throw new Error(ACCOUNT_CHANGE_READ_ERROR)
    }
    await Promise.race([
      this.saveQueue.catch(() => {}),
      this.accountResetSignal,
    ])
    if (this.accountResetStarted) {
      throw new Error(ACCOUNT_CHANGE_READ_ERROR)
    }
  }

  private protectRead<T>(read: Promise<T>): Promise<T> {
    return Promise.race([read, this.accountResetSignal])
  }

  private assertActiveSaveGeneration(): void {
    if (
      this.accountResetStarted ||
      this.activeSaveGeneration !== this.saveGeneration
    ) {
      throw new Error(ACCOUNT_CHANGE_WRITE_ERROR)
    }
  }

  /**
   * Serialize a write behind every previously queued one. The
   * returned promise is the caller's view of the operation (typed
   * result, rejections included); the same promise becomes the new
   * queue tail so a failure is logged as "recovered" by whichever
   * operation queues next.
   */
  private enqueueSave<T>(
    action: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (this.accountResetStarted) {
      return Promise.reject(new Error(ACCOUNT_CHANGE_WRITE_ERROR))
    }

    const saveGeneration = this.saveGeneration
    const result = this.saveQueue
      .catch((error) => {
        logError('Previous save operation failed, recovering queue', error, {
          component: 'IndexedDBStorage',
          action: `${action}.queueRecovery`,
        })
      })
      .then(async () => {
        if (saveGeneration !== this.saveGeneration) {
          throw new Error(ACCOUNT_CHANGE_WRITE_ERROR)
        }
        this.activeSaveGeneration = saveGeneration
        try {
          return await operation()
        } finally {
          if (this.activeSaveGeneration === saveGeneration) {
            this.activeSaveGeneration = null
          }
        }
      })
    this.saveQueue = result
    return result
  }

  async resetForAccountChange(notifyOtherTabs = true): Promise<void> {
    if (this.accountResetPromise) return this.accountResetPromise

    if (notifyOtherTabs && typeof window !== 'undefined') {
      try {
        localStorage.setItem(AUTH_ACCOUNT_RESET_SIGNAL, crypto.randomUUID())
        localStorage.removeItem(AUTH_ACCOUNT_RESET_SIGNAL)
      } catch {
        // best-effort — this tab still clears and blocks its own storage
      }
    }

    this.accountResetStarted = true
    this.rejectAccountReads(new Error(ACCOUNT_CHANGE_READ_ERROR))
    this.saveGeneration += 1
    this.saveQueue = Promise.resolve()
    this.initializationPromise = null

    const db = this.db
    this.db = null
    db?.close()

    const reset = this.ensureDB().then(
      (resetDb) =>
        new Promise<void>((resolve, reject) => {
          const transaction = resetDb.transaction(
            [CHATS_STORE, PROJECTS_STORE, ATTACHMENT_PAYLOADS_STORE],
            'readwrite',
          )
          const timeout = window.setTimeout(() => {
            try {
              transaction.abort()
            } finally {
              reject(
                new Error('Timed out resetting IndexedDB for account change'),
              )
            }
          }, ACCOUNT_CHANGE_RESET_TIMEOUT_MS)

          transaction.oncomplete = () => {
            clearTimeout(timeout)
            resolve()
          }
          transaction.onerror = () => {
            clearTimeout(timeout)
            reject(new Error('Failed to reset IndexedDB for account change'))
          }
          transaction.onabort = () => {
            clearTimeout(timeout)
            reject(new Error('IndexedDB account reset was aborted'))
          }

          const chatsRequest = transaction.objectStore(CHATS_STORE).clear()
          chatsRequest.onerror = () => {
            clearTimeout(timeout)
            reject(new Error('Failed to clear chats for account change'))
          }
          const projectsRequest = transaction
            .objectStore(PROJECTS_STORE)
            .clear()
          projectsRequest.onerror = () => {
            clearTimeout(timeout)
            reject(new Error('Failed to clear projects for account change'))
          }
          const payloadsRequest = transaction
            .objectStore(ATTACHMENT_PAYLOADS_STORE)
            .clear()
          payloadsRequest.onerror = () => {
            clearTimeout(timeout)
            reject(
              new Error(
                'Failed to clear attachment payloads for account change',
              ),
            )
          }
        }),
    )

    const trackedReset = reset
    this.accountResetPromise = trackedReset
    this.saveQueue = trackedReset
    void trackedReset.then(
      () => {
        if (this.accountResetPromise === trackedReset) {
          this.accountResetPromise = null
        }
      },
      () => {
        if (this.accountResetPromise === trackedReset) {
          this.accountResetPromise = null
        }
      },
    )
    return trackedReset
  }

  async saveChat(chat: Chat): Promise<SaveChatResult> {
    const chatSnapshot = snapshotChatForStorage(chat)
    return this.enqueueSave('saveChat', () =>
      this.saveChatInternal(chatSnapshot),
    )
  }

  async saveExistingChat(chat: Chat): Promise<SaveChatResult> {
    const chatSnapshot = snapshotChatForStorage(chat)
    return this.enqueueSave('saveExistingChat', () =>
      this.saveChatInternal(chatSnapshot, { requireExisting: true }),
    )
  }

  async mutateChat(
    chatId: string,
    mutation: (chat: StoredChat) => {
      chat: StoredChat
      changed: boolean
    },
  ): Promise<StoredChat | null> {
    return this.enqueueSave('mutateChat', async () => {
      const db = await this.ensureDB()
      return new Promise<StoredChat | null>((resolve, reject) => {
        const transaction = db.transaction(
          [CHATS_STORE, ATTACHMENT_PAYLOADS_STORE],
          'readwrite',
        )
        const store = transaction.objectStore(CHATS_STORE)
        const payloadStore = transaction.objectStore(ATTACHMENT_PAYLOADS_STORE)
        let output: StoredChat | null = null

        transaction.oncomplete = () => resolve(output)
        transaction.onerror = () => reject(new Error('Failed to mutate chat'))
        transaction.onabort = () =>
          reject(new Error('Chat mutation transaction aborted'))

        const request = store.get(chatId)
        request.onerror = () => reject(new Error('Failed to read chat'))
        const payloadRequest = payloadStore
          .index(ATTACHMENT_PAYLOADS_CHAT_INDEX)
          .getAll(IDBKeyRange.only(chatId))
        payloadRequest.onerror = () =>
          reject(new Error('Failed to read attachment payloads'))
        // Requests fire in issue order within a transaction, so the chat
        // read has settled by the time the payload read succeeds.
        payloadRequest.onsuccess = () => {
          const stored = request.result as StoredChat | undefined
          if (!stored) return

          // The mutation sees (and callers receive) the hydrated chat so
          // attachment content survives the round trip; the write below
          // re-normalizes payloads back out of the chat record.
          const current = hydrateAttachmentPayloads(
            stored,
            payloadRequest.result as StoredAttachmentPayload[],
          )
          const result = mutation(current)
          if (!result.changed) {
            output = result.chat
            return
          }

          const clock = nextClock(current.clock)
          output = {
            ...result.chat,
            messages: result.chat.messages.map((message) => ({
              ...message,
              timestamp:
                message.timestamp instanceof Date
                  ? message.timestamp.toISOString()
                  : message.timestamp,
            })) as any,
            lastAccessedAt: Date.now(),
            clock: clock.v,
            writer: clock.w,
            locallyModified: computeLocallyModified({
              isFailedDecryption: current.decryptionFailed === true,
              existingChat: current,
              hasContentChanges: true,
              callerValue: result.chat.locallyModified,
            }),
            version: 1,
          }
          const mutated = updateSyncPending(output)
          const normalizedAttachments =
            normalizeAttachmentPayloadsInTransaction(
              mutated,
              transaction,
              reject,
            )
          if (!normalizedAttachments) return
          const writeChatAndPayloads = () => {
            for (const payload of normalizedAttachments.payloads) {
              const putRequest = payloadStore.put(payload)
              putRequest.onerror = () =>
                reject(
                  putRequest.error ??
                    new Error('Failed to save attachment payload'),
                )
            }
            store.put({
              ...mutated,
              messages: normalizedAttachments.messages as any,
            })
          }
          const payloadCursor = payloadStore
            .index(ATTACHMENT_PAYLOADS_CHAT_INDEX)
            .openCursor(IDBKeyRange.only(chatId))
          payloadCursor.onerror = () =>
            reject(new Error('Failed to reconcile attachment payloads'))
          payloadCursor.onsuccess = () => {
            const cursor = payloadCursor.result
            if (cursor) {
              if (
                !normalizedAttachments.referencedPayloadIds.has(
                  String(cursor.primaryKey),
                )
              ) {
                cursor.delete()
              }
              cursor.continue()
              return
            }
            writeChatAndPayloads()
          }
        }
      })
    })
  }

  private async saveChatInternal(
    chat: Chat,
    options: {
      requireExisting?: boolean
      markContentChangesAsLocal?: boolean
      allowLocalOnlyChange?: boolean
    } = {},
  ): Promise<SaveChatResult> {
    this.assertActiveSaveGeneration()
    const db = await this.ensureDB()
    this.assertActiveSaveGeneration()

    // Don't save blank chats to IndexedDB
    if ((chat as StoredChat).isBlankChat === true) {
      return {
        saved: false,
        isLocalOnly: (chat as StoredChat).isLocalOnly === true,
      }
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        [CHATS_STORE, ATTACHMENT_PAYLOADS_STORE],
        'readwrite',
      )
      const store = transaction.objectStore(CHATS_STORE)
      const payloadStore = transaction.objectStore(ATTACHMENT_PAYLOADS_STORE)
      let result: SaveChatResult = {
        saved: false,
        isLocalOnly: (chat as StoredChat).isLocalOnly === true,
      }

      transaction.oncomplete = () => {
        resolve(result)
      }

      transaction.onerror = (event) => {
        import('@/utils/error-handling').then(({ logError }) => {
          logError(
            '[IndexedDB] Transaction error',
            (event.target as any).error,
            {
              component: 'IndexedDBStorage',
              action: 'saveChatInternal',
            },
          )
        })
        reject(new Error('Failed to save chat'))
      }

      transaction.onabort = (event) => {
        import('@/utils/error-handling').then(({ logError }) => {
          logError(
            '[IndexedDB] Transaction aborted',
            (event.target as any).error,
            {
              component: 'IndexedDBStorage',
              action: 'saveChatInternal',
              metadata: { chatId: chat.id },
            },
          )
        })
        reject(transaction.error ?? new Error('Transaction aborted'))
      }

      const getRequest = store.get(chat.id)

      getRequest.onsuccess = () => {
        const existingChat = getRequest.result as StoredChat | undefined
        if (options.requireExisting && !existingChat) {
          return
        }

        const normalizedAttachments = normalizeAttachmentPayloadsInTransaction(
          chat,
          transaction,
          reject,
        )
        if (!normalizedAttachments) return
        const messagesForStorage = normalizedAttachments.messages.map(
          (msg) => ({
            ...msg,
            timestamp:
              msg.timestamp instanceof Date
                ? msg.timestamp.toISOString()
                : msg.timestamp,
          }),
        )

        // Determine if the chat's meaningful content has changed compared to existing version.
        // NOTE: We intentionally ignore `updatedAt` so we don't create sync churn from timestamps.
        const hasContentChanges = existingChat
          ? chatContentFingerprint({
              title: existingChat.title,
              projectId: existingChat.projectId,
              messages: existingChat.messages,
              pendingRecoveries: existingChat.pendingRecoveries,
            }) !==
            chatContentFingerprint({
              title: chat.title,
              projectId: (chat as StoredChat).projectId,
              messages: messagesForStorage,
              pendingRecoveries: (chat as StoredChat).pendingRecoveries,
            })
          : false

        // Never mark chats that failed to decrypt as locally modified.
        // These are placeholder chats with empty messages that should NOT be uploaded.
        // If we set locallyModified: true, they would overwrite real encrypted data on the server.
        const isFailedDecryption =
          (chat as StoredChat).decryptionFailed === true

        // Bump the edit clock only on a genuine local content edit: a
        // changed existing chat, or a brand-new locally-created one.
        // Re-saves that don't touch content (and synced writes) keep the
        // existing clock so they don't outrank a real concurrent edit.
        const bumpClock =
          !isFailedDecryption &&
          options.markContentChangesAsLocal !== false &&
          (hasContentChanges ||
            (!existingChat && ((chat as StoredChat).locallyModified ?? true)))
        const bumpedClock = bumpClock
          ? nextClock(existingChat?.clock ?? (chat as StoredChat).clock)
          : null

        const locallyModified = computeLocallyModified({
          isFailedDecryption,
          existingChat,
          hasContentChanges:
            options.markContentChangesAsLocal === false
              ? false
              : hasContentChanges,
          callerValue: (chat as StoredChat).locallyModified,
        })
        const isLocalOnly = resolveStoredLocalOnly(
          (chat as StoredChat).isLocalOnly,
          existingChat?.isLocalOnly,
          options.allowLocalOnlyChange,
        )
        const storedChat: StoredChat = {
          ...chat,
          messages: messagesForStorage as any,
          lastAccessedAt: Date.now(),
          syncedAt: existingChat?.syncedAt ?? (chat as StoredChat).syncedAt,
          clock:
            bumpedClock?.v ?? existingChat?.clock ?? (chat as StoredChat).clock,
          writer:
            bumpedClock?.w ??
            existingChat?.writer ??
            (chat as StoredChat).writer,
          clockVersion:
            existingChat?.clockVersion ?? (chat as StoredChat).clockVersion,
          // For existing chats: mark as modified if content changed, or preserve existing modified state
          // This ensures modified chats are always picked up for sync even if they were
          // loaded with locallyModified: false from a previous sync
          // For new chats: use provided value or default to true
          // IMPORTANT: Never mark failed-to-decrypt chats as modified - they are placeholders
          locallyModified,
          syncPending: chatNeedsSync({
            locallyModified,
            syncedAt: existingChat?.syncedAt ?? (chat as StoredChat).syncedAt,
            isLocalOnly,
            decryptionFailed: isFailedDecryption,
          }),
          syncVersion:
            existingChat?.syncVersion ?? (chat as StoredChat).syncVersion,
          decryptionFailed: (chat as StoredChat).decryptionFailed,
          dataCorrupted: (chat as StoredChat).dataCorrupted,
          version: 1,
          loadedAt:
            (chat as StoredChat).loadedAt ??
            existingChat?.loadedAt ??
            undefined,
          isLocalOnly,
        }
        result = { saved: true, isLocalOnly }

        const writeChatAndPayloads = () => {
          for (const payload of normalizedAttachments.payloads) {
            const payloadRequest = payloadStore.put(payload)
            payloadRequest.onerror = () =>
              reject(
                payloadRequest.error ??
                  new Error('Failed to save attachment payload'),
              )
          }
          const putRequest = store.put(storedChat)
          putRequest.onerror = () => reject(new Error('Failed to save chat'))
        }

        const payloadCursor = payloadStore
          .index(ATTACHMENT_PAYLOADS_CHAT_INDEX)
          .openCursor(IDBKeyRange.only(chat.id))
        payloadCursor.onerror = () =>
          reject(new Error('Failed to reconcile attachment payloads'))
        payloadCursor.onsuccess = () => {
          const cursor = payloadCursor.result
          if (cursor) {
            if (
              !normalizedAttachments.referencedPayloadIds.has(
                String(cursor.primaryKey),
              )
            ) {
              cursor.delete()
            }
            cursor.continue()
            return
          }
          writeChatAndPayloads()
        }
      }

      getRequest.onerror = () =>
        reject(new Error('Failed to check existing chat'))
    })
  }

  private async getStoredChatInternal(id: string): Promise<StoredChat | null> {
    const db = await this.ensureDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CHATS_STORE], 'readonly')
      const store = transaction.objectStore(CHATS_STORE)
      const request = store.get(id)

      request.onsuccess = () => {
        try {
          const chat = request.result as StoredChat | undefined
          resolve(chat ? deserializeStoredChat(chat) : null)
        } catch (error) {
          reject(error)
        }
      }
      request.onerror = () => reject(new Error('Failed to get chat'))
    })
  }

  private async getChatInternal(id: string): Promise<StoredChat | null> {
    const db = await this.ensureDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        [CHATS_STORE, ATTACHMENT_PAYLOADS_STORE],
        'readonly',
      )
      let chat: StoredChat | null = null
      let payloads: StoredAttachmentPayload[] = []
      const chatRequest = transaction.objectStore(CHATS_STORE).get(id)
      const payloadRequest = transaction
        .objectStore(ATTACHMENT_PAYLOADS_STORE)
        .index(ATTACHMENT_PAYLOADS_CHAT_INDEX)
        .getAll(IDBKeyRange.only(id))

      chatRequest.onsuccess = () => {
        try {
          const stored = chatRequest.result as StoredChat | undefined
          chat = stored ? deserializeStoredChat(stored) : null
        } catch (error) {
          reject(error)
        }
      }
      chatRequest.onerror = () => reject(new Error('Failed to get chat'))
      payloadRequest.onsuccess = () => {
        payloads = payloadRequest.result as StoredAttachmentPayload[]
      }
      payloadRequest.onerror = () =>
        reject(new Error('Failed to get attachment payloads'))
      transaction.oncomplete = () =>
        resolve(chat ? hydrateAttachmentPayloads(chat, payloads) : null)
    })
  }

  async getChat(id: string): Promise<StoredChat | null> {
    await this.waitForSaveQueue()
    return this.protectRead(
      this.getChatInternal(id).then((chat) => {
        if (chat) {
          this.updateLastAccessed(id).catch((error) =>
            logError('Failed to update last accessed time', error, {
              component: 'IndexedDBStorage',
              metadata: { chatId: id },
            }),
          )
        }
        return chat
      }),
    )
  }

  async deleteChat(id: string): Promise<void> {
    // Serialize through saveQueue so a deletion can't race with an in-flight
    // saveChatInternal that would resurrect the row after the delete.
    return this.enqueueSave('deleteChat', async () => {
      const db = await this.ensureDB()
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(
          [CHATS_STORE, ATTACHMENT_PAYLOADS_STORE],
          'readwrite',
        )
        const store = transaction.objectStore(CHATS_STORE)
        const request = store.delete(id)
        deleteAttachmentPayloadsForChat(
          transaction.objectStore(ATTACHMENT_PAYLOADS_STORE),
          id,
        )

        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(new Error('Failed to delete chat'))
        request.onerror = () => reject(new Error('Failed to delete chat'))
      })
    })
  }

  async deleteChatIfUnchanged(
    id: string,
    expectedUpdatedAt: string,
    isCurrent: () => boolean = () => true,
  ): Promise<boolean> {
    return this.enqueueSave('deleteChatIfUnchanged', async () => {
      if (!isCurrent()) return false
      const db = await this.ensureDB()
      if (!isCurrent()) return false
      return new Promise<boolean>((resolve, reject) => {
        const transaction = db.transaction(
          [CHATS_STORE, ATTACHMENT_PAYLOADS_STORE],
          'readwrite',
        )
        const store = transaction.objectStore(CHATS_STORE)
        let deleted = false
        const getRequest = store.get(id)

        getRequest.onsuccess = () => {
          if (!isCurrent()) return
          const chat = getRequest.result as StoredChat | undefined
          if (!chat || chat.updatedAt !== expectedUpdatedAt) return
          store.delete(id)
          deleteAttachmentPayloadsForChat(
            transaction.objectStore(ATTACHMENT_PAYLOADS_STORE),
            id,
          )
          deleted = true
        }
        transaction.oncomplete = () => resolve(deleted)
        transaction.onerror = () =>
          reject(new Error('Failed to conditionally delete chat'))
        getRequest.onerror = () =>
          reject(new Error('Failed to read chat for conditional deletion'))
      })
    })
  }

  async deleteAllNonLocalChats(): Promise<number> {
    return this.enqueueSave('deleteAllNonLocalChats', async () => {
      const db = await this.ensureDB()
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(
          [CHATS_STORE, ATTACHMENT_PAYLOADS_STORE],
          'readwrite',
        )
        const store = transaction.objectStore(CHATS_STORE)
        const request = store.openCursor()
        let deletedCount = 0

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
          if (cursor) {
            const chat = cursor.value as StoredChat
            if (!chat.isLocalOnly) {
              cursor.delete()
              deleteAttachmentPayloadsForChat(
                transaction.objectStore(ATTACHMENT_PAYLOADS_STORE),
                chat.id,
              )
              deletedCount++
            }
            cursor.continue()
          }
        }

        transaction.oncomplete = () => resolve(deletedCount)
        transaction.onerror = () =>
          reject(new Error('Failed to delete non-local chats'))
        request.onerror = () =>
          reject(new Error('Failed to delete non-local chats'))
      })
    })
  }

  async deleteChatsByProject(projectId: string): Promise<string[]> {
    // Serialize through saveQueue so deletions can't race with an in-flight
    // saveChatInternal that would resurrect a row after the delete.
    return this.enqueueSave('deleteChatsByProject', async () => {
      const db = await this.ensureDB()
      return new Promise<string[]>((resolve, reject) => {
        const transaction = db.transaction(
          [CHATS_STORE, ATTACHMENT_PAYLOADS_STORE],
          'readwrite',
        )
        const store = transaction.objectStore(CHATS_STORE)
        const request = store.openCursor()
        const deletedIds: string[] = []

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
          if (cursor) {
            const chat = cursor.value as StoredChat
            if (chat.projectId === projectId) {
              deletedIds.push(chat.id)
              cursor.delete()
              deleteAttachmentPayloadsForChat(
                transaction.objectStore(ATTACHMENT_PAYLOADS_STORE),
                chat.id,
              )
            }
            cursor.continue()
          }
        }

        transaction.oncomplete = () => resolve(deletedIds)
        transaction.onerror = () =>
          reject(new Error('Failed to delete project chats'))
        request.onerror = () =>
          reject(new Error('Failed to delete project chats'))
      })
    })
  }

  async getAllChatIds(): Promise<string[]> {
    await this.waitForSaveQueue()
    const db = await this.ensureDB()

    return this.protectRead(
      new Promise((resolve, reject) => {
        const transaction = db.transaction([CHATS_STORE], 'readonly')
        const store = transaction.objectStore(CHATS_STORE)
        const request = store.getAllKeys()

        request.onsuccess = () => {
          resolve((request.result as IDBValidKey[]).map((k) => String(k)))
        }
        request.onerror = () => reject(new Error('Failed to list chat IDs'))
      }),
    )
  }

  async getChatCount(): Promise<number> {
    await this.waitForSaveQueue()
    const db = await this.ensureDB()

    return this.protectRead(
      new Promise((resolve, reject) => {
        const transaction = db.transaction([CHATS_STORE], 'readonly')
        const store = transaction.objectStore(CHATS_STORE)
        const request = store.count()

        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(new Error('Failed to count chats'))
      }),
    )
  }

  async deleteAllChats(): Promise<number> {
    // Serialize through saveQueue so a clear() can't race with an in-flight
    // saveChatInternal that would re-insert a row after the wipe.
    return this.enqueueSave('deleteAllChats', async () => {
      const db = await this.ensureDB()
      return new Promise<number>((resolve, reject) => {
        const transaction = db.transaction(
          [CHATS_STORE, ATTACHMENT_PAYLOADS_STORE],
          'readwrite',
        )
        const store = transaction.objectStore(CHATS_STORE)
        const countRequest = store.count()
        let count = 0

        countRequest.onsuccess = () => {
          count = countRequest.result
          store.clear()
          transaction.objectStore(ATTACHMENT_PAYLOADS_STORE).clear()
        }

        transaction.oncomplete = () => resolve(count)
        transaction.onerror = () =>
          reject(new Error('Failed to clear chats store'))
        countRequest.onerror = () => reject(new Error('Failed to count chats'))
      })
    })
  }

  // Count chats that are eligible for cloud sync (everything except
  // local-only rows). Cheaper than getAllChats when the caller only
  // needs the total — avoids deserializing every stored message.
  async getCloudChatCount(): Promise<number> {
    await this.waitForSaveQueue()
    const db = await this.ensureDB()

    return this.protectRead(
      new Promise((resolve, reject) => {
        const transaction = db.transaction([CHATS_STORE], 'readonly')
        const store = transaction.objectStore(CHATS_STORE)
        const request = store.openCursor()
        let count = 0

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result
          if (cursor) {
            const chat = cursor.value
            if (!chat.isLocalOnly) {
              count++
            }
            cursor.continue()
          } else {
            resolve(count)
          }
        }

        request.onerror = () => reject(new Error('Failed to count chats'))
      }),
    )
  }

  async getProjectChatCount(projectId: string): Promise<number> {
    await this.waitForSaveQueue()
    const db = await this.ensureDB()

    return this.protectRead(
      new Promise((resolve, reject) => {
        const transaction = db.transaction([CHATS_STORE], 'readonly')
        const store = transaction.objectStore(CHATS_STORE)
        const request = store
          .index(CHATS_PROJECT_INDEX)
          .openCursor(IDBKeyRange.only(projectId))
        let count = 0

        request.onsuccess = () => {
          const cursor = request.result
          if (!cursor) {
            resolve(count)
            return
          }
          const chat = cursor.value as StoredChat
          if (!chat.isLocalOnly) {
            count += 1
          }
          cursor.continue()
        }
        request.onerror = () =>
          reject(new Error('Failed to count cached project chats'))
      }),
    )
  }

  async hasPendingChatRecoveries(): Promise<boolean> {
    await this.waitForSaveQueue()
    const db = await this.ensureDB()

    return this.protectRead(
      new Promise((resolve, reject) => {
        const transaction = db.transaction([CHATS_STORE], 'readonly')
        const store = transaction.objectStore(CHATS_STORE)
        const request = store.openCursor()

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>)
            .result
          if (!cursor) {
            resolve(false)
            return
          }
          const chat = cursor.value as StoredChat
          if ((chat.pendingRecoveries?.length ?? 0) > 0) {
            resolve(true)
            return
          }
          cursor.continue()
        }

        request.onerror = () =>
          reject(new Error('Failed to inspect pending chat recoveries'))
      }),
    )
  }

  async isChatHistoryAuthoritative(
    expectedCloudVersions: ReadonlyMap<string, number>,
  ): Promise<boolean> {
    await this.waitForSaveQueue()
    const db = await this.ensureDB()

    return this.protectRead(
      new Promise((resolve, reject) => {
        const transaction = db.transaction([CHATS_STORE], 'readonly')
        const store = transaction.objectStore(CHATS_STORE)
        const request = store.openCursor()
        const missingCloudVersions = new Map(expectedCloudVersions)

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>)
            .result
          if (!cursor) {
            resolve(missingCloudVersions.size === 0)
            return
          }
          const chat = cursor.value as StoredChat
          if (!chat.isLocalOnly) {
            const expectedVersion = missingCloudVersions.get(chat.id)
            if (
              chat.locallyModified ||
              chat.decryptionFailed ||
              expectedVersion === undefined ||
              chat.syncVersion !== expectedVersion
            ) {
              resolve(false)
              return
            }
            missingCloudVersions.delete(chat.id)
          }
          cursor.continue()
        }

        request.onerror = () =>
          reject(new Error('Failed to verify local chat history'))
      }),
    )
  }

  async getAllChats(): Promise<StoredChat[]> {
    await this.waitForSaveQueue()
    const db = await this.ensureDB()

    return this.protectRead(
      new Promise((resolve, reject) => {
        const transaction = db.transaction(
          [CHATS_STORE, ATTACHMENT_PAYLOADS_STORE],
          'readonly',
        )
        const store = transaction.objectStore(CHATS_STORE)
        // Sort by ID (primary key) which contains reverse timestamp
        const request = store.openCursor(null, 'next') // Ascending order on reverse timestamp = most recent first

        const chats: StoredChat[] = []
        let payloads: StoredAttachmentPayload[] = []
        const payloadRequest = transaction
          .objectStore(ATTACHMENT_PAYLOADS_STORE)
          .getAll()
        payloadRequest.onsuccess = () => {
          payloads = payloadRequest.result as StoredAttachmentPayload[]
        }
        payloadRequest.onerror = () =>
          reject(new Error('Failed to get attachment payloads'))

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result
          if (cursor) {
            try {
              chats.push(deserializeStoredChat(cursor.value as StoredChat))
              cursor.continue()
            } catch (error) {
              reject(error)
            }
          }
        }

        request.onerror = () => reject(new Error('Failed to get all chats'))
        transaction.oncomplete = () => {
          const payloadsByChat = new Map<string, StoredAttachmentPayload[]>()
          for (const payload of payloads) {
            const chatPayloads = payloadsByChat.get(payload.chatId)
            if (chatPayloads) chatPayloads.push(payload)
            else payloadsByChat.set(payload.chatId, [payload])
          }
          resolve(
            chats.map((chat) =>
              hydrateAttachmentPayloads(
                chat,
                payloadsByChat.get(chat.id) ?? [],
              ),
            ),
          )
        }
      }),
    )
  }

  async getProjectsForUser(userId: string): Promise<Project[]> {
    await this.waitForSaveQueue()
    const db = await this.ensureDB()

    return this.protectRead(
      new Promise((resolve, reject) => {
        const transaction = db.transaction([PROJECTS_STORE], 'readonly')
        const store = transaction.objectStore(PROJECTS_STORE)
        const request = store.index(PROJECTS_USER_INDEX).getAll(userId)

        request.onsuccess = () => {
          const projects = (request.result as StoredProject[])
            .map((record) => record.project)
            .sort(
              (a, b) =>
                new Date(b.updatedAt).getTime() -
                new Date(a.updatedAt).getTime(),
            )
          resolve(projects)
        }
        request.onerror = () =>
          reject(new Error('Failed to get cached projects'))
      }),
    )
  }

  async replaceProjectsForUser(
    userId: string,
    projects: Project[],
  ): Promise<void> {
    return this.enqueueSave('replaceProjectsForUser', async () => {
      const db = await this.ensureDB()
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([PROJECTS_STORE], 'readwrite')
        const store = transaction.objectStore(PROJECTS_STORE)
        const cursorRequest = store
          .index(PROJECTS_USER_INDEX)
          .openKeyCursor(IDBKeyRange.only(userId))

        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result
          if (cursor) {
            store.delete(cursor.primaryKey)
            cursor.continue()
            return
          }

          for (const project of projects) {
            const record: StoredProject = {
              cacheKey: `${userId}:${project.id}`,
              userId,
              project,
            }
            store.put(record)
          }
        }
        transaction.oncomplete = () => resolve()
        transaction.onerror = () =>
          reject(new Error('Failed to replace cached projects'))
      })
    })
  }

  async saveProjectForUser(userId: string, project: Project): Promise<void> {
    return this.enqueueSave('saveProjectForUser', async () => {
      const db = await this.ensureDB()
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([PROJECTS_STORE], 'readwrite')
        transaction.objectStore(PROJECTS_STORE).put({
          cacheKey: `${userId}:${project.id}`,
          userId,
          project,
        } satisfies StoredProject)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(new Error('Failed to cache project'))
      })
    })
  }

  async deleteProjectForUser(userId: string, projectId: string): Promise<void> {
    return this.enqueueSave('deleteProjectForUser', async () => {
      const db = await this.ensureDB()
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([PROJECTS_STORE], 'readwrite')
        transaction.objectStore(PROJECTS_STORE).delete(`${userId}:${projectId}`)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () =>
          reject(new Error('Failed to remove cached project'))
      })
    })
  }

  async deleteAllProjects(): Promise<void> {
    return this.enqueueSave('deleteAllProjects', async () => {
      const db = await this.ensureDB()
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([PROJECTS_STORE], 'readwrite')
        transaction.objectStore(PROJECTS_STORE).clear()
        transaction.oncomplete = () => resolve()
        transaction.onerror = () =>
          reject(new Error('Failed to clear cached projects'))
      })
    })
  }

  async clearAll(): Promise<void> {
    const db = await this.ensureDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        [CHATS_STORE, ATTACHMENT_PAYLOADS_STORE],
        'readwrite',
      )
      const store = transaction.objectStore(CHATS_STORE)
      const request = store.clear()
      transaction.objectStore(ATTACHMENT_PAYLOADS_STORE).clear()

      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(new Error('Failed to clear all chats'))
      request.onerror = () => reject(new Error('Failed to clear all chats'))
    })
  }

  private async updateLastAccessed(id: string): Promise<void> {
    return this.enqueueSave('updateLastAccessed', async () => {
      const db = await this.ensureDB()
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([CHATS_STORE], 'readwrite')
        const store = transaction.objectStore(CHATS_STORE)
        const request = store.get(id)

        transaction.oncomplete = () => resolve()
        transaction.onerror = () =>
          reject(new Error('Failed to update last accessed'))
        transaction.onabort = () =>
          reject(new Error('Last accessed update transaction aborted'))
        request.onerror = () =>
          reject(new Error('Failed to read chat for last accessed update'))
        request.onsuccess = () => {
          const chat = request.result as StoredChat | undefined
          if (!chat) return
          chat.lastAccessedAt = Date.now()
          store.put(updateSyncPending(chat))
        }
      })
    })
  }

  async getUnsyncedChats(): Promise<StoredChat[]> {
    const metadata = await this.getUnsyncedChatMetadata()
    const hydrated = await Promise.all(
      metadata.map((chat) => this.getChatInternal(chat.id)),
    )
    return hydrated.filter((chat): chat is StoredChat => chat !== null)
  }

  async getUnsyncedChatMetadata(): Promise<StoredChat[]> {
    await this.ensureSyncPendingIndex()
    await this.waitForSaveQueue()
    const db = await this.ensureDB()

    return this.protectRead(
      new Promise((resolve, reject) => {
        const transaction = db.transaction([CHATS_STORE], 'readonly')
        const store = transaction.objectStore(CHATS_STORE)
        const request = store.index(CHATS_SYNC_PENDING_INDEX).getAll(1)

        request.onsuccess = () => {
          try {
            resolve((request.result as StoredChat[]).map(deserializeStoredChat))
          } catch (error) {
            reject(error)
          }
        }
        request.onerror = () =>
          reject(new Error('Failed to get unsynced chats'))
      }),
    )
  }

  private async ensureSyncPendingIndex(): Promise<void> {
    if (this.syncPendingIndexReady) return
    return this.enqueueSave('ensureSyncPendingIndex', async () => {
      if (this.syncPendingIndexReady) return
      const db = await this.ensureDB()
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(
          [CHATS_STORE, MIGRATIONS_STORE],
          'readwrite',
        )
        const chatsStore = transaction.objectStore(CHATS_STORE)
        const migrationsStore = transaction.objectStore(MIGRATIONS_STORE)

        transaction.oncomplete = () => resolve()
        transaction.onerror = () =>
          reject(new Error('Failed to prepare the pending sync index'))
        transaction.onabort = () =>
          reject(new Error('Pending sync index migration was aborted'))

        const markerRequest = migrationsStore.get(SYNC_PENDING_MIGRATION_ID)
        markerRequest.onerror = () =>
          reject(new Error('Failed to read the pending sync migration'))
        markerRequest.onsuccess = () => {
          if (markerRequest.result) return

          const cursorRequest = chatsStore.openCursor()
          cursorRequest.onerror = () =>
            reject(new Error('Failed to migrate pending sync records'))
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result
            if (!cursor) {
              migrationsStore.put({
                id: SYNC_PENDING_MIGRATION_ID,
                completedAt: Date.now(),
              })
              return
            }

            const chat = cursor.value as StoredChat
            if (
              !Array.isArray(chat.messages) ||
              chat.messages.some(
                (message) => message === null || typeof message !== 'object',
              )
            ) {
              logError(
                'Skipping malformed chat during pending sync migration',
                new TypeError('Stored chat has invalid messages'),
                {
                  component: 'IndexedDBStorage',
                  action: 'ensureSyncPendingIndex',
                  metadata: { chatId: chat.id },
                },
              )
              if (chat.syncPending !== 0) {
                chat.syncPending = 0
                cursor.update(chat)
              }
              cursor.continue()
              return
            }
            const syncPending = chatNeedsSync(chat)
            if (chat.syncPending !== syncPending) {
              chat.syncPending = syncPending
              cursor.update(chat)
            }
            cursor.continue()
          }
        }
      })
      this.syncPendingIndexReady = true
    })
  }

  async markAsSynced(id: string, syncVersion: number): Promise<void> {
    return this.enqueueSave('markAsSynced', async () => {
      const db = await this.ensureDB()
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([CHATS_STORE], 'readwrite')
        const store = transaction.objectStore(CHATS_STORE)
        const request = store.get(id)

        transaction.oncomplete = () => resolve()
        transaction.onerror = () =>
          reject(new Error('Failed to mark as synced'))
        transaction.onabort = () =>
          reject(new Error('Mark as synced transaction aborted'))
        request.onerror = () =>
          reject(new Error('Failed to read chat before marking as synced'))
        request.onsuccess = () => {
          const chat = request.result as StoredChat | undefined
          if (!chat) return
          chat.syncedAt = Date.now()
          chat.locallyModified = false
          chat.syncVersion = syncVersion
          // The clock is now current as of this synced version, so a
          // later reader trusts it for arbitration.
          chat.clockVersion = syncVersion
          store.put(updateSyncPending(chat))
        }
      })
    })
  }

  /**
   * Rebase a chat's sync version onto the server's current version
   * while KEEPING `locallyModified` set. Used by last-write-wins
   * conflict resolution (§C5) when the local copy is the fresher
   * write: the next upload's If-Match must match the server's current
   * ETag so the CAS succeeds and the local content wins, instead of
   * looping on STALE_BLOB forever. Unlike `markAsSynced`, this never
   * clears the dirty flag, so the chat is still uploaded.
   */
  async rebaseSyncVersion(id: string, syncVersion: number): Promise<void> {
    return this.enqueueSave('rebaseSyncVersion', async () => {
      const db = await this.ensureDB()
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([CHATS_STORE], 'readwrite')
        const store = transaction.objectStore(CHATS_STORE)
        const request = store.get(id)

        transaction.oncomplete = () => resolve()
        transaction.onerror = () =>
          reject(new Error('Failed to rebase sync version'))
        transaction.onabort = () =>
          reject(new Error('Sync version rebase transaction aborted'))
        request.onerror = () =>
          reject(new Error('Failed to read chat before rebasing sync version'))
        request.onsuccess = () => {
          const chat = request.result as StoredChat | undefined
          if (!chat) return
          chat.syncVersion = syncVersion
          chat.locallyModified = true
          store.put(updateSyncPending(chat))
        }
      })
    })
  }

  /**
   * Atomic upload finalization (§C6 / §H5).
   *
   * Runs inside `saveQueue` so it is serialized with any concurrent
   * user saves. Re-reads the chat fresh and verifies its content fingerprint
   * before applying attachment id/key rewrites or clearing `locallyModified`.
   *
   * If a concurrent edit is detected, the new sync version is still
   * persisted but the chat stays `locallyModified=true` so the next
   * sync cycle uploads the new content.
   */
  async finalizeUpload(opts: {
    chatId: string
    rewrites: AttachmentRewrite[]
    preUploadUpdatedAt: string | undefined
    preUploadFingerprint: string
    syncVersion: number
  }): Promise<void> {
    return this.enqueueSave('finalizeUpload', async () => {
      const db = await this.ensureDB()
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(
          [CHATS_STORE, ATTACHMENT_PAYLOADS_STORE],
          'readwrite',
        )
        const store = transaction.objectStore(CHATS_STORE)
        const payloadStore = transaction.objectStore(ATTACHMENT_PAYLOADS_STORE)
        const chatRequest = store.get(opts.chatId)
        const payloadRequest = payloadStore
          .index(ATTACHMENT_PAYLOADS_CHAT_INDEX)
          .getAll(IDBKeyRange.only(opts.chatId))
        transaction.oncomplete = () => resolve()
        transaction.onerror = () =>
          reject(new Error('Failed to finalize upload'))
        transaction.onabort = () =>
          reject(new Error('Upload finalization transaction aborted'))
        chatRequest.onerror = () =>
          reject(new Error('Failed to read chat before finalizing upload'))
        payloadRequest.onerror = () =>
          reject(
            new Error('Failed to read attachment payloads before finalizing'),
          )
        payloadRequest.onsuccess = () => {
          const chat = chatRequest.result as StoredChat | undefined
          if (!chat) return

          const currentFingerprint = chatContentFingerprint(
            hydrateAttachmentPayloads(
              chat,
              payloadRequest.result as StoredAttachmentPayload[],
            ),
          )
          const concurrentEdit =
            (opts.preUploadUpdatedAt !== undefined &&
              chat.updatedAt !== opts.preUploadUpdatedAt) ||
            currentFingerprint !== opts.preUploadFingerprint

          if (!concurrentEdit && opts.rewrites.length > 0) {
            const rewritesByPayloadId = new Map(
              opts.rewrites
                .filter((rewrite) => rewrite.storagePayloadId)
                .map((rewrite) => [rewrite.storagePayloadId, rewrite]),
            )
            const rewritesByClientId = new Map<string, AttachmentRewrite[]>()
            for (const rewrite of opts.rewrites) {
              if (rewrite.storagePayloadId) continue
              const rewrites = rewritesByClientId.get(rewrite.clientId) ?? []
              rewrites.push(rewrite)
              rewritesByClientId.set(rewrite.clientId, rewrites)
            }
            const appliedRewrites = new Set<AttachmentRewrite>()
            for (const msg of chat.messages ?? []) {
              for (const att of msg.attachments ?? []) {
                const storedAttachment = att as StoredAttachmentReference
                const rewriteByPayloadId = storedAttachment.storagePayloadId
                  ? rewritesByPayloadId.get(storedAttachment.storagePayloadId)
                  : undefined
                const rewrite =
                  rewriteByPayloadId && !appliedRewrites.has(rewriteByPayloadId)
                    ? rewriteByPayloadId
                    : rewritesByClientId
                        .get(att.id)
                        ?.find((candidate) => !appliedRewrites.has(candidate))
                if (rewrite) {
                  appliedRewrites.add(rewrite)
                  att.id = rewrite.serverId
                  att.encryptionKey = rewrite.encryptionKey
                }
              }
            }
          }

          chat.syncVersion = opts.syncVersion
          if (!concurrentEdit) {
            chat.locallyModified = false
            chat.syncedAt = Date.now()
            // Clock is current as of the uploaded version. On a concurrent
            // edit the chat stays dirty and clockVersion intentionally lags
            // so the next upload re-stamps it.
            chat.clockVersion = opts.syncVersion
          }
          const normalizedAttachments =
            normalizeAttachmentPayloadsInTransaction(chat, transaction, reject)
          if (!normalizedAttachments) return
          chat.messages = normalizedAttachments.messages

          const writeChatAndPayloads = () => {
            for (const payload of normalizedAttachments.payloads) {
              payloadStore.put(payload)
            }
            store.put(updateSyncPending(chat))
          }
          const payloadCursor = payloadStore
            .index(ATTACHMENT_PAYLOADS_CHAT_INDEX)
            .openCursor(IDBKeyRange.only(chat.id))
          payloadCursor.onerror = () =>
            reject(new Error('Failed to reconcile finalized attachments'))
          payloadCursor.onsuccess = () => {
            const cursor = payloadCursor.result
            if (cursor) {
              if (
                !normalizedAttachments.referencedPayloadIds.has(
                  String(cursor.primaryKey),
                )
              ) {
                cursor.delete()
              }
              cursor.continue()
              return
            }
            writeChatAndPayloads()
          }
        }
      })
    })
  }

  /**
   * CAS ingest (§H6). Apply a remote chat locally only when the
   * on-disk row still matches the snapshot the caller observed.
   * Returns `{ applied: true }` on write and `{ applied: false }`
   * when an interleaved local edit means the remote would clobber
   * the user's in-progress work.
   *
   * Pass `expectedLocalUpdatedAt: undefined` to force the write
   * (e.g. last-write-wins conflict resolution).
   *
   * Pass `allowLocallyModified: true` to keep the timestamp CAS while
   * permitting an overwrite of a `locallyModified` row. Last-write-wins
   * conflict resolution uses this: the remote has already been judged
   * the winner, but the apply must still no-op if the local row changed
   * since that judgement (a TOCTOU edit during the remote download).
   */
  async applyRemoteChatIfFresh(opts: {
    chat: Chat
    syncVersion: number
    expectedLocalUpdatedAt: string | null | undefined
    setLoadedAt?: boolean
    allowLocallyModified?: boolean
    isCurrent?: () => boolean
  }): Promise<{ applied: boolean }> {
    return this.enqueueSave('applyRemoteChatIfFresh', async () => {
      const isCurrent = opts.isCurrent ?? (() => true)
      if (!isCurrent()) return { applied: false }
      const db = await this.ensureDB()
      if (!isCurrent()) return { applied: false }
      return new Promise<{ applied: boolean }>((resolve, reject) => {
        const transaction = db.transaction(
          [CHATS_STORE, ATTACHMENT_PAYLOADS_STORE],
          'readwrite',
        )
        const store = transaction.objectStore(CHATS_STORE)
        const payloadStore = transaction.objectStore(ATTACHMENT_PAYLOADS_STORE)
        const chatRequest = store.get(opts.chat.id)
        let applied = false
        let cancelled = false
        transaction.oncomplete = () => resolve({ applied })
        transaction.onerror = () => {
          if (!cancelled) reject(new Error('Failed to apply remote chat'))
        }
        transaction.onabort = () => {
          if (cancelled) resolve({ applied: false })
          else reject(new Error('Remote chat transaction aborted'))
        }
        chatRequest.onerror = () =>
          reject(new Error('Failed to read local chat before remote apply'))
        chatRequest.onsuccess = () => {
          if (!isCurrent()) return
          const existing = chatRequest.result as StoredChat | undefined

          if (opts.expectedLocalUpdatedAt !== undefined) {
            if (opts.expectedLocalUpdatedAt === null) {
              if (existing) return
            } else if (
              !existing ||
              existing.updatedAt !== opts.expectedLocalUpdatedAt ||
              (existing.locallyModified === true && !opts.allowLocallyModified)
            ) {
              return
            }
          }

          const normalizedAttachments =
            normalizeAttachmentPayloadsInTransaction(
              inheritAttachmentPayloadReferences(opts.chat, existing),
              transaction,
              reject,
            )
          if (!normalizedAttachments) return
          const messagesForStorage = normalizedAttachments.messages.map(
            (msg) => ({
              ...msg,
              timestamp:
                msg.timestamp instanceof Date
                  ? msg.timestamp.toISOString()
                  : msg.timestamp,
            }),
          )
          const storedChat: StoredChat = {
            ...opts.chat,
            messages: messagesForStorage as any,
            lastAccessedAt: Date.now(),
            syncedAt: Date.now(),
            locallyModified: false,
            syncPending: 0,
            syncVersion: opts.syncVersion,
            version: 1,
            loadedAt: opts.setLoadedAt
              ? Date.now()
              : ((opts.chat as StoredChat).loadedAt ?? existing?.loadedAt),
            isLocalOnly: (opts.chat as any).isLocalOnly ?? false,
          }
          if (!isCurrent()) return

          const writeChatAndPayloads = () => {
            for (const payload of normalizedAttachments.payloads) {
              payloadStore.put(payload)
            }
            store.put(storedChat)
            applied = true
          }
          const payloadCursor = payloadStore
            .index(ATTACHMENT_PAYLOADS_CHAT_INDEX)
            .openCursor(IDBKeyRange.only(opts.chat.id))
          payloadCursor.onerror = () =>
            reject(new Error('Failed to reconcile remote attachment payloads'))
          payloadCursor.onsuccess = () => {
            if (!isCurrent()) {
              cancelled = true
              transaction.abort()
              return
            }
            const cursor = payloadCursor.result
            if (cursor) {
              if (
                !normalizedAttachments.referencedPayloadIds.has(
                  String(cursor.primaryKey),
                )
              ) {
                cursor.delete()
              }
              cursor.continue()
              return
            }
            writeChatAndPayloads()
          }
        }
      })
    })
  }

  /**
   * Wipe sync metadata for every chat (§H4). Called after a
   * `start_fresh` rotation so subsequent pushes go up as fresh
   * creates instead of failing the next ETag CAS forever.
   */
  async resetSyncMetadataForAllChats(): Promise<void> {
    return this.enqueueSave('resetSyncMetadataForAllChats', async () => {
      const db = await this.ensureDB()
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([CHATS_STORE], 'readwrite')
        const store = transaction.objectStore(CHATS_STORE)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () =>
          reject(new Error('Failed to reset sync metadata'))

        const request = store.openCursor()
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
          if (!cursor) return
          const chat = cursor.value as StoredChat
          chat.syncVersion = 0
          chat.syncedAt = undefined
          chat.locallyModified = true
          cursor.update(updateSyncPending(chat))
          cursor.continue()
        }
        request.onerror = () =>
          reject(new Error('Failed to iterate chats for sync reset'))
      })
    })
  }

  async resetChatTimestamps(chatId: string): Promise<void> {
    return this.enqueueSave('resetChatTimestamps', async () => {
      const db = await this.ensureDB()
      const chat = await this.getStoredChatInternal(chatId)

      if (chat) {
        return new Promise<void>((resolve, reject) => {
          const transaction = db.transaction([CHATS_STORE], 'readwrite')
          const store = transaction.objectStore(CHATS_STORE)

          transaction.oncomplete = () => resolve()
          transaction.onerror = () =>
            reject(new Error('Failed to reset chat timestamps'))

          const now = new Date().toISOString()
          chat.createdAt = now
          chat.updatedAt = now
          chat.locallyModified = true
          chat.syncedAt = undefined

          const request = store.put(updateSyncPending(chat))

          request.onerror = () =>
            reject(new Error('Failed to reset chat timestamps'))
        })
      }
    })
  }

  async updateChatProject(
    chatId: string,
    projectId: string | null,
  ): Promise<void> {
    return this.enqueueSave('updateChatProject', async () => {
      const chat = await this.getStoredChatInternal(chatId)
      if (chat) {
        chat.projectId = projectId ?? undefined
        chat.locallyModified = true
        chat.updatedAt = new Date().toISOString()
        await this.saveChatInternal(chat)
      }
    })
  }

  async applyRemoteChatProject(
    chatId: string,
    projectId: string | null,
    expectedLocalUpdatedAt: string | null,
  ): Promise<boolean> {
    return this.enqueueSave('applyRemoteChatProject', async () => {
      const chat = await this.getStoredChatInternal(chatId)
      if (
        !chat ||
        chat.updatedAt !== expectedLocalUpdatedAt ||
        chat.locallyModified
      ) {
        return false
      }
      chat.projectId = projectId ?? undefined
      await this.saveChatInternal(chat, {
        markContentChangesAsLocal: false,
      })
      return true
    })
  }

  async updateChatLocalOnly(
    chatId: string,
    isLocalOnly: boolean,
  ): Promise<void> {
    return this.enqueueSave('updateChatLocalOnly', async () => {
      const chat = await this.getStoredChatInternal(chatId)
      if (chat) {
        chat.isLocalOnly = isLocalOnly
        chat.locallyModified = true
        chat.updatedAt = new Date().toISOString()
        await this.saveChatInternal(chat, { allowLocalOnlyChange: true })
      }
    })
  }
}

export const indexedDBStorage = new IndexedDBStorage()

export function handleIndexedDBAccountResetStorageEvent(
  storage: IndexedDBStorage,
  event: StorageEvent,
): void {
  if (event.key !== AUTH_ACCOUNT_RESET_SIGNAL || !event.newValue) return
  void storage
    .resetForAccountChange(false)
    .then(() => {
      sessionStorage.removeItem(AUTH_ACCOUNT_RESET_FAILED)
      window.location.reload()
    })
    .catch((error) => {
      logError(
        'Failed to reset IndexedDB after cross-tab account change',
        error,
        {
          component: 'IndexedDBStorage',
          action: 'crossTabAccountReset',
        },
      )
      sessionStorage.setItem(AUTH_ACCOUNT_RESET_FAILED, 'true')
      window.dispatchEvent(new CustomEvent(ACCOUNT_RESET_FAILED_EVENT))
    })
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    handleIndexedDBAccountResetStorageEvent(indexedDBStorage, event)
  })
}
