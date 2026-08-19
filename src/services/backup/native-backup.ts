import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { Uint8ArrayReader, ZipReader } from '@zip.js/zip.js'
import { strFromU8, strToU8, zipSync } from 'fflate'
import { z } from 'zod'

import type { Attachment, Chat, Message } from '@/components/chat/types'
import { hasPrimaryKey } from '@/services/cloud/cek-encoding'
import { cloudStorage } from '@/services/cloud/cloud-storage'
import { projectStorage } from '@/services/cloud/project-storage'
import { chatStorage } from '@/services/storage/chat-storage'
import { attachmentGet } from '@/services/sync-enclave/sync-api'
import type {
  Project,
  ProjectDocument,
  ProjectListResponse,
} from '@/types/project'
import { base64ToUint8Array, uint8ArrayToBase64 } from '@/utils/binary-codec'

export const NATIVE_BACKUP_FORMAT = 'tinfoil-native-backup'
export const NATIVE_CLOUD_IMPORT_FORMAT = 'tinfoil-native-cloud-import'
export const NATIVE_BACKUP_VERSION = 1

const MANIFEST_PATH = 'manifest.json'
const PROJECTS_PATH = 'projects.json'
const DOCUMENTS_PATH = 'project_documents.json'
const CLOUD_CHATS_PATH = 'cloud_chats.json'
const LOCAL_CHATS_PATH = 'local_chats.json'
const RELATIONSHIPS_PATH = 'relationships.json'
const PAGE_SIZE = 100
const MAX_BACKUP_ARCHIVE_BYTES = 512 * 1024 * 1024
const MAX_BACKUP_ENTRIES = 50_000
const MAX_BACKUP_ENTRY_BYTES = 256 * 1024 * 1024
const MAX_BACKUP_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024
const MAX_BACKUP_MANIFEST_BYTES = 32 * 1024 * 1024

const ProjectSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    description: z.string(),
    systemInstructions: z.string(),
    color: z.string().optional(),
    memory: z.array(
      z
        .object({
          id: z.string(),
          fact: z.string(),
          date: z.string(),
          category: z.string(),
          confidence: z.number(),
        })
        .passthrough(),
    ),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    syncVersion: z.number(),
    decryptionFailed: z.literal(false).optional(),
  })
  .passthrough()
const ProjectDocumentSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    filename: z.string(),
    contentType: z.string(),
    sizeBytes: z.number().nonnegative(),
    syncVersion: z.number(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    content: z.string().optional(),
    decryptionFailed: z.literal(false).optional(),
  })
  .passthrough()
const BackupAttachmentSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(['image', 'document']),
    fileName: z.string(),
    backup_path: z.string().optional(),
    encryptionKey: z.never().optional(),
    base64: z.never().optional(),
    thumbnailBase64: z.never().optional(),
  })
  .passthrough()
const BackupMessageSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    timestamp: z.union([z.string(), z.date()]),
    attachments: z.array(BackupAttachmentSchema).optional(),
  })
  .passthrough()
const BackupChatSchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    createdAt: z.string().datetime(),
    messages: z.array(BackupMessageSchema),
    decryptionFailed: z.literal(false).optional(),
  })
  .passthrough()
const RelationshipSchema = z.object({
  chat_id: z.string().min(1),
  project_id: z.string().min(1),
  location: z.enum(['cloud', 'local']),
})

export type BackupKind =
  | 'projects'
  | 'project_documents'
  | 'cloud_chats'
  | 'local_chats'
  | 'relationships'
  | 'images'

export interface BackupWarning {
  code: string
  kind: BackupKind
  message: string
  id?: string
}

export interface BackupFileEntry {
  path: string
  kind: BackupKind
  size: number
  sha256: string
}

export interface NativeBackupCounts {
  projects: number
  project_documents: number
  cloud_chats: number
  local_chats: number
  relationships: number
  images: number
}

export interface NativeBackupManifest {
  format: typeof NATIVE_BACKUP_FORMAT
  version: 1
  backup_id: string
  created_at: string
  complete: boolean
  extracted_text_notice: string
  counts: NativeBackupCounts
  files: BackupFileEntry[]
  warnings: BackupWarning[]
}

interface NativeCloudEntityManifest {
  kind: 'project' | 'document' | 'chat'
  source_id: string
  project_source_id?: string
  path: string
  sha256: string
  size_bytes: number
}

interface NativeCloudBlobManifest {
  path: string
  sha256: string
  size_bytes: number
}

