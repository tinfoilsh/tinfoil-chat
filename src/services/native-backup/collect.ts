import type { Attachment, Message } from '@/components/chat/types'
import { AUTH_ACTIVE_USER_ID } from '@/constants/storage-keys'
import { authTokenManager } from '@/services/auth'
import { requirePrimaryKeyB64 } from '@/services/cloud/cek-encoding'
import { cloudStorage } from '@/services/cloud/cloud-storage'
import { projectStorage } from '@/services/cloud/project-storage'
import {
  indexedDBStorage,
  type StoredChat,
} from '@/services/storage/indexed-db'
import type { Project, ProjectDocument } from '@/types/project'
import { base64ToUint8Array } from '@/utils/binary-codec'
import { NATIVE_BACKUP_LIMITS } from './constants'
import { formatNativeBackupV1, type NativeBackupV1Input } from './format'
import {
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
  getCloudChat: (id) => cloudStorage.downloadChat(id),
  getCloudImage: async (value) => {
    const message = { attachments: [value] } as Message
    const encoded = (await cloudStorage.loadChatImages('', [message]))[value.id]
    return encoded ? base64ToUint8Array(encoded) : null
  },
  listProjects: async (continuationToken) => {
    const page = await projectStorage.listProjects({
      limit: PAGE_SIZE,
      continuationToken,
    })
    return { items: page.projects, next: page.nextContinuationToken }
  },
  getProject: (id) => projectStorage.getProject(id),
  listDocuments: async (id) =>
    (await projectStorage.listDocuments(id)).documents,
  getDocument: (projectId, id) => projectStorage.getDocument(projectId, id),
  getLocalChats: () => indexedDBStorage.getAllChats(),
  getLocalChat: (id) => indexedDBStorage.getChat(id),
}
function fail(kind: string, id: string, detail: string): never {
  throw new NativeBackupCollectionError(kind, id, detail)
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
    return fail(kind, id, `record is invalid: ${detail(error)}`)
  }
}
function unique<T extends Listed>(values: T[]): T[] {
  const byId = new Map<string, T>()
  for (const value of values) {
    const old = byId.get(value.id)
    if (!old || value.syncVersion >= old.syncVersion) byId.set(value.id, value)
  }
  return [...byId.values()]
}
async function pages<T extends Listed>(
  fn: (t?: string) => Page<T>,
  s?: AbortSignal,
) {
  const values: T[] = []
  let token: string | undefined
  do {
    const page = await wait(s, () => fn(token))
    values.push(...page.items)
    token = page.next
  } while (token)
  return unique(values)
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
  json(value: unknown) {
    const bytes = jsonSize(value)
    this.commit([0, 0, bytes, bytes, 1])
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
) {
  try {
    const value = await wait(signal, read)
    return value ?? fail(kind, id, 'record is missing or invalid')
  } catch (error) {
    signal?.throwIfAborted()
    if (error instanceof NativeBackupCollectionError) throw error
    return fail(kind, id, `read failed: ${detail(error)}`)
  }
}
async function stable<T extends { syncVersion?: number }, I extends Listed>(
  kind: string,
  initial: I,
  read: () => Promise<T | null>,
  refresh: () => Promise<I[]>,
  signal?: AbortSignal,
): Promise<{ value: T; item: I }> {
  let item = initial
  for (let attempt = 0; attempt < 2; attempt++) {
    const value = await readRecord(kind, item.id, read, signal)
    if (value.syncVersion === item.syncVersion) return { value, item }
    item =
      unique(await wait(signal, refresh)).find(({ id }) => id === item.id) ??
      fail(kind, item.id, 'record is missing or invalid')
  }
  return fail(kind, item.id, 'version changed during collection')
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
  budget.json(value)
  return value
}
function portable(chat: StoredChat, images?: NativeBackupImageCandidate[]) {
  return sanitizeNativeBackupChat(chat, (candidate) => {
    images?.push(candidate)
    return candidate.sourceKey
  })
}
function localToken(chat: StoredChat) {
  return JSON.stringify([
    portable(chat),
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
async function collectChat(
  chat: StoredChat,
  cloud: boolean,
  deps: NativeBackupCollectionDependencies,
  budget: Budget,
  signal?: AbortSignal,
) {
  const candidates: NativeBackupImageCandidate[] = []
  const value = valid(cloud ? 'cloud chat' : 'local chat', chat.id, () =>
    portable(chat, candidates),
  )
  const pending = budget.chat(value)
  const images = await mapLimit(
    candidates,
    async (candidate) => {
      const message = chat.messages[candidate.messageIndex]
      const attachment = message.attachments?.find(
        ({ id }) => id === candidate.attachmentId,
      )
      const base64 =
        candidate.legacyIndex !== undefined
          ? message.imageData?.[candidate.legacyIndex]?.base64
          : candidate.page !== undefined
            ? attachment?.pages?.find(({ page }) => page === candidate.page)
                ?.image
            : attachment?.base64
      let bytes: Uint8Array | null = null
      try {
        bytes = base64
          ? base64ToUint8Array(base64)
          : cloud && attachment
            ? await wait(signal, () => deps.getCloudImage(attachment))
            : null
      } catch {
        signal?.throwIfAborted()
        fail('image', candidate.sourceKey, 'image bytes are invalid')
      }
      if (!bytes) fail('image', candidate.sourceKey, 'image bytes are missing')
      const metadata = valid('image', candidate.sourceKey, () =>
        sanitizeNativeBackupImage({
          ...candidate,
          id: candidate.sourceKey,
          sizeBytes: bytes.length,
        }),
      )
      budget.image(pending, metadata, bytes)
      return { metadata, bytes }
    },
    signal,
  )
  return { chat: value, images, pending }
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
  for (let attempt = 0; attempt < 2; attempt++) {
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
  return fail(kind, id, 'version changed during collection')
}
export async function collectNativeBackupV1(
  deps: NativeBackupCollectionDependencies = defaults,
  signal?: AbortSignal,
): Promise<NativeBackupV1Input> {
  if (!(await wait(signal, () => deps.isAuthenticated())))
    fail('account', 'active', 'signed-in user is required')
  const userId = deps.activeUserId()
  if (!userId) fail('account', 'active', 'signed-in owner is unavailable')
  try {
    deps.requireUnlockedCek()
  } catch {
    fail('account', userId, 'cloud encryption key is locked or unavailable')
  }
  const [chatItems, projectItems, localSnapshots] = await Promise.all([
    pages(deps.listChats, signal),
    pages(deps.listProjects, signal),
    wait(signal, () => deps.getLocalChats()),
  ])
  const documentItems = unique(
    (
      await mapLimit(projectItems, ({ id }) => deps.listDocuments(id), signal)
    ).flat(),
  )
  const budget = new Budget()
  budget.entities(projectItems.length + documentItems.length)
  const projects = await mapLimit(
    projectItems,
    (item) =>
      timed(
        'project',
        item,
        () => deps.getProject(item.id),
        () => pages(deps.listProjects, signal),
        sanitizeNativeBackupProject,
        budget,
        signal,
      ),
    signal,
  )
  const projectDocuments = await mapLimit(
    documentItems,
    (item) =>
      timed(
        'project document',
        item,
        () => deps.getDocument(item.projectId, item.id),
        () => deps.listDocuments(item.projectId),
        sanitizeNativeBackupProjectDocument,
        budget,
        signal,
      ),
    signal,
  )
  const cloudResults = []
  for (const listed of chatItems) {
    const result = await retryChat(
      'cloud chat',
      listed.id,
      listed.syncVersion,
      () => deps.getCloudChat(listed.id),
      ({ syncVersion }) => syncVersion,
      (chat) => classifyNativeBackupChat(chat, 'cloud') !== null,
      async () =>
        (await pages(deps.listChats, signal)).find(({ id }) => id === listed.id)
          ?.syncVersion ??
        fail('cloud chat', listed.id, 'record is missing or invalid'),
      (chat) => collectChat(chat, true, deps, budget, signal),
      signal,
    )
    if (!result) continue
    budget.commit(result.pending, true)
    cloudResults.push(result)
  }
  const localResults = []
  for (const snapshot of localSnapshots) {
    if (!localEligible(snapshot, userId)) continue
    const result = await retryChat(
      'local chat',
      snapshot.id,
      localToken(snapshot),
      () => deps.getLocalChat(snapshot.id),
      localToken,
      (chat) => localEligible(chat, userId),
      async (chat) => localToken(chat),
      (chat) => collectChat(chat, false, deps, budget, signal),
      signal,
    )
    if (!result) continue
    budget.commit(result.pending, true)
    localResults.push(result)
  }
  const cloudChats = cloudResults.map(({ chat }) => chat)
  const localChats = localResults.map(({ chat }) => chat)
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
  const input: NativeBackupV1Input = {
    backupId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    projects,
    projectDocuments,
    cloudChats,
    localChats,
    relationships,
    images,
  }
  signal?.throwIfAborted()
  formatNativeBackupV1(input)
  return input
}
