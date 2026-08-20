import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { z } from 'zod'
import {
  NATIVE_BACKUP_ENTITY_KINDS,
  NATIVE_BACKUP_FORMAT,
  NATIVE_BACKUP_LIMITS,
  NATIVE_BACKUP_VERSION,
  type NativeBackupEntityKind,
} from './constants'
import {
  NativeBackupChatSchema,
  NativeBackupImageSchema,
  NativeBackupProjectDocumentSchema,
  NativeBackupProjectSchema,
  NativeBackupRelationshipsSchema,
  type NativeBackupChat,
  type NativeBackupImage,
  type NativeBackupProject,
  type NativeBackupProjectDocument,
  type NativeBackupRelationships,
} from './schemas'

const MANIFEST_PATH = 'manifest.json'
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })
const countSchema = z.number().int().nonnegative()
const strict = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict()

export interface NativeBackupFileEntry {
  path: string
  kind: NativeBackupEntityKind
  bytes: Uint8Array
}

export interface NativeBackupImageInput {
  metadata: NativeBackupImage
  bytes: Uint8Array
}

export interface NativeBackupFormatInput {
  backupId: string
  createdAt: string
  projects: readonly NativeBackupProject[]
  projectDocuments: readonly NativeBackupProjectDocument[]
  cloudChats: readonly NativeBackupChat[]
  localChats: readonly NativeBackupChat[]
  relationships: NativeBackupRelationships
  images: readonly NativeBackupImageInput[]
}

export interface NativeBackupManifestV1 {
  format: typeof NATIVE_BACKUP_FORMAT
  version: typeof NATIVE_BACKUP_VERSION
  backup_id: string
  created_at: string
  complete: true
  counts: Record<NativeBackupEntityKind, number> & { files: number }
  notices: { contains_plaintext: true; documents_are_extracted_text_only: true }
  files: Array<{
    path: string
    kind: NativeBackupEntityKind
    sha256: string
    size_bytes: number
  }>
}

const manifestSchema: z.ZodType<NativeBackupManifestV1> = strict({
  format: z.literal(NATIVE_BACKUP_FORMAT),
  version: z.literal(NATIVE_BACKUP_VERSION),
  backup_id: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
  complete: z.literal(true),
  counts: strict({
    projects: countSchema,
    project_documents: countSchema,
    cloud_chats: countSchema,
    local_chats: countSchema,
    relationships: countSchema,
    images: countSchema,
    files: countSchema,
  }),
  notices: strict({
    contains_plaintext: z.literal(true),
    documents_are_extracted_text_only: z.literal(true),
  }),
  files: z.array(
    strict({
      path: z.string(),
      kind: z.enum(NATIVE_BACKUP_ENTITY_KINDS),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
      size_bytes: countSchema,
    }),
  ),
})

function fail(message: string): never {
  throw new Error(`Invalid native backup: ${message}`)
}

const jsonBytes = (value: unknown) => encoder.encode(JSON.stringify(value))

function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(decoder.decode(bytes))
  } catch {
    return fail(`${label} is not valid UTF-8 JSON`)
  }
}

const idComponent = (id: string) => `id-${bytesToHex(encoder.encode(id))}`
const hash = (bytes: Uint8Array) => bytesToHex(sha256(bytes))
const relationshipCount = (value: NativeBackupRelationships) =>
  value.projectChats.length +
  value.projectDocuments.length +
  value.chatImages.length

function expectedPathKind(path: string): NativeBackupEntityKind | null {
  if (path === 'relationships.json') return 'relationships'
  const match =
    /^(projects|project_documents|cloud_chats|local_chats)\/id-[0-9a-f]+(?:\/id-[0-9a-f]+)?\.json$/.exec(
      path,
    )
  if (match) return match[1] as NativeBackupEntityKind
  if (/^images\/id-[0-9a-f]+\.(json|bin)$/.test(path)) return 'images'
  return null
}

function zipUpperBound(path: string, size: number): number {
  const pathBytes = encoder.encode(path).length
  return size + Math.ceil(size / 16_383) * 5 + 104 + pathBytes * 2
}