export interface NativeCloudImportManifest {
  format: typeof NATIVE_CLOUD_IMPORT_FORMAT
  version: 1
  source_backup_id: string
  counts: {
    projects: number
    documents: number
    chats: number
    blobs: number
  }
  entities: NativeCloudEntityManifest[]
  blobs: NativeCloudBlobManifest[]
}

interface BackupAttachment extends Omit<
  Attachment,
  'base64' | 'thumbnailBase64'
> {
  backup_path?: string
}

interface BackupMessage extends Omit<Message, 'attachments'> {
  attachments?: BackupAttachment[]
}

export interface BackupChat extends Omit<Chat, 'messages' | 'createdAt'> {
  createdAt: string
  messages: BackupMessage[]
}

export interface BackupRelationship {
  chat_id: string
  project_id: string
  location: 'cloud' | 'local'
}

export interface NativeBackupData {
  projects: Project[]
  projectDocuments: ProjectDocument[]
  cloudChats: Chat[]
  localChats: Chat[]
  warnings?: BackupWarning[]
  complete?: boolean
}

export interface NativeBackupContext {
  cloudDataExpected: boolean
}

export interface NativeBackupArchive {
  data: Uint8Array
  filename: string
  manifest: NativeBackupManifest
}

export interface ValidatedNativeBackup {
  manifest: NativeBackupManifest
  projects: Project[]
  projectDocuments: ProjectDocument[]
  cloudChats: BackupChat[]
  localChats: BackupChat[]
  relationships: BackupRelationship[]
  files: Record<string, Uint8Array>
}

export interface NativeRestoreResult {
  local: { imported: number; skipped: number; conflicts: number }
  cloudCounts: Omit<NativeBackupCounts, 'local_chats'>
  cloudArchive: File | null
  warnings: BackupWarning[]
  finalizeLocal: (
    projectMappings?: Record<string, string>,
  ) => Promise<{ imported: number; skipped: number; conflicts: number }>
}

export interface LocalRestoreStore {
  getChat: (id: string) => Promise<Chat | null>
  saveChat: (chat: Chat) => Promise<unknown>
}

function hash(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes))
}

function safeSegment(value: string): string {
  return (
    value
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/^\.+/, '')
      .slice(0, 120) || 'item'
  )
}

function jsonBytes(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value, null, 2))
}

function parseJson<T>(files: Record<string, Uint8Array>, path: string): T {
  const bytes = files[path]
  if (!bytes) throw new Error(`Backup is missing ${path}`)
  try {
    return JSON.parse(strFromU8(bytes)) as T
  } catch {
    throw new Error(`Backup contains invalid JSON in ${path}`)
  }
}

function asDateString(value: Date | string): string {
  return new Date(value).toISOString()
}

async function imageBytes(attachment: Attachment): Promise<Uint8Array | null> {
  if (attachment.base64) return base64ToUint8Array(attachment.base64)
  if (!attachment.encryptionKey) return null
  return attachmentGet({
    id: attachment.id,
    attKeyB64: attachment.encryptionKey,
  })
}

async function serializeChats(
  chats: Chat[],
  location: 'cloud' | 'local',
  files: Record<string, Uint8Array>,
  warnings: BackupWarning[],
): Promise<{ chats: BackupChat[]; imageCount: number }> {
  let imageCount = 0
  const output: BackupChat[] = []

  for (const chat of chats) {
    const messages: BackupMessage[] = []
    for (const message of chat.messages) {
      const attachments: BackupAttachment[] = []
      for (const attachment of message.attachments ?? []) {
        const {
          base64: _base64,
          thumbnailBase64: _thumbnail,
          encryptionKey: _encryptionKey,
          ...safeAttachment
        } = attachment
        const exported: BackupAttachment = { ...safeAttachment }
        if (attachment.type === 'image') {
          try {
            const bytes = await imageBytes(attachment)
            if (bytes) {
              const path = `images/${location}/${safeSegment(chat.id)}/${safeSegment(attachment.id)}/${safeSegment(attachment.fileName)}`
              files[path] = bytes
              exported.backup_path = path
              exported.fileSize = bytes.byteLength
              imageCount++
            } else {
              warnings.push({
                code: 'image_unreadable',
                kind: 'images',
                id: attachment.id,
                message: 'An image could not be read and was omitted.',
              })
            }
          } catch {
            warnings.push({
              code: 'image_unreadable',
              kind: 'images',
              id: attachment.id,
              message: 'An image could not be read and was omitted.',
            })
          }
        }
        attachments.push(exported)
      }
      messages.push({
        ...message,
        timestamp: new Date(message.timestamp),
        ...(attachments.length > 0 ? { attachments } : {}),
      })
    }
    output.push({
      ...chat,
      createdAt: asDateString(chat.createdAt),
      messages,
    })
  }
  return { chats: output, imageCount }
}

