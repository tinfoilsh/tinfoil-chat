import type { Attachment } from '@/components/chat/types'
import { AUTH_ACTIVE_USER_ID } from '@/constants/storage-keys'
import {
  AuthTokenRefreshError,
  AuthTokenUnavailableError,
  authTokenManager,
} from '@/services/auth'
import { requirePrimaryKeyB64 } from '@/services/cloud/cek-encoding'
import {
  CloudBackupReadError,
  cloudStorage,
} from '@/services/cloud/cloud-storage'
import { projectStorage } from '@/services/cloud/project-storage'
import {
  indexedDBStorage,
  type StoredChat,
} from '@/services/storage/indexed-db'
import { SyncEnclaveError } from '@/services/sync-enclave'
import type { Project, ProjectDocument } from '@/types/project'
import { base64ToUint8Array } from '@/utils/binary-codec'
import { z } from 'zod'
import { NATIVE_BACKUP_LIMITS } from './constants'
import {
  deriveNativeBackupWarnings,
  type NativeBackupOmission,
  type NativeBackupV1Input,
  type NativeBackupV2Input,
} from './format'
import { detectNativeBackupImageMimeType } from './image-mime'
import {
  NativeBackupDataValidationError,
  classifyNativeBackupChat,
  sanitizeNativeBackupChat,
  sanitizeNativeBackupImage,
  sanitizeNativeBackupProject,
  sanitizeNativeBackupProjectDocument,
  sanitizeNativeBackupRelationships,
  type NativeBackupImageCandidate,
} from './sanitize'
const PAGE_SIZE = 500
const CONCURRENCY = 4
const STABLE_READ_ATTEMPTS = 3
const encoder = new TextEncoder()
type Listed = { id: string; syncVersion: number }
type Timed = Listed & { createdAt: string; updatedAt: string }
type DocumentItem = Timed & { projectId: string }
type Page<T> = Promise<{ items: T[]; next?: string }>
export interface NativeBackupCollectionDependencies {
  isAuthenticated(): Promise<boolean>
  activeUserId(): string | null
  requireUnlockedCek(): void
  listChats(token?: string): Page<Listed>
  getCloudChat(id: string): Promise<StoredChat | null>
  getCloudImage(value: Attachment): Promise<Uint8Array | null>
  listProjects(token?: string): Page<Timed>
  getProject(id: string): Promise<Project | null>
  listDocuments(projectId: string): Promise<DocumentItem[]>
  getDocument(projectId: string, id: string): Promise<ProjectDocument | null>
  getLocalChats(): Promise<StoredChat[]>
  getLocalChat(id: string): Promise<StoredChat | null>
}
export class NativeBackupCollectionError extends Error {
  constructor(
    public readonly kind: string,
    public readonly recordId: string,
    detail: string,
    public readonly category:
      | 'deleted'
      | 'unavailable'
      | 'invalid'
      | 'unstable'
      | 'systemic' = 'systemic',
    public readonly reason = 'collection_failed',
    public readonly omittable = false,
  ) {
    super(`Native backup collection failed for ${kind} ${recordId}: ${detail}`)
    this.name = 'NativeBackupCollectionError'
  }
}
function activeUserId() {
  try {
    return localStorage.getItem(AUTH_ACTIVE_USER_ID)
  } catch {
    return null
  }
}
const defaults: NativeBackupCollectionDependencies = {
  isAuthenticated: () => authTokenManager.isAuthenticated(),
  activeUserId,
  requireUnlockedCek: () => void requirePrimaryKeyB64(),
  listChats: async (continuationToken) => {
    const page = await cloudStorage.listChats({
      limit: PAGE_SIZE,
      continuationToken,
    })
    return { items: page.conversations, next: page.nextContinuationToken }
  },
  getCloudChat: (id) => cloudStorage.downloadChatForBackup(id),
  getCloudImage: (value) => cloudStorage.loadChatImageForBackup(value),
  listProjects: async (continuationToken) => {
    const page = await projectStorage.listProjects({
      limit: PAGE_SIZE,
      continuationToken,
    })
    return { items: page.projects, next: page.nextContinuationToken }
  },
  getProject: (id) => projectStorage.getProjectForBackup(id),
  listDocuments: async (id) =>
    (await projectStorage.listDocuments(id)).documents,
  getDocument: (projectId, id) =>
    projectStorage.getDocumentForBackup(projectId, id),
  getLocalChats: () => indexedDBStorage.getAllChats(),
  getLocalChat: (id) => indexedDBStorage.getChat(id),
}
function fail(kind: string, id: string, detail: string): never {
  throw new NativeBackupCollectionError(kind, id, detail)
}
function failItem(
  kind: string,
  id: string,
  detail: string,
  category: NativeBackupOmission['category'],
  reason: string,
): never {
  throw new NativeBackupCollectionError(
    kind,
    id,
    detail,
    category,
    reason,
    true,
  )
}
async function wait<T>(s: AbortSignal | undefined, read: () => Promise<T>) {
  s?.throwIfAborted()
  const value = await read()
  s?.throwIfAborted()
  return value
}
const detail = (error: unknown) =>
  error instanceof Error ? error.message : String(error)