export function assertNativeBackupSizeLimits(
  manifestSizeBytes: number,
  files: readonly { path: string; sizeBytes: number }[],
) {
  if (files.length + 1 > NATIVE_BACKUP_LIMITS.entries)
    fail('archive entry limit exceeded')
  let aggregateJsonBytes = manifestSizeBytes
  let archiveBytes = 22 + zipUpperBound(MANIFEST_PATH, manifestSizeBytes)
  for (const file of files) {
    archiveBytes += zipUpperBound(file.path, file.sizeBytes)
    if (file.path.endsWith('.bin')) {
      if (file.sizeBytes > NATIVE_BACKUP_LIMITS.imageBytes)
        fail('image size limit exceeded')
    } else {
      aggregateJsonBytes += file.sizeBytes
    }
  }
  if (aggregateJsonBytes > NATIVE_BACKUP_LIMITS.aggregateJsonBytes)
    fail('aggregate JSON size limit exceeded')
  if (archiveBytes > NATIVE_BACKUP_LIMITS.archiveBytes)
    fail('archive size limit exceeded')
}

function sortedUnique<T extends { id: string }>(
  items: readonly T[],
  name: string,
) {
  const sorted = [...items].sort((a, b) =>
    idComponent(a.id).localeCompare(idComponent(b.id)),
  )
  for (let index = 1; index < sorted.length; index++)
    if (sorted[index - 1].id === sorted[index].id) fail(`duplicate ${name} id`)
  return sorted
}

function addJson(
  files: NativeBackupFileEntry[],
  path: string,
  kind: NativeBackupEntityKind,
  value: unknown,
) {
  files.push({ path, kind, bytes: jsonBytes(value) })
}

const relationKey = (left: string, right: string) =>
  JSON.stringify([left, right])

function sortedRelationships(
  relationships: NativeBackupRelationships,
): NativeBackupRelationships {
  const byKey =
    <T>(key: (value: T) => string) =>
    (left: T, right: T) =>
      key(left).localeCompare(key(right))
  return {
    projectChats: [...relationships.projectChats].sort(
      byKey(({ projectId, chatId }) => relationKey(projectId, chatId)),
    ),
    projectDocuments: [...relationships.projectDocuments].sort(
      byKey(({ projectId, documentId }) => relationKey(projectId, documentId)),
    ),
    chatImages: [...relationships.chatImages].sort(
      byKey(({ chatId, imageId }) => relationKey(chatId, imageId)),
    ),
  }
}

export function formatNativeBackupV1(input: NativeBackupFormatInput): {
  manifestBytes: Uint8Array
  files: NativeBackupFileEntry[]
} {
  z.string().uuid().parse(input.backupId)
  z.string().datetime({ offset: true }).parse(input.createdAt)
  const projects = sortedUnique(
    input.projects.map((value) => NativeBackupProjectSchema.parse(value)),
    'project',
  )
  const documents = sortedUnique(
    input.projectDocuments.map((value) =>
      NativeBackupProjectDocumentSchema.parse(value),
    ),
    'project document',
  )
  const cloudChats = sortedUnique(
    input.cloudChats.map((value) => NativeBackupChatSchema.parse(value)),
    'cloud chat',
  )
  const localChats = sortedUnique(
    input.localChats.map((value) => NativeBackupChatSchema.parse(value)),
    'local chat',
  )
  const chatIds = new Set(cloudChats.map(({ id }) => id))
  for (const { id } of localChats) {
    if (chatIds.has(id))
      fail('chat ids must be unique across cloud and local chats')
    chatIds.add(id)
  }
  const images = sortedUnique(
    input.images.map(({ metadata, bytes }) => ({
      ...NativeBackupImageSchema.parse(metadata),
      sizeBytes: bytes.length,
      bytes,
    })),
    'image',
  )
  const relationships = sortedRelationships(
    NativeBackupRelationshipsSchema.parse(input.relationships),
  )
  const files: NativeBackupFileEntry[] = []
  for (const value of projects)
    addJson(files, `projects/${idComponent(value.id)}.json`, 'projects', value)
  for (const value of documents)
    addJson(
      files,
      `project_documents/${idComponent(value.projectId)}/${idComponent(value.id)}.json`,
      'project_documents',
      value,
    )
  for (const value of cloudChats)
    addJson(
      files,
      `cloud_chats/${idComponent(value.id)}.json`,
      'cloud_chats',
      value,
    )
  for (const value of localChats)
    addJson(
      files,
      `local_chats/${idComponent(value.id)}.json`,
      'local_chats',
      value,
    )
  addJson(files, 'relationships.json', 'relationships', relationships)
  for (const { bytes, ...metadata } of images) {
    const base = `images/${idComponent(metadata.id)}`
    addJson(files, `${base}.json`, 'images', metadata)
    files.push({ path: `${base}.bin`, kind: 'images', bytes })
  }
  files.sort((a, b) => (a.path < b.path ? -1 : 1))
  const counts = {
    projects: projects.length,
    project_documents: documents.length,
    cloud_chats: cloudChats.length,
    local_chats: localChats.length,
    relationships: relationshipCount(relationships),
    images: images.length,
    files: files.length,
  }
  const manifest: NativeBackupManifestV1 = {
    format: NATIVE_BACKUP_FORMAT,
    version: NATIVE_BACKUP_VERSION,
    backup_id: input.backupId,
    created_at: input.createdAt,
    complete: true,
    counts,
    notices: {
      contains_plaintext: true,
      documents_are_extracted_text_only: true,
    },
    files: files.map(({ path, kind, bytes }) => ({
      path,
      kind,
      sha256: hash(bytes),
      size_bytes: bytes.length,
    })),
  }
  const manifestBytes = jsonBytes(manifest)
  assertValidNativeBackupV1(manifestBytes, files)
  return { manifestBytes, files }
}