export async function buildNativeBackup(
  data: NativeBackupData,
): Promise<NativeBackupArchive> {
  const files: Record<string, Uint8Array> = {}
  const warnings = [...(data.warnings ?? [])]
  const cloud = await serializeChats(data.cloudChats, 'cloud', files, warnings)
  const local = await serializeChats(data.localChats, 'local', files, warnings)
  const relationships: BackupRelationship[] = [
    ...data.cloudChats
      .filter((chat) => chat.projectId)
      .map((chat) => ({
        chat_id: chat.id,
        project_id: chat.projectId!,
        location: 'cloud' as const,
      })),
    ...data.localChats
      .filter((chat) => chat.projectId)
      .map((chat) => ({
        chat_id: chat.id,
        project_id: chat.projectId!,
        location: 'local' as const,
      })),
  ]

  files[PROJECTS_PATH] = jsonBytes(data.projects)
  files[DOCUMENTS_PATH] = jsonBytes(data.projectDocuments)
  files[CLOUD_CHATS_PATH] = jsonBytes(cloud.chats)
  files[LOCAL_CHATS_PATH] = jsonBytes(local.chats)
  files[RELATIONSHIPS_PATH] = jsonBytes(relationships)

  const kindForPath = (path: string): BackupKind => {
    if (path.startsWith('images/')) return 'images'
    if (path === PROJECTS_PATH) return 'projects'
    if (path === DOCUMENTS_PATH) return 'project_documents'
    if (path === CLOUD_CHATS_PATH) return 'cloud_chats'
    if (path === LOCAL_CHATS_PATH) return 'local_chats'
    return 'relationships'
  }
  const entries = Object.entries(files).map(([path, bytes]) => ({
    path,
    kind: kindForPath(path),
    size: bytes.byteLength,
    sha256: hash(bytes),
  }))
  const complete = (data.complete ?? true) && warnings.length === 0
  const manifest: NativeBackupManifest = {
    format: NATIVE_BACKUP_FORMAT,
    version: NATIVE_BACKUP_VERSION,
    backup_id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    complete,
    extracted_text_notice:
      'Project documents contain extracted text and metadata, not original file bytes.',
    counts: {
      projects: data.projects.length,
      project_documents: data.projectDocuments.length,
      cloud_chats: cloud.chats.length,
      local_chats: local.chats.length,
      relationships: relationships.length,
      images: cloud.imageCount + local.imageCount,
    },
    files: entries,
    warnings,
  }
  files[MANIFEST_PATH] = jsonBytes(manifest)
  const date = manifest.created_at.slice(0, 10)
  return {
    data: zipSync(files),
    filename: `tinfoil-backup-${date}.zip`,
    manifest,
  }
}

function isManifest(value: unknown): value is NativeBackupManifest {
  if (!value || typeof value !== 'object') return false
  const manifest = value as Partial<NativeBackupManifest>
  return (
    manifest.format === NATIVE_BACKUP_FORMAT &&
    manifest.version === NATIVE_BACKUP_VERSION &&
    typeof manifest.backup_id === 'string' &&
    typeof manifest.complete === 'boolean' &&
    Boolean(manifest.counts) &&
    Array.isArray(manifest.files) &&
    Array.isArray(manifest.warnings)
  )
}

