import type { Attachment } from '@/components/chat/types'
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
const READ_CONCURRENCY = 4

type ChatListItem = { id: string; syncVersion: number }
type ProjectListItem = {
  id: string
  syncVersion: number
  createdAt: string
  updatedAt: string
}
type DocumentListItem = ProjectListItem & { projectId: string }

export interface NativeBackupCollectionDependencies {
  isAuthenticated(): Promise<boolean>
  activeUserId(): string | null
  requireUnlockedCek(): void
  listChats(token?: string): Promise<{
    items: ChatListItem[]
    next?: string
  }>
  getCloudChat(id: string): Promise<StoredChat | null>
  getCloudImage(attachment: Attachment): Promise<Uint8Array | null>
  listProjects(token?: string): Promise<{
    items: ProjectListItem[]
    next?: string
  }>
  getProject(id: string): Promise<Project | null>
  listDocuments(projectId: string): Promise<DocumentListItem[]>
  getDocument(projectId: string, id: string): Promise<ProjectDocument | null>
  getLocalChats(): Promise<StoredChat[]>
  getLocalChat(id: string): Promise<StoredChat | null>
  randomUUID(): string
  now(): Date
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

function activeUserId(): string | null {
  try {
    return localStorage.getItem(AUTH_ACTIVE_USER_ID)
  } catch {
    return null
  }
}

const defaultDependencies: NativeBackupCollectionDependencies = {
  isAuthenticated: () => authTokenManager.isAuthenticated(),
  activeUserId,
  requireUnlockedCek: () => void requirePrimaryKeyB64(),
  listChats: async (continuationToken) => {
    const page = await cloudStorage.listChats({
      limit: PAGE_SIZE,
      continuationToken,
    })
    return {
      items: page.conversations,
      next: page.nextContinuationToken,
    }
  },
  getCloudChat: (id) => cloudStorage.downloadChat(id),
  getCloudImage: (attachment) => cloudStorage.loadChatImage(attachment),
  listProjects: async (continuationToken) => {
    const page = await projectStorage.listProjects({
      limit: PAGE_SIZE,
      continuationToken,
    })
    return { items: page.projects, next: page.nextContinuationToken }
  },
  getProject: (id) => projectStorage.getProject(id),
  listDocuments: async (projectId) =>
    (await projectStorage.listDocuments(projectId)).documents,
  getDocument: (projectId, id) => projectStorage.getDocument(projectId, id),
  getLocalChats: () => indexedDBStorage.getAllChats(),
  getLocalChat: (id) => indexedDBStorage.getChat(id),
  randomUUID: () => crypto.randomUUID(),
  now: () => new Date(),
}

async function allPages<T>(
  read: (token?: string) => Promise<{ items: T[]; next?: string }>,
): Promise<T[]> {
  const output: T[] = []
  let token: string | undefined
  do {
    const page = await read(token)
    output.push(...page.items)
    token = page.next
  } while (token)
  return output
}

async function mapLimit<T, R>(
  values: readonly T[],
  read: (value: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length)
  let next = 0
  await Promise.all(
    Array.from(
      { length: Math.min(READ_CONCURRENCY, values.length) },
      async () => {
        while (next < values.length) {
          const index = next++
          output[index] = await read(values[index])
        }
      },
    ),
  )
  return output
}

function fail(kind: string, id: string, detail: string): never {
  throw new NativeBackupCollectionError(kind, id, detail)
}

async function readRecord<T>(
  kind: string,
  id: string,
  read: () => Promise<T | null>,
): Promise<T> {
  try {
    const value = await read()
    return value ?? fail(kind, id, 'record is missing or invalid')
  } catch (error) {
    if (error instanceof NativeBackupCollectionError) throw error
    fail(kind, id, `read failed: ${errorDetail(error)}`)
  }
}

async function stableCloudRecord<T extends { syncVersion?: number }>(
  kind: string,
  item: { id: string; syncVersion: number },
  read: () => Promise<T | null>,
): Promise<T> {
  let expected = item.syncVersion
  for (let attempt = 0; attempt < 2; attempt++) {
    const value = await readRecord(kind, item.id, read)
    if (value.syncVersion === expected) return value
    expected = value.syncVersion ?? -1
  }
  return fail(kind, item.id, 'version changed during collection')
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function localToken(chat: StoredChat): string {
  return JSON.stringify({
    id: chat.id,
    title: chat.title,
    titleState: chat.titleState,
    messages: chat.messages,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    projectId: chat.projectId,
    presetId: chat.presetId,
    model: chat.model,
    webSearchEnabled: chat.webSearchEnabled,
    isLocalOnly: chat.isLocalOnly,
    isBlankChat: chat.isBlankChat,
    isTemporary: chat.isTemporary,
    syncUserId: chat.syncUserId,
    clock: chat.clock,
    writer: chat.writer,
  })
}

type ImageSource = {
  candidate: NativeBackupImageCandidate
  base64?: string
  attachment?: Attachment
}

function imageSources(chat: StoredChat): ImageSource[] {
  const output: ImageSource[] = []
  chat.messages.forEach((message, messageIndex) => {
    for (const attachment of message.attachments ?? []) {
      if (attachment.type === 'image') {
        output.push({
          candidate: {
            sourceKey: `attachment:${chat.id}:${messageIndex}:${attachment.id}`,
            chatId: chat.id,
            messageIndex,
            attachmentId: attachment.id,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType ?? 'application/octet-stream',
            description: attachment.description,
          },
          base64: attachment.base64,
          attachment,
        })
      } else {
        for (const page of attachment.pages ?? []) {
          if (!page.image) continue
          output.push({
            candidate: {
              sourceKey: `page:${chat.id}:${messageIndex}:${attachment.id}:${page.page}`,
              chatId: chat.id,
              messageIndex,
              attachmentId: attachment.id,
              page: page.page,
              fileName: `${attachment.id}-page-${page.page}.jpg`,
              mimeType: 'image/jpeg',
            },
            base64: page.image,
          })
        }
      }
    }
    message.imageData?.forEach((image, legacyIndex) =>
      output.push({
        candidate: {
          sourceKey: `legacy:${chat.id}:${messageIndex}:${legacyIndex}`,
          chatId: chat.id,
          messageIndex,
          legacyIndex,
          fileName: `legacy-image-${legacyIndex}`,
          mimeType: image.mimeType,
        },
        base64: image.base64,
      }),
    )
  })
  return output
}

async function collectChat(
  chat: StoredChat,
  cloud: boolean,
  dependencies: NativeBackupCollectionDependencies,
) {
  const sources = imageSources(chat)
  const images = await mapLimit(
    sources,
    async ({ candidate, base64, attachment }) => {
      let bytes: Uint8Array | null = null
      try {
        bytes = base64
          ? base64ToUint8Array(base64)
          : cloud && attachment
            ? await dependencies.getCloudImage(attachment)
            : null
      } catch {
        fail('image', candidate.sourceKey, 'image bytes are invalid')
      }
      if (!bytes) fail('image', candidate.sourceKey, 'image bytes are missing')
      if (bytes.length > NATIVE_BACKUP_LIMITS.imageBytes)
        fail('image', candidate.sourceKey, 'image size limit exceeded')
      const id = candidate.sourceKey
      try {
        return {
          metadata: sanitizeNativeBackupImage({
            ...candidate,
            id,
            sizeBytes: bytes.length,
          }),
          bytes,
        }
      } catch (error) {
        fail(
          'image',
          candidate.sourceKey,
          `record is invalid: ${errorDetail(error)}`,
        )
      }
    },
  )
  const imageIds = new Map(
    images.map(({ metadata }) => [metadata.id, metadata.id]),
  )
  try {
    return {
      chat: sanitizeNativeBackupChat(chat, ({ sourceKey }) => {
        const id = imageIds.get(sourceKey)
        return id ?? fail('image', sourceKey, 'image bytes are missing')
      }),
      images,
    }
  } catch (error) {
    if (error instanceof NativeBackupCollectionError) throw error
    fail(
      cloud ? 'cloud chat' : 'local chat',
      chat.id,
      `record is invalid: ${errorDetail(error)}`,
    )
  }
}

export async function collectNativeBackupV1(
  dependencies: NativeBackupCollectionDependencies = defaultDependencies,
): Promise<NativeBackupV1Input> {
  if (!(await dependencies.isAuthenticated()))
    fail('account', 'active', 'signed-in user is required')
  const userId = dependencies.activeUserId()
  if (!userId) fail('account', 'active', 'signed-in owner is unavailable')
  try {
    dependencies.requireUnlockedCek()
  } catch {
    fail('account', userId, 'cloud encryption key is locked or unavailable')
  }

  const [chatItems, projectItems, localSnapshots] = await Promise.all([
    allPages((token) => dependencies.listChats(token)),
    allPages((token) => dependencies.listProjects(token)),
    dependencies.getLocalChats(),
  ])
  const projects = await mapLimit(projectItems, async (item) => {
    const project = await stableCloudRecord('project', item, () =>
      dependencies.getProject(item.id),
    )
    try {
      return sanitizeNativeBackupProject({
        ...project,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })
    } catch (error) {
      fail('project', item.id, `record is invalid: ${errorDetail(error)}`)
    }
  })
  const documentItems = (
    await mapLimit(projectItems, (project) =>
      dependencies.listDocuments(project.id),
    )
  ).flat()
  const projectDocuments = await mapLimit(documentItems, async (item) => {
    const document = await stableCloudRecord('project document', item, () =>
      dependencies.getDocument(item.projectId, item.id),
    )
    try {
      return sanitizeNativeBackupProjectDocument({
        ...document,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })
    } catch (error) {
      fail(
        'project document',
        item.id,
        `record is invalid: ${errorDetail(error)}`,
      )
    }
  })

  const cloudResults = []
  for (const item of chatItems) {
    let expected = item.syncVersion
    let result: Awaited<ReturnType<typeof collectChat>> | null = null
    let excluded = false
    for (let attempt = 0; attempt < 2; attempt++) {
      const chat = await readRecord('cloud chat', item.id, () =>
        dependencies.getCloudChat(item.id),
      )
      if (chat.syncVersion !== expected) {
        expected = chat.syncVersion ?? -1
        continue
      }
      if (classifyNativeBackupChat(chat, 'cloud') === null) {
        excluded = true
        break
      }
      result = await collectChat(chat, true, dependencies)
      const verify = await readRecord('cloud chat', item.id, () =>
        dependencies.getCloudChat(item.id),
      )
      if (verify.syncVersion === chat.syncVersion) break
      expected = verify.syncVersion ?? -1
      result = null
    }
    if (excluded) continue
    if (!result)
      fail('cloud chat', item.id, 'version changed during collection')
    cloudResults.push(result)
  }

  const localResults = []
  for (const snapshot of localSnapshots) {
    const owner =
      snapshot.syncUserId === userId ||
      (snapshot as StoredChat & { userId?: string }).userId === userId
        ? 'signed_in'
        : 'anonymous'
    if (
      !snapshot.isLocalOnly ||
      classifyNativeBackupChat(snapshot, owner) !== 'local'
    )
      continue
    let expected = localToken(snapshot)
    let result: Awaited<ReturnType<typeof collectChat>> | null = null
    for (let attempt = 0; attempt < 2; attempt++) {
      const chat = await readRecord('local chat', snapshot.id, () =>
        dependencies.getLocalChat(snapshot.id),
      )
      const token = localToken(chat)
      if (token !== expected) {
        expected = token
        continue
      }
      result = await collectChat(chat, false, dependencies)
      const verify = await readRecord('local chat', snapshot.id, () =>
        dependencies.getLocalChat(snapshot.id),
      )
      if (localToken(verify) === token) break
      expected = localToken(verify)
      result = null
    }
    if (!result)
      fail('local chat', snapshot.id, 'version changed during collection')
    localResults.push(result)
  }

  const cloudChats = cloudResults.map(({ chat }) => chat)
  const localChats = localResults.map(({ chat }) => chat)
  const images = [...cloudResults, ...localResults].flatMap(
    ({ images: values }) => values,
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
  const input: NativeBackupV1Input = {
    backupId: dependencies.randomUUID(),
    createdAt: dependencies.now().toISOString(),
    projects,
    projectDocuments,
    cloudChats,
    localChats,
    relationships,
    images,
  }
  formatNativeBackupV1(input)
  return input
}