function exactRelations(values: string[], wanted: Set<string>, name: string) {
  const actual = new Set(values)
  if (actual.size !== values.length) fail(`duplicate ${name} relationship`)
  if (actual.size !== wanted.size || values.some((value) => !wanted.has(value)))
    fail(`${name} relationships do not match entities`)
}

function assertSemanticContent(
  projects: NativeBackupProject[],
  documents: NativeBackupProjectDocument[],
  chats: NativeBackupChat[],
  relationships: NativeBackupRelationships,
  images: NativeBackupImage[],
) {
  const projectIds = new Set(projects.map(({ id }) => id))
  const chatIds = new Set(chats.map(({ id }) => id))
  const documentIds = new Set(documents.map(({ id }) => id))
  const imageIds = new Set(images.map(({ id }) => id))
  if (projectIds.size !== projects.length || chatIds.size !== chats.length)
    fail('duplicate entity id')
  if (documentIds.size !== documents.length || imageIds.size !== images.length)
    fail('duplicate entity id')
  const expectedDocuments = new Set(
    documents.map(({ projectId, id }) => {
      if (!projectIds.has(projectId))
        fail('document references unknown project')
      return relationKey(projectId, id)
    }),
  )
  const expectedChats = new Set(
    chats.flatMap(({ id, projectId }) => {
      if (!projectId) return []
      if (!projectIds.has(projectId)) fail('chat references unknown project')
      return [relationKey(projectId, id)]
    }),
  )
  exactRelations(
    relationships.projectDocuments.map(({ projectId, documentId }) => {
      if (!projectIds.has(projectId) || !documentIds.has(documentId))
        fail('project document relationship references unknown entity')
      return relationKey(projectId, documentId)
    }),
    expectedDocuments,
    'project document',
  )
  exactRelations(
    relationships.projectChats.map(({ projectId, chatId }) => {
      if (!projectIds.has(projectId) || !chatIds.has(chatId))
        fail('project chat relationship references unknown entity')
      return relationKey(projectId, chatId)
    }),
    expectedChats,
    'project chat',
  )
  exactRelations(
    relationships.chatImages.map(({ chatId, imageId }) => {
      if (!chatIds.has(chatId) || !imageIds.has(imageId))
        fail('chat image relationship references unknown entity')
      return relationKey(chatId, imageId)
    }),
    new Set(images.map(({ chatId, id }) => relationKey(chatId, id))),
    'chat image',
  )
  let messages = 0
  let attachments = 0
  const referencedImages = new Set<string>()
  const imageById = new Map(images.map((image) => [image.id, image]))
  for (const chat of chats) {
    messages += chat.messages.length
    chat.messages.forEach((message, messageIndex) => {
      const referenceImage = (
        imageId: string,
        location: Pick<
          NativeBackupImage,
          'attachmentId' | 'page' | 'legacyIndex'
        >,
      ) => {
        const image = imageById.get(imageId)
        if (!image || referencedImages.has(imageId))
          fail('message has an invalid or duplicate image reference')
        if (
          image.chatId !== chat.id ||
          image.messageIndex !== messageIndex ||
          image.attachmentId !== location.attachmentId ||
          image.page !== location.page ||
          image.legacyIndex !== location.legacyIndex
        )
          fail('image descriptor does not match its message reference')
        referencedImages.add(imageId)
      }
      attachments += message.attachments?.length ?? 0
      for (const attachment of message.attachments ?? []) {
        if (attachment.type === 'image')
          referenceImage(attachment.imageId, { attachmentId: attachment.id })
        for (const page of attachment.type === 'document'
          ? (attachment.pages ?? [])
          : [])
          if (page.imageId)
            referenceImage(page.imageId, {
              attachmentId: attachment.id,
              page: page.page,
            })
      }
      for (const [legacyIndex, image] of (message.imageData ?? []).entries())
        referenceImage(image.imageId, { legacyIndex })
    })
  }
  if (referencedImages.size !== images.length)
    fail('image is not referenced by a message')
  if (messages > NATIVE_BACKUP_LIMITS.messages) fail('message limit exceeded')
  if (attachments > NATIVE_BACKUP_LIMITS.attachments)
    fail('attachment limit exceeded')
}