async function readBoundedZip(
  bytes: Uint8Array,
): Promise<Record<string, Uint8Array>> {
  if (bytes.byteLength > MAX_BACKUP_ARCHIVE_BYTES) {
    throw new Error('The selected backup archive is too large')
  }
  const reader = new ZipReader(new Uint8ArrayReader(bytes))
  try {
    const entries = await reader.getEntries()
    if (entries.length > MAX_BACKUP_ENTRIES) {
      throw new Error('Backup contains too many files')
    }
    const names = new Set<string>()
    let totalSize = 0
    for (const entry of entries) {
      const path = entry.filename
      if (
        entry.directory ||
        !path ||
        path.startsWith('/') ||
        path.includes('\\') ||
        path.includes('\0') ||
        path.split('/').includes('..') ||
        names.has(path)
      ) {
        throw new Error('Backup contains an invalid or duplicate file path')
      }
      if (entry.uncompressedSize > MAX_BACKUP_ENTRY_BYTES) {
        throw new Error(`Backup file is too large: ${path}`)
      }
      if (
        path === MANIFEST_PATH &&
        entry.uncompressedSize > MAX_BACKUP_MANIFEST_BYTES
      ) {
        throw new Error('Backup manifest is too large')
      }
      totalSize += entry.uncompressedSize
      if (totalSize > MAX_BACKUP_UNCOMPRESSED_BYTES) {
        throw new Error('Backup uncompressed size exceeds the limit')
      }
      names.add(path)
    }
    const files: Record<string, Uint8Array> = {}
    let extractedSize = 0
    for (const entry of entries) {
      if (!('getData' in entry)) {
        throw new Error(`Backup extraction failed for ${entry.filename}`)
      }
      const chunks: Uint8Array[] = []
      let entrySize = 0
      await entry.getData({
        writable: new WritableStream<Uint8Array>({
          write(chunk) {
            entrySize += chunk.byteLength
            extractedSize += chunk.byteLength
            if (
              entrySize > MAX_BACKUP_ENTRY_BYTES ||
              extractedSize > MAX_BACKUP_UNCOMPRESSED_BYTES
            ) {
              throw new Error('Backup extraction exceeded its size limit')
            }
            chunks.push(chunk)
          },
        }),
      })
      const data = new Uint8Array(entrySize)
      let offset = 0
      for (const chunk of chunks) {
        data.set(chunk, offset)
        offset += chunk.byteLength
      }
      if (data.byteLength !== entry.uncompressedSize) {
        throw new Error(`Backup extraction failed for ${entry.filename}`)
      }
      files[entry.filename] = data
    }
    return files
  } catch {
    throw new Error(
      'The selected file is not a valid ZIP archive or exceeds safety limits',
    )
  } finally {
    await reader.close()
  }
}

export async function validateNativeBackup(
  bytes: Uint8Array,
): Promise<ValidatedNativeBackup> {
  const files = await readBoundedZip(bytes)
  const manifestValue = parseJson<unknown>(files, MANIFEST_PATH)
  if (!isManifest(manifestValue)) {
    throw new Error('Unsupported Tinfoil backup manifest')
  }
  const manifest = manifestValue
  const knownPaths = new Set([MANIFEST_PATH])
  for (const entry of manifest.files) {
    if (
      !entry ||
      typeof entry.path !== 'string' ||
      entry.path.startsWith('/') ||
      entry.path.split('/').includes('..') ||
      typeof entry.sha256 !== 'string' ||
      typeof entry.size !== 'number' ||
      ![
        'projects',
        'project_documents',
        'cloud_chats',
        'local_chats',
        'relationships',
        'images',
      ].includes(entry.kind) ||
      knownPaths.has(entry.path)
    ) {
      throw new Error('Backup manifest contains an invalid file entry')
    }
    knownPaths.add(entry.path)
    const file = files[entry.path]
    if (!file) throw new Error(`Backup is missing ${entry.path}`)
    if (file.byteLength !== entry.size || hash(file) !== entry.sha256) {
      throw new Error(`Backup integrity check failed for ${entry.path}`)
    }
  }
  for (const path of Object.keys(files)) {
    if (!knownPaths.has(path))
      throw new Error(`Backup contains unlisted file ${path}`)
  }
  const requiredKinds: Record<string, BackupKind> = {
    [PROJECTS_PATH]: 'projects',
    [DOCUMENTS_PATH]: 'project_documents',
    [CLOUD_CHATS_PATH]: 'cloud_chats',
    [LOCAL_CHATS_PATH]: 'local_chats',
    [RELATIONSHIPS_PATH]: 'relationships',
  }
  if (
    Object.entries(requiredKinds).some(
      ([path, kind]) =>
        manifest.files.find((entry) => entry.path === path)?.kind !== kind,
    )
  ) {
    throw new Error('Backup manifest contains invalid file kinds')
  }

  const projects = parseJson<unknown>(files, PROJECTS_PATH)
  const projectDocuments = parseJson<unknown>(files, DOCUMENTS_PATH)
  const cloudChats = parseJson<unknown>(files, CLOUD_CHATS_PATH)
  const localChats = parseJson<unknown>(files, LOCAL_CHATS_PATH)
  const relationships = parseJson<unknown>(files, RELATIONSHIPS_PATH)
  const parsedProjects = z.array(ProjectSchema).safeParse(projects)
  const parsedDocuments = z
    .array(ProjectDocumentSchema)
    .safeParse(projectDocuments)
  const parsedCloudChats = z.array(BackupChatSchema).safeParse(cloudChats)
  const parsedLocalChats = z.array(BackupChatSchema).safeParse(localChats)
  const parsedRelationships = z
    .array(RelationshipSchema)
    .safeParse(relationships)
  if (
    !parsedProjects.success ||
    !parsedDocuments.success ||
    !parsedCloudChats.success ||
    !parsedLocalChats.success ||
    !parsedRelationships.success
  ) {
    throw new Error(
      'Backup contains data that does not match the version 1 schema',
    )
  }

  const projectIds = new Set(parsedProjects.data.map((project) => project.id))
  const cloudChatIds = new Set(parsedCloudChats.data.map((chat) => chat.id))
  const localChatIds = new Set(parsedLocalChats.data.map((chat) => chat.id))
  const imagePaths = new Set(
    manifest.files
      .filter((entry) => entry.kind === 'images')
      .map((entry) => entry.path),
  )
  if (
    parsedDocuments.data.some(
      (document) => !projectIds.has(document.projectId),
    ) ||
    parsedLocalChats.data.some((chat) => chat.isLocalOnly !== true) ||
    parsedCloudChats.data.some((chat) => chat.isLocalOnly === true) ||
    parsedRelationships.data.some((relationship) => {
      const chatIds =
        relationship.location === 'local' ? localChatIds : cloudChatIds
      return (
        !projectIds.has(relationship.project_id) ||
        !chatIds.has(relationship.chat_id)
      )
    }) ||
    [...parsedCloudChats.data, ...parsedLocalChats.data].some((chat) =>
      chat.messages.some((message) =>
        message.attachments?.some(
          (attachment) =>
            attachment.backup_path && !imagePaths.has(attachment.backup_path),
        ),
      ),
    ) ||
    parsedCloudChats.data.some((chat) =>
      chat.messages.some((message) =>
        message.attachments?.some(
          (attachment) =>
            attachment.backup_path &&
            !attachment.backup_path.startsWith('images/cloud/'),
        ),
      ),
    ) ||
    parsedLocalChats.data.some((chat) =>
      chat.messages.some((message) =>
        message.attachments?.some(
          (attachment) =>
            attachment.backup_path &&
            !attachment.backup_path.startsWith('images/local/'),
        ),
      ),
    )
  ) {
    throw new Error('Backup contains invalid version 1 relationships')
  }

  const actualCounts: NativeBackupCounts = {
    projects: parsedProjects.data.length,
    project_documents: parsedDocuments.data.length,
    cloud_chats: parsedCloudChats.data.length,
    local_chats: parsedLocalChats.data.length,
    relationships: parsedRelationships.data.length,
    images: manifest.files.filter((entry) => entry.kind === 'images').length,
  }
  for (const key of Object.keys(actualCounts) as Array<
    keyof NativeBackupCounts
  >) {
    if (manifest.counts[key] !== actualCounts[key]) {
      throw new Error(`Backup count mismatch for ${key}`)
    }
  }

  return {
    manifest,
    projects: parsedProjects.data as Project[],
    projectDocuments: parsedDocuments.data as ProjectDocument[],
    cloudChats: parsedCloudChats.data as BackupChat[],
    localChats: parsedLocalChats.data as BackupChat[],
    relationships: parsedRelationships.data as BackupRelationship[],
    files,
  }
}