const jsonSize = (value: unknown) =>
  encoder.encode(JSON.stringify(value)).length
function valid<T>(kind: string, id: string, parse: () => T): T {
  try {
    return parse()
  } catch (error) {
    if (error instanceof NativeBackupCollectionError) throw error
    if (
      !(error instanceof NativeBackupDataValidationError) &&
      !(error instanceof z.ZodError)
    )
      throw error
    return failItem(
      kind,
      id,
      `record is invalid: ${detail(error)}`,
      'invalid',
      'record_invalid',
    )
  }
}
function unique<T extends Listed>(
  values: T[],
  key: (value: T) => string = ({ id }) => id,
): T[] {
  const byId = new Map<string, T>()
  for (const value of values) {
    const identity = key(value)
    const old = byId.get(identity)
    if (!old || value.syncVersion >= old.syncVersion) byId.set(identity, value)
  }
  return [...byId.values()]
}
function throwIfAuthenticationError(error: unknown) {
  if (
    error instanceof AuthTokenUnavailableError ||
    error instanceof AuthTokenRefreshError ||
    (error instanceof SyncEnclaveError && error.status === 401)
  )
    throw error
}
async function pages<T extends Listed>(
  fn: (t?: string) => Page<T>,
  s?: AbortSignal,
  onDiscovered?: (count: number) => void,
) {
  const values: T[] = []
  let token: string | undefined
  do {
    const page = await wait(s, () => fn(token))
    onDiscovered?.(page.items.length)
    values.push(...page.items)
    token = page.next
  } while (token)
  return unique(values)
}
type CloudInventory = {
  chats: Listed[]
  projects: Timed[]
  documents: DocumentItem[]
  discovered: number
}
async function discoverCloudInventory(
  deps: NativeBackupCollectionDependencies,
  signal?: AbortSignal,
): Promise<CloudInventory> {
  let discovered = 0
  const add = (count: number) => {
    signal?.throwIfAborted()
    discovered += count
    if (discovered > NATIVE_BACKUP_LIMITS.discoveredRecords)
      fail('limits', 'collection', 'discovered record limit exceeded')
  }
  const [chats, projects] = await Promise.all([
    pages(deps.listChats, signal, add),
    pages(deps.listProjects, signal, add),
  ])
  const documents = unique(
    (
      await mapLimit(
        projects,
        async ({ id }) => {
          const items = await deps.listDocuments(id)
          add(items.length)
          return items
        },
        signal,
      )
    ).flat(),
    ({ projectId, id }) => JSON.stringify([projectId, id]),
  )
  return { chats, projects, documents, discovered }
}
function inventoryToken(inventory: CloudInventory): string {
  const keys = [
    ...inventory.chats.map(({ id, syncVersion }) => ['chat', id, syncVersion]),
    ...inventory.projects.map(({ id, syncVersion }) => [
      'project',
      id,
      syncVersion,
    ]),
    ...inventory.documents.map(({ projectId, id, syncVersion }) => [
      'document',
      projectId,
      id,
      syncVersion,
    ]),
  ]
  keys.sort((left, right) => {
    const a = JSON.stringify(left)
    const b = JSON.stringify(right)
    return a < b ? -1 : a > b ? 1 : 0
  })
  return JSON.stringify(keys)
}
async function refreshListed<T extends Listed>(
  kind: string,
  id: string,
  refresh: () => Promise<T[]>,
  signal?: AbortSignal,
): Promise<T> {
  for (let attempt = 0; attempt < STABLE_READ_ATTEMPTS; attempt++) {
    const item = unique(await wait(signal, refresh)).find(
      (candidate) => candidate.id === id,
    )
    if (item) return item
  }
  return failItem(kind, id, 'record was deleted', 'deleted', 'record_deleted')
}
async function mapLimit<T, R>(
  v: T[],
  fn: (v: T) => Promise<R>,
  s?: AbortSignal,
) {
  const output = new Array<R>(v.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, v.length) }, async () => {
      while (next < v.length) {
        s?.throwIfAborted()
        const index = next++
        output[index] = await wait(s, () => fn(v[index]))
      }
    }),
  )
  return output
}
type Pending = [number, number, number, number, number]
const budgetLimits: Array<[string, number]> = [
  ['message', NATIVE_BACKUP_LIMITS.messages],
  ['attachment', NATIVE_BACKUP_LIMITS.attachments],
  ['aggregate JSON size', NATIVE_BACKUP_LIMITS.aggregateJsonBytes],
  ['archive size', NATIVE_BACKUP_LIMITS.archiveBytes],
  ['archive entry', NATIVE_BACKUP_LIMITS.entries],
]
class Budget {
  private used: Pending = [0, 0, 0, 0, 1]
  private entityCount = 0
  entities(count: number) {
    this.entityCount += count
    this.limit('entity', this.entityCount, NATIVE_BACKUP_LIMITS.entities)
  }
  chat(value: ReturnType<typeof sanitizeNativeBackupChat>): Pending {
    const bytes = jsonSize(value)
    const count = value.messages.reduce(
      (sum, item) => sum + (item.attachments?.length ?? 0),
      0,
    )
    const pending: Pending = [value.messages.length, count, bytes, bytes, 1]
    this.check(pending)
    return pending
  }
  image(pending: Pending, metadata: unknown, bytes: Uint8Array) {
    this.limit('image size', bytes.length, NATIVE_BACKUP_LIMITS.imageBytes)
    const json = jsonSize(metadata)
    pending[2] += json
    pending[3] += json + bytes.length
    pending[4] += 2
    this.check(pending)
  }
  json(value: unknown, entity = false) {
    const bytes = jsonSize(value)
    this.commit([0, 0, bytes, bytes, 1], entity)
  }
  metadata(value: unknown) {
    const bytes = jsonSize(value) + 1
    this.commit([0, 0, bytes, bytes, 0])
  }
  commit(value: Pending, entity = false) {
    if (entity) this.entities(1)
    this.check(value)
    value.forEach((amount, index) => (this.used[index] += amount))
  }
  private check(value: Pending) {
    budgetLimits.forEach(([label, limit], index) =>
      this.limit(label, this.used[index] + value[index], limit),
    )
  }
  private limit(label: string, value: number, maximum: number) {
    if (value > maximum) fail('limits', 'collection', `${label} limit exceeded`)
  }
}
async function readRecord<T>(
  kind: string,
  id: string,
  read: () => Promise<T | null>,
  signal?: AbortSignal,
  missing: {
    detail: string
    category: NativeBackupOmission['category']
    reason: string
  } = {
    detail: 'record is missing',
    category: 'deleted',
    reason: 'record_not_found',
  },
) {
  let lastError: NativeBackupCollectionError | undefined
  for (let attempt = 0; attempt < STABLE_READ_ATTEMPTS; attempt++) {
    try {
      const value = await wait(signal, read)
      return (
        value ??
        failItem(kind, id, missing.detail, missing.category, missing.reason)
      )
    } catch (error) {
      signal?.throwIfAborted()
      throwIfAuthenticationError(error)
      if (error instanceof CloudBackupReadError) {
        if (!error.omittable) throw error
        lastError = new NativeBackupCollectionError(
          kind,
          id,
          'record could not be decoded',
          error.category === 'item_invalid' ? 'invalid' : 'unavailable',
          error.reason,
          true,
        )
      } else if (
        error instanceof NativeBackupCollectionError &&
        error.omittable
      ) {
        lastError = error
      } else {
        throw error
      }
    }
  }
  throw lastError!
}
async function stable<T extends { syncVersion?: number }, I extends Listed>(
  kind: string,
  initial: I,
  read: () => Promise<T | null>,
  refresh: () => Promise<I[]>,
  signal?: AbortSignal,
): Promise<{ value: T; item: I }> {
  let item = initial
  for (let attempt = 0; attempt < STABLE_READ_ATTEMPTS; attempt++) {
    const value = await readRecord(kind, item.id, read, signal)
    if (value.syncVersion === item.syncVersion) return { value, item }
    item = await refreshListed(kind, item.id, refresh, signal)
  }
  return failItem(
    kind,
    item.id,
    'version changed during collection',
    'unstable',
    'version_did_not_converge',
  )
}
async function timed<T extends { syncVersion?: number }, I extends Timed, R>(
  kind: string,
  item: I,
  read: () => Promise<T | null>,
  refresh: () => Promise<I[]>,
  sanitize: (value: unknown) => R,
  budget: Budget,
  signal?: AbortSignal,
) {
  const current = await stable(kind, item, read, refresh, signal)
  const value = valid(kind, item.id, () =>
    sanitize({
      ...current.value,
      createdAt: current.item.createdAt,
      updatedAt: current.item.updatedAt,
    }),
  )
  budget.json(value, true)
  return value
}
function portable(chat: StoredChat, images?: NativeBackupImageCandidate[]) {
  return sanitizeNativeBackupChat(chat, (candidate) => {
    images?.push(candidate)
    return candidate.sourceKey
  })
}
function imagePayload(chat: StoredChat, candidate: NativeBackupImageCandidate) {
  const message = chat.messages[candidate.messageIndex]
  const attachment =
    candidate.attachmentIndex === undefined
      ? undefined
      : message.attachments?.[candidate.attachmentIndex]
  return candidate.legacyIndex !== undefined
    ? message.imageData?.[candidate.legacyIndex]?.base64
    : candidate.page !== undefined
      ? attachment?.pages?.find(({ page }) => page === candidate.page)?.image
      : attachment?.base64
}
function localToken(chat: StoredChat) {
  const images: NativeBackupImageCandidate[] = []
  const value = valid('local chat', chat.id, () => portable(chat, images))
  return JSON.stringify([
    value,
    images.map((candidate) => [candidate, imagePayload(chat, candidate)]),
    chat.isLocalOnly,
    chat.isBlankChat,
    chat.isTemporary,
    chat.syncUserId,
    (chat as StoredChat & { userId?: string }).userId,
  ])
}
function localEligible(chat: StoredChat, userId: string) {
  const owned =
    chat.syncUserId === userId ||
    (chat as StoredChat & { userId?: string }).userId === userId
  return (
    chat.isLocalOnly === true &&
    classifyNativeBackupChat(chat, owned ? 'signed_in' : 'anonymous') ===
      'local'
  )
}
function localInventoryToken(chats: StoredChat[], userId: string): string {
  const values = chats.flatMap((chat) => {
    if (!localEligible(chat, userId)) return []
    try {
      return [[chat.id, localToken(chat)]]
    } catch (error) {
      if (error instanceof NativeBackupCollectionError && error.omittable)
        return [[chat.id, error.category, error.reason]]
      throw error
    }
  })
  values.sort((left, right) =>
    left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0,
  )
  return JSON.stringify(values)
}
async function collectChat(
  chat: StoredChat,
  cloud: boolean,
  deps: NativeBackupCollectionDependencies,
  budget: Budget,
  signal?: AbortSignal,
  allowPartial = false,
) {
  const candidates: NativeBackupImageCandidate[] = []
  const value = valid(cloud ? 'cloud chat' : 'local chat', chat.id, () =>
    portable(chat, candidates),
  )
  const pending = budget.chat(value)
  const images: Array<{
    metadata: ReturnType<typeof sanitizeNativeBackupImage>
    bytes: Uint8Array
  }> = []
  const omitted: Array<{
    candidate: NativeBackupImageCandidate
    failure: NativeBackupCollectionError
  }> = []
  for (const candidate of candidates) {
    try {
      const attachment =
        candidate.attachmentIndex === undefined
          ? undefined
          : chat.messages[candidate.messageIndex].attachments?.[
              candidate.attachmentIndex
            ]
      const base64 = imagePayload(chat, candidate)
      let bytes: Uint8Array | null = null
      try {
        if (base64) {
          try {
            bytes = base64ToUint8Array(base64)
          } catch (error) {
            if (
              !(error instanceof Error) ||
              error.name !== 'InvalidCharacterError'
            )
              throw error
            failItem(
              'image',
              candidate.sourceKey,
              'image bytes are invalid',
              'invalid',
              'attachment_payload_invalid',
            )
          }
        } else if (cloud && attachment) {
          bytes = await readRecord(
            'image',
            candidate.sourceKey,
            () => deps.getCloudImage(attachment),
            signal,
            {
              detail: 'image bytes are missing',
              category: 'unavailable',
              reason: 'attachment_not_found',
            },
          )
        }
      } catch (error) {
        signal?.throwIfAborted()
        throwIfAuthenticationError(error)
        throw error
      }
      if (!bytes)
        failItem(
          'image',
          candidate.sourceKey,
          'image bytes are missing',
          'unavailable',
          'attachment_not_found',
        )
      const mimeType =
        detectNativeBackupImageMimeType(bytes) ??
        failItem(
          'image',
          candidate.sourceKey,
          'image type is unsupported',
          'invalid',
          'attachment_type_unsupported',
        )
      if (candidate.legacyIndex !== undefined)
        value.messages[candidate.messageIndex].imageData![
          candidate.legacyIndex
        ].mimeType = mimeType
      const metadata = valid('image', candidate.sourceKey, () =>
        sanitizeNativeBackupImage({
          ...candidate,
          id: candidate.sourceKey,
          mimeType,
          sizeBytes: bytes.length,
        }),
      )
      budget.image(pending, metadata, bytes)
      images.push({ metadata, bytes })
    } catch (error) {
      if (
        !allowPartial ||
        !(error instanceof NativeBackupCollectionError) ||
        !error.omittable
      )
        throw error
      omitted.push({ candidate, failure: error })
    }
  }
  if (omitted.length) removeOmittedImageReferences(value, omitted, images)
  return { chat: value, images, pending, omitted }
}