export function assertValidNativeBackupV1(
  manifestBytes: Uint8Array,
  files: readonly NativeBackupFileEntry[],
): NativeBackupManifestV1 {
  const manifest = manifestSchema.parse(parseJson(manifestBytes, MANIFEST_PATH))
  assertNativeBackupSizeLimits(
    manifestBytes.length,
    files.map(({ path, bytes }) => ({ path, sizeBytes: bytes.length })),
  )
  const listed = new Map(manifest.files.map((file) => [file.path, file]))
  if (
    listed.size !== manifest.files.length ||
    files.length !== manifest.files.length
  )
    fail('file list contains missing or duplicate paths')
  const seenPaths = new Set<string>()
  const projects: NativeBackupProject[] = []
  const documents: NativeBackupProjectDocument[] = []
  const chats: NativeBackupChat[] = []
  const relationships: NativeBackupRelationships[] = []
  const images: NativeBackupImage[] = []
  const imageBytes = new Map<string, number>()
  for (const file of files) {
    if (seenPaths.has(file.path)) fail(`duplicate path ${file.path}`)
    seenPaths.add(file.path)
    const metadata = listed.get(file.path)
    const expectedKind = expectedPathKind(file.path)
    if (
      !metadata ||
      !expectedKind ||
      metadata.kind !== file.kind ||
      file.kind !== expectedKind
    )
      fail(`invalid or unlisted path ${file.path}`)
    if (
      metadata.size_bytes !== file.bytes.length ||
      metadata.sha256 !== hash(file.bytes)
    )
      fail(`size or hash mismatch for ${file.path}`)
    if (file.path.endsWith('.bin')) {
      imageBytes.set(file.path.slice(0, -4), file.bytes.length)
      continue
    }
    const value = parseJson(file.bytes, file.path)
    if (file.kind === 'projects') {
      const project = NativeBackupProjectSchema.parse(value)
      if (file.path !== `projects/${idComponent(project.id)}.json`)
        fail('project path does not match its id')
      projects.push(project)
    }
    if (file.kind === 'project_documents') {
      const document = NativeBackupProjectDocumentSchema.parse(value)
      if (
        file.path !==
        `project_documents/${idComponent(document.projectId)}/${idComponent(document.id)}.json`
      )
        fail('project document path does not match its ids')
      documents.push(document)
    }
    if (file.kind === 'cloud_chats' || file.kind === 'local_chats') {
      const chat = NativeBackupChatSchema.parse(value)
      if (file.path !== `${file.kind}/${idComponent(chat.id)}.json`)
        fail('chat path does not match its id')
      chats.push(chat)
    }
    if (file.kind === 'relationships')
      relationships.push(NativeBackupRelationshipsSchema.parse(value))
    if (file.kind === 'images') {
      const image = NativeBackupImageSchema.parse(value)
      if (file.path !== `images/${idComponent(image.id)}.json`)
        fail('image path does not match its id')
      images.push(image)
    }
  }
  if (relationships.length !== 1)
    fail('exactly one relationships file is required')
  for (const image of images) {
    const size = imageBytes.get(`images/${idComponent(image.id)}`)
    if (size === undefined || image.sizeBytes !== size)
      fail('image bytes are missing or mismatched')
  }
  if (imageBytes.size !== images.length) fail('image metadata is missing')
  const actualCounts = {
    projects: projects.length,
    project_documents: documents.length,
    cloud_chats: files.filter(({ kind }) => kind === 'cloud_chats').length,
    local_chats: files.filter(({ kind }) => kind === 'local_chats').length,
    relationships: relationshipCount(relationships[0]),
    images: images.length,
    files: files.length,
  }
  for (const key of [...NATIVE_BACKUP_ENTITY_KINDS, 'files'] as const)
    if (manifest.counts[key] !== actualCounts[key])
      fail(`count mismatch for ${key}`)
  const entities = projects.length + documents.length + chats.length
  if (entities > NATIVE_BACKUP_LIMITS.entities) fail('entity limit exceeded')
  assertSemanticContent(projects, documents, chats, relationships[0], images)
  return manifest as NativeBackupManifestV1
}