async function mappedLocalChatId(
  destinationUserId: string,
  backupId: string,
  sourceId: string,
): Promise<string> {
  const digest = hash(
    strToU8(
      `tinfoil-local-restore:${destinationUserId}:${backupId}:${sourceId}`,
    ),
  )
  return `backup_${digest.slice(0, 40)}`
}

function hydrateLocalChat(
  chat: BackupChat,
  id: string,
  files: Record<string, Uint8Array>,
  projectId: string | undefined,
): Chat {
  return {
    ...chat,
    id,
    projectId,
    createdAt: new Date(chat.createdAt),
    isLocalOnly: true,
    messages: chat.messages.map((message) => ({
      ...message,
      timestamp: new Date(message.timestamp),
      attachments: message.attachments?.map((attachment) => {
        const { backup_path: backupPath, ...rest } = attachment
        return {
          ...rest,
          ...(backupPath && files[backupPath]
            ? { base64: uint8ArrayToBase64(files[backupPath]) }
            : {}),
        }
      }),
    })),
  }
}

function cloudEntity(
  files: Record<string, Uint8Array>,
  entities: NativeCloudEntityManifest[],
  kind: NativeCloudEntityManifest['kind'],
  sourceId: string,
  projectSourceId: string | undefined,
  payload: unknown,
): void {
  const path = `entities/${kind}/${entities.length}.json`
  const data = jsonBytes(payload)
  files[path] = data
  entities.push({
    kind,
    source_id: sourceId,
    ...(projectSourceId ? { project_source_id: projectSourceId } : {}),
    path,
    sha256: hash(data),
    size_bytes: data.byteLength,
  })
}