function removeOmittedImageReferences(
  chat: ReturnType<typeof sanitizeNativeBackupChat>,
  omitted: Array<{ candidate: NativeBackupImageCandidate }>,
  images: Array<{ metadata: ReturnType<typeof sanitizeNativeBackupImage> }>,
) {
  const candidates = omitted.map(({ candidate }) => candidate)
  const pageCandidates = candidates.filter(
    ({ page, legacyIndex }) => page !== undefined && legacyIndex === undefined,
  )
  for (const candidate of pageCandidates) {
    const message = chat.messages[candidate.messageIndex]
    const attachment = message.attachments?.[candidate.attachmentIndex!]
    if (attachment?.type === 'document') {
      const page = attachment.pages?.find(({ page }) => page === candidate.page)
      if (page) delete page.imageId
    }
  }

  const directCandidates = candidates
    .filter(
      ({ attachmentIndex, page, legacyIndex }) =>
        attachmentIndex !== undefined &&
        page === undefined &&
        legacyIndex === undefined,
    )
    .sort(
      (left, right) =>
        right.messageIndex - left.messageIndex ||
        right.attachmentIndex! - left.attachmentIndex!,
    )
  for (const candidate of directCandidates)
    chat.messages[candidate.messageIndex].attachments?.splice(
      candidate.attachmentIndex!,
      1,
    )

  const legacyCandidates = candidates
    .filter(({ legacyIndex }) => legacyIndex !== undefined)
    .sort(
      (left, right) =>
        right.messageIndex - left.messageIndex ||
        right.legacyIndex! - left.legacyIndex!,
    )
  for (const candidate of legacyCandidates)
    chat.messages[candidate.messageIndex].imageData?.splice(
      candidate.legacyIndex!,
      1,
    )
  for (const { metadata } of images) {
    if (metadata.legacyIndex === undefined) continue
    metadata.legacyIndex -= legacyCandidates.filter(
      (candidate) =>
        candidate.messageIndex === metadata.messageIndex &&
        candidate.legacyIndex! < metadata.legacyIndex!,
    ).length
  }
}
async function retryChat<K>(
  kind: string,
  id: string,
  expected: K,
  read: () => Promise<StoredChat | null>,
  revision: (chat: StoredChat) => K,
  eligible: (chat: StoredChat) => boolean,
  refresh: (chat: StoredChat) => Promise<K>,
  collect: (chat: StoredChat) => ReturnType<typeof collectChat>,
  signal?: AbortSignal,
) {
  for (let attempt = 0; attempt < STABLE_READ_ATTEMPTS; attempt++) {
    const chat = await readRecord(kind, id, read, signal)
    const current = revision(chat)
    if (current !== expected) {
      expected = await wait(signal, () => refresh(chat))
      continue
    }
    if (!eligible(chat)) return null
    const result = await collect(chat)
    const verify = await readRecord(kind, id, read, signal)
    if (revision(verify) === current) return result
    expected = await wait(signal, () => refresh(verify))
  }
  return failItem(
    kind,
    id,
    'version changed during collection',
    'unstable',
    'version_did_not_converge',
  )
}