function buildCloudImport(validated: ValidatedNativeBackup): File | null {
  const cloudFiles: Record<string, Uint8Array> = {}
  const entities: NativeCloudEntityManifest[] = []
  const blobs: NativeCloudBlobManifest[] = []
  const projectForChat = new Map(
    validated.relationships
      .filter((relationship) => relationship.location === 'cloud')
      .map((relationship) => [relationship.chat_id, relationship.project_id]),
  )
  const blobPathForSource = new Map<string, string>()

  for (const project of validated.projects) {
    cloudEntity(cloudFiles, entities, 'project', project.id, undefined, {
      name: project.name,
      description: project.description,
      systemInstructions: project.systemInstructions,
      ...(project.color ? { color: project.color } : {}),
      memory: project.memory,
    })
  }
  for (const document of validated.projectDocuments) {
    cloudEntity(
      cloudFiles,
      entities,
      'document',
      document.id,
      document.projectId,
      {
        filename: document.filename,
        contentType: document.contentType,
        sourceSizeBytes: document.sizeBytes,
        sizeBytes: document.sizeBytes,
        content: document.content ?? '',
      },
    )
  }
  for (const chat of validated.cloudChats) {
    const messages = chat.messages.map((message) => ({
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      ...(message.thoughts ? { thoughts: message.thoughts } : {}),
      ...(message.thinkingDuration
        ? { thinkingDuration: message.thinkingDuration }
        : {}),
      ...(message.attachments
        ? {
            attachments: message.attachments.map((attachment) => {
              const sourcePath = attachment.backup_path
              let archivePath: string | undefined
              if (sourcePath) {
                archivePath = blobPathForSource.get(sourcePath)
                if (!archivePath) {
                  archivePath = `blobs/${blobs.length}`
                  const data = validated.files[sourcePath]
                  cloudFiles[archivePath] = data
                  blobs.push({
                    path: archivePath,
                    sha256: hash(data),
                    size_bytes: data.byteLength,
                  })
                  blobPathForSource.set(sourcePath, archivePath)
                }
              }
              return {
                ...(attachment.id ? { id: attachment.id } : {}),
                type: attachment.type,
                fileName: attachment.fileName,
                ...(attachment.mimeType
                  ? { mimeType: attachment.mimeType }
                  : {}),
                ...(attachment.textContent
                  ? { textContent: attachment.textContent }
                  : {}),
                ...(attachment.description
                  ? { description: attachment.description }
                  : {}),
                ...(attachment.fileSize !== undefined
                  ? { fileSize: attachment.fileSize }
                  : {}),
                ...(archivePath ? { archivePath } : {}),
              }
            }),
          }
        : {}),
    }))
    cloudEntity(
      cloudFiles,
      entities,
      'chat',
      chat.id,
      projectForChat.get(chat.id),
      {
        title: chat.title,
        messages,
        createdAt: chat.createdAt,
        isLocalOnly: false,
      },
    )
  }
  if (entities.length === 0) return null
  const manifest: NativeCloudImportManifest = {
    format: NATIVE_CLOUD_IMPORT_FORMAT,
    version: NATIVE_BACKUP_VERSION,
    source_backup_id: validated.manifest.backup_id,
    counts: {
      projects: validated.projects.length,
      documents: validated.projectDocuments.length,
      chats: validated.cloudChats.length,
      blobs: blobs.length,
    },
    entities,
    blobs,
  }
  cloudFiles[MANIFEST_PATH] = jsonBytes(manifest)
  return new File(
    [new Uint8Array(zipSync(cloudFiles))],
    'tinfoil-cloud-import.zip',
    {
      type: 'application/zip',
    },
  )
}

export async function restoreNativeBackup(
  bytes: Uint8Array,
  destinationUserId: string,
  store: LocalRestoreStore = {
    getChat: (id) => chatStorage.getChat(id),
    saveChat: (chat) => chatStorage.saveChat(chat, true),
  },
): Promise<NativeRestoreResult> {
  const validated = await validateNativeBackup(bytes)
  const cloudArchive = buildCloudImport(validated)
  const localRelationship = new Map(
    validated.relationships
      .filter((relationship) => relationship.location === 'local')
      .map((relationship) => [relationship.chat_id, relationship.project_id]),
  )
  let local = { imported: 0, skipped: 0, conflicts: 0 }
  let finalized = false
  const warnings = [...validated.manifest.warnings]
  const finalizeLocal = async (
    projectMappings: Record<string, string> = {},
  ) => {
    if (finalized) return local
    let imported = 0
    let skipped = 0
    for (const sourceChat of validated.localChats) {
      const sourceProjectId = localRelationship.get(sourceChat.id)
      const projectId = sourceProjectId
        ? projectMappings[sourceProjectId]
        : undefined
      if (sourceProjectId && !projectId) {
        warnings.push({
          code: 'local_chat_project_not_restored',
          kind: 'local_chats',
          id: sourceChat.id,
          message:
            'A local chat was restored without its project because the project was not imported.',
        })
      }
      const id = await mappedLocalChatId(
        destinationUserId,
        validated.manifest.backup_id,
        sourceChat.id,
      )
      const restored = hydrateLocalChat(
        sourceChat,
        id,
        validated.files,
        projectId,
      )
      const existing = await store.getChat(id)
      if (existing) {
        skipped++
        continue
      }
      await store.saveChat(restored)
      imported++
    }
    local = { imported, skipped, conflicts: 0 }
    finalized = true
    return local
  }
  if (!cloudArchive) {
    await finalizeLocal()
  }
  return {
    get local() {
      return local
    },
    cloudCounts: {
      projects: validated.manifest.counts.projects,
      project_documents: validated.manifest.counts.project_documents,
      cloud_chats: validated.manifest.counts.cloud_chats,
      relationships: validated.relationships.filter(
        (relationship) => relationship.location === 'cloud',
      ).length,
      images: validated.manifest.files.filter(
        (entry) =>
          entry.kind === 'images' && entry.path.startsWith('images/cloud/'),
      ).length,
    },
    cloudArchive,
    warnings,
    finalizeLocal,
  }
}

async function listAllProjects(): Promise<ProjectListResponse['projects']> {
  const listed: ProjectListResponse['projects'] = []
  let continuationToken: string | undefined
  do {
    const page = await projectStorage.listProjects({
      limit: PAGE_SIZE,
      continuationToken,
    })
    listed.push(...page.projects)
    continuationToken = page.nextContinuationToken
  } while (continuationToken)
  return listed
}

async function enumerateProjects(): Promise<{
  projects: Project[]
  documents: ProjectDocument[]
  warnings: BackupWarning[]
  complete: boolean
}> {
  const warnings: BackupWarning[] = []
  const listed = await listAllProjects()
  const pulled = new Map<string, Project>()
  for (let index = 0; index < listed.length; index += PAGE_SIZE) {
    const batch = await projectStorage.getProjects(
      listed.slice(index, index + PAGE_SIZE).map((item) => item.id),
    )
    for (const [id, project] of batch) pulled.set(id, project)
  }
  const projects: Project[] = []
  const documents: ProjectDocument[] = []
  let complete = true
  for (const listedItem of listed) {
    let item = listedItem
    let project = pulled.get(item.id)
    if (project && project.syncVersion !== item.syncVersion) {
      const reEnumerated = await listAllProjects()
      const latestItem = reEnumerated.find(
        (candidate) => candidate.id === item.id,
      )
      if (!latestItem) {
        project = undefined
      } else {
        item = latestItem
        project = (await projectStorage.getProjects([item.id])).get(item.id)
      }
    }
    if (
      !project ||
      project.decryptionFailed ||
      project.syncVersion !== item.syncVersion
    ) {
      warnings.push({
        code: 'project_unreadable_or_changed',
        kind: 'projects',
        id: item.id,
        message: 'A project could not be read consistently and was omitted.',
      })
      complete = false
      continue
    }
    projects.push({
      ...project,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })
    const listedDocuments = await projectStorage.listDocuments(project.id)
    const fullDocuments = await projectStorage.getDocuments(
      project.id,
      listedDocuments.documents.map((document) => document.id),
    )
    for (const listedDocumentItem of listedDocuments.documents) {
      let documentItem = listedDocumentItem
      let document = fullDocuments.get(documentItem.id)
      if (document && document.syncVersion !== documentItem.syncVersion) {
        const reEnumerated = await projectStorage.listDocuments(project.id)
        const latestItem = reEnumerated.documents.find(
          (candidate) => candidate.id === documentItem.id,
        )
        if (!latestItem) {
          document = undefined
        } else {
          documentItem = latestItem
          document = (
            await projectStorage.getDocuments(project.id, [documentItem.id])
          ).get(documentItem.id)
        }
      }
      if (
        !document ||
        document.decryptionFailed ||
        document.syncVersion !== documentItem.syncVersion
      ) {
        warnings.push({
          code: 'project_document_unreadable_or_changed',
          kind: 'project_documents',
          id: `${project.id}/${documentItem.id}`,
          message:
            'A project document could not be read consistently and was omitted.',
        })
        complete = false
        continue
      }
      documents.push({
        ...document,
        createdAt: documentItem.createdAt,
        updatedAt: documentItem.updatedAt,
      })
    }
  }
  return { projects, documents, warnings, complete }
}