async function collectNativeBackup(
  deps: NativeBackupCollectionDependencies = defaults,
  signal?: AbortSignal,
  allowPartial = false,
  inventoryAttempt = 0,
  localInventoryAttempt = 0,
): Promise<NativeBackupV2Input> {
  if (!(await wait(signal, () => deps.isAuthenticated())))
    fail('account', 'active', 'signed-in user is required')
  const userId = deps.activeUserId()
  if (!userId) fail('account', 'active', 'signed-in owner is unavailable')
  try {
    deps.requireUnlockedCek()
  } catch {
    fail('account', userId, 'cloud encryption key is locked or unavailable')
  }
  const [inventory, localSnapshots] = await Promise.all([
    discoverCloudInventory(deps, signal),
    wait(signal, () => deps.getLocalChats()),
  ])
  if (
    inventory.discovered + localSnapshots.length >
    NATIVE_BACKUP_LIMITS.discoveredRecords
  )
    fail('limits', 'collection', 'discovered record limit exceeded')
  const chatItems = inventory.chats
  const projectItems = inventory.projects
  const allDocumentItems = inventory.documents
  const initialLocalInventoryToken = localInventoryToken(localSnapshots, userId)
  const budget = new Budget()
  const omissions: NativeBackupOmission[] = []
  const addOmission = (omission: NativeBackupOmission) => {
    signal?.throwIfAborted()
    if (omissions.length >= NATIVE_BACKUP_LIMITS.omissions)
      fail('limits', 'collection', 'omission limit exceeded')
    budget.metadata(omission)
    omissions.push(omission)
  }
  const omit = (
    kind: NativeBackupOmission['kind'],
    sourceId: string,
    error: unknown,
    parentSourceId?: string,
  ) => {
    if (
      !allowPartial ||
      !(error instanceof NativeBackupCollectionError) ||
      !error.omittable
    )
      throw error
    addOmission({
      kind,
      source_id: sourceId,
      ...(parentSourceId ? { parent_source_id: parentSourceId } : {}),
      category: error.category as NativeBackupOmission['category'],
      reason: error.reason,
    })
  }
  const projects = []
  for (const item of projectItems) {
    try {
      projects.push(
        await timed(
          'project',
          item,
          () => deps.getProject(item.id),
          () => pages(deps.listProjects, signal),
          sanitizeNativeBackupProject,
          budget,
          signal,
        ),
      )
    } catch (error) {
      omit('project', item.id, error)
    }
  }
  const includedProjectIds = new Set(projects.map(({ id }) => id))
  const documentItems = allDocumentItems.filter(({ projectId }) =>
    includedProjectIds.has(projectId),
  )
  const projectDocuments = []
  for (const item of documentItems) {
    try {
      projectDocuments.push(
        await timed(
          'project document',
          item,
          () => deps.getDocument(item.projectId, item.id),
          () => deps.listDocuments(item.projectId),
          sanitizeNativeBackupProjectDocument,
          budget,
          signal,
        ),
      )
    } catch (error) {
      omit('project_document', item.id, error, item.projectId)
    }
  }
  for (const item of projectItems.filter(
    ({ id }) => !includedProjectIds.has(id),
  )) {
    for (const document of allDocumentItems.filter(
      ({ projectId }) => projectId === item.id,
    ))
      addOmission({
        kind: 'project_document',
        source_id: document.id,
        parent_source_id: item.id,
        category: 'unavailable',
        reason: 'parent_project_omitted',
      })
  }
  const cloudResults = []
  for (const listed of chatItems) {
    try {
      const result = await retryChat(
        'cloud chat',
        listed.id,
        listed.syncVersion,
        () => deps.getCloudChat(listed.id),
        ({ syncVersion }) => syncVersion,
        (chat) => classifyNativeBackupChat(chat, 'cloud') !== null,
        async () =>
          (
            await refreshListed(
              'cloud chat',
              listed.id,
              () => pages(deps.listChats, signal),
              signal,
            )
          ).syncVersion,
        (chat) => collectChat(chat, true, deps, budget, signal, allowPartial),
        signal,
      )
      if (!result) continue
      budget.commit(result.pending, true)
      cloudResults.push(result)
      for (const { failure } of result.omitted)
        omit('attachment', failure.recordId, failure, listed.id)
    } catch (error) {
      omit('cloud_chat', listed.id, error)
    }
  }
  const localResults = []
  for (const snapshot of localSnapshots) {
    if (!localEligible(snapshot, userId)) continue
    try {
      const result = await retryChat(
        'local chat',
        snapshot.id,
        localToken(snapshot),
        () => deps.getLocalChat(snapshot.id),
        localToken,
        (chat) => localEligible(chat, userId),
        async (chat) => localToken(chat),
        (chat) => collectChat(chat, false, deps, budget, signal, allowPartial),
        signal,
      )
      if (!result) continue
      budget.commit(result.pending, true)
      localResults.push(result)
      for (const { failure } of result.omitted)
        omit('attachment', failure.recordId, failure, snapshot.id)
    } catch (error) {
      omit('local_chat', snapshot.id, error)
    }
  }
  const cloudChats = cloudResults.map(({ chat }) => chat)
  const localChats = localResults.map(({ chat }) => chat)
  for (const chat of [...cloudChats, ...localChats]) {
    if (chat.projectId && !includedProjectIds.has(chat.projectId)) {
      addOmission({
        kind: 'relationship',
        source_id: chat.id,
        parent_source_id: chat.projectId,
        category: 'unavailable',
        reason: 'project_reference_unavailable',
      })
      delete chat.projectId
    }
  }
  const images = [...cloudResults, ...localResults].flatMap(
    ({ images }) => images,
  )
  const relationships = sanitizeNativeBackupRelationships({
    projectChats: [...cloudChats, ...localChats].flatMap((chat) =>
      chat.projectId ? [{ projectId: chat.projectId, chatId: chat.id }] : [],
    ),
    projectDocuments: projectDocuments.map(({ projectId, id }) => ({
      projectId,
      documentId: id,
    })),
    chatImages: images.map(({ metadata }) => ({
      chatId: metadata.chatId,
      imageId: metadata.id,
    })),
  })
  budget.json(relationships)
  signal?.throwIfAborted()
  const [finalInventory, finalLocalSnapshots] = await Promise.all([
    discoverCloudInventory(deps, signal),
    wait(signal, () => deps.getLocalChats()),
  ])
  if (
    finalInventory.discovered + finalLocalSnapshots.length >
    NATIVE_BACKUP_LIMITS.discoveredRecords
  )
    fail('limits', 'collection', 'discovered record limit exceeded')
  const cloudChanged =
    inventoryToken(finalInventory) !== inventoryToken(inventory)
  const localChanged =
    localInventoryToken(finalLocalSnapshots, userId) !==
    initialLocalInventoryToken
  if (cloudChanged) {
    if (inventoryAttempt + 1 >= NATIVE_BACKUP_LIMITS.inventoryAttempts)
      fail('inventory', 'cloud', 'cloud inventory did not converge')
    return collectNativeBackup(
      deps,
      signal,
      allowPartial,
      inventoryAttempt + 1,
      localChanged ? localInventoryAttempt + 1 : localInventoryAttempt,
    )
  }
  if (localChanged) {
    if (localInventoryAttempt + 1 < NATIVE_BACKUP_LIMITS.inventoryAttempts)
      return collectNativeBackup(
        deps,
        signal,
        allowPartial,
        inventoryAttempt,
        localInventoryAttempt + 1,
      )
    if (!allowPartial)
      fail('inventory', 'local', 'local inventory did not converge')
    addOmission({
      kind: 'local_inventory',
      source_id: 'eligible_local_chats',
      category: 'unstable',
      reason: 'inventory_did_not_converge',
    })
  }
  const warnings = deriveNativeBackupWarnings(omissions)
  for (const warning of warnings) budget.metadata(warning)
  const input: NativeBackupV2Input = {
    backupId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    projects,
    projectDocuments,
    cloudChats,
    localChats,
    relationships,
    images,
    omissions,
    warnings,
  }
  return input
}

export async function collectNativeBackupV1(
  deps: NativeBackupCollectionDependencies = defaults,
  signal?: AbortSignal,
): Promise<NativeBackupV1Input> {
  return collectNativeBackup(deps, signal, false)
}

export async function collectNativeBackupV2(
  deps: NativeBackupCollectionDependencies = defaults,
  signal?: AbortSignal,
): Promise<NativeBackupV2Input> {
  return collectNativeBackup(deps, signal, true)
}