async function enumerateCloudChats(): Promise<{
  chats: Chat[]
  warnings: BackupWarning[]
  complete: boolean
}> {
  const listed = await listAllCloudChats()
  const pulled = []
  for (let index = 0; index < listed.length; index += PAGE_SIZE) {
    pulled.push(
      ...(await cloudStorage.downloadChats(
        listed.slice(index, index + PAGE_SIZE).map((chat) => chat.id),
        { tolerateNotFound: true },
      )),
    )
  }
  const pulledById = new Map(pulled.map((chat) => [chat.id, chat]))
  const warnings: BackupWarning[] = []
  const chats: Chat[] = []
  let complete = true
  for (const listedItem of listed) {
    let item = listedItem
    let content = pulledById.get(item.id)
    if (content && content.syncVersion !== item.syncVersion) {
      const reEnumerated = await listAllCloudChats()
      const latestItem = reEnumerated.find(
        (candidate) => candidate.id === item.id,
      )
      if (!latestItem) {
        content = undefined
      } else {
        item = latestItem
        const retry = await cloudStorage.downloadChats([item.id], {
          tolerateNotFound: true,
        })
        content = retry[0]
      }
    }
    if (
      !content ||
      content.syncVersion !== item.syncVersion ||
      !content.content
    ) {
      warnings.push({
        code: 'cloud_chat_unreadable_or_changed',
        kind: 'cloud_chats',
        id: item.id,
        message: 'A cloud chat could not be read consistently and was omitted.',
      })
      complete = false
      continue
    }
    try {
      const parsed = JSON.parse(content.content) as Omit<Chat, 'createdAt'> & {
        createdAt: string
      }
      if (parsed.decryptionFailed || !Array.isArray(parsed.messages))
        throw new Error()
      chats.push({
        ...parsed,
        id: item.id,
        projectId: item.projectId ?? parsed.projectId,
        updatedAt: item.updatedAt,
        createdAt: new Date(parsed.createdAt),
        messages: parsed.messages.map((message) => ({
          ...message,
          timestamp: new Date(message.timestamp),
        })),
      })
    } catch {
      warnings.push({
        code: 'cloud_chat_invalid',
        kind: 'cloud_chats',
        id: item.id,
        message: 'A cloud chat was invalid and was omitted.',
      })
      complete = false
    }
  }
  return { chats, warnings, complete }
}

async function listAllCloudChats() {
  const listed: Awaited<
    ReturnType<typeof cloudStorage.listChats>
  >['conversations'] = []
  let continuationToken: string | undefined
  do {
    const page = await cloudStorage.listChats({
      limit: PAGE_SIZE,
      continuationToken,
    })
    listed.push(...page.conversations)
    continuationToken = page.nextContinuationToken
  } while (continuationToken)
  return listed
}

export async function createNativeBackup(
  context: NativeBackupContext,
): Promise<NativeBackupArchive> {
  const canReadCloud = (await cloudStorage.isAuthenticated()) && hasPrimaryKey()
  if (context.cloudDataExpected && !canReadCloud) {
    throw new Error(
      'Sign in and unlock your encryption key before backing up cloud data',
    )
  }
  const emptyProjects = {
    projects: [],
    documents: [],
    warnings: [],
    complete: true,
  }
  const emptyCloud = { chats: [], warnings: [], complete: true }
  const [projectData, cloudData, firstLocal] = await Promise.all([
    canReadCloud ? enumerateProjects() : Promise.resolve(emptyProjects),
    canReadCloud ? enumerateCloudChats() : Promise.resolve(emptyCloud),
    chatStorage.getAllChats(),
  ])
  const localChats = firstLocal.filter(
    (chat) => chat.isLocalOnly && !chat.isBlankChat && !chat.decryptionFailed,
  )
  const secondLocal = (await chatStorage.getAllChats()).filter(
    (chat) => chat.isLocalOnly && !chat.isBlankChat && !chat.decryptionFailed,
  )
  const localChanged =
    JSON.stringify(localChats.map((chat) => [chat.id, chat.updatedAt])) !==
    JSON.stringify(secondLocal.map((chat) => [chat.id, chat.updatedAt]))
  const warnings = [...projectData.warnings, ...cloudData.warnings]
  if (localChanged) {
    warnings.push({
      code: 'local_chats_changed',
      kind: 'local_chats',
      message:
        'Local chats continued changing during export; the latest read was used.',
    })
  }
  return buildNativeBackup({
    projects: projectData.projects,
    projectDocuments: projectData.documents,
    cloudChats: cloudData.chats,
    localChats: secondLocal,
    warnings,
    complete: projectData.complete && cloudData.complete && !localChanged,
  })
}
