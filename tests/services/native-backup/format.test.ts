import {
  NATIVE_BACKUP_LIMITS,
  assertValidNativeBackupV1,
  formatNativeBackupV1,
  type NativeBackupFormatInput,
  type NativeBackupManifestV1,
} from '@/services/native-backup'
import goldenManifest from '../../fixtures/native-backup-manifest-v1.json'

const timestamp = '2026-08-20T12:00:00.000Z'

function input(): NativeBackupFormatInput {
  return {
    backupId: '123e4567-e89b-42d3-a456-426614174000',
    createdAt: timestamp,
    projects: [
      {
        id: 'p',
        name: 'P',
        description: '',
        systemInstructions: '',
        memory: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    projectDocuments: [
      {
        id: 'd',
        projectId: 'p',
        filename: 'paper.pdf',
        contentType: 'application/pdf',
        sizeBytes: 10,
        extractedText: 'text',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    cloudChats: [
      {
        id: 'c',
        title: 'Cloud',
        messages: [
          {
            role: 'user',
            content: 'hello',
            attachments: [{ id: 'a', type: 'image', imageId: 'i' }],
            timestamp,
          },
        ],
        createdAt: timestamp,
        updatedAt: timestamp,
        projectId: 'p',
      },
    ],
    localChats: [
      {
        id: 'l',
        title: 'Local',
        messages: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    relationships: {
      projectChats: [{ projectId: 'p', chatId: 'c' }],
      projectDocuments: [{ projectId: 'p', documentId: 'd' }],
      chatImages: [{ chatId: 'c', imageId: 'i' }],
    },
    images: [
      {
        metadata: {
          id: 'i',
          chatId: 'c',
          messageIndex: 0,
          attachmentId: 'a',
          fileName: 'pixel.png',
          mimeType: 'image/png',
        },
        bytes: new Uint8Array([0, 1, 2, 3]),
      },
    ],
  }
}

describe('native backup v1 manifest', () => {
  it('matches the semantic golden manifest with deterministic hashes and counts', () => {
    const first = formatNativeBackupV1(input())
    const second = formatNativeBackupV1(input())

    expect(JSON.parse(new TextDecoder().decode(first.manifestBytes))).toEqual(
      goldenManifest,
    )
    expect(first.files.map(({ path }) => path)).toEqual(
      goldenManifest.files.map(({ path }) => path),
    )
    expect(second.manifestBytes).toEqual(first.manifestBytes)
    expect(assertValidNativeBackupV1(first.manifestBytes, first.files)).toEqual(
      goldenManifest,
    )
    expectTypeOf<NativeBackupManifestV1['counts']>().toMatchTypeOf<{
      projects: number
      project_documents: number
      cloud_chats: number
      local_chats: number
      relationships: number
      images: number
      files: number
    }>()
  })

  it('validates near-limit relationship sets without quadratic membership scans', () => {
    const nearLimit = input()
    const count = 24_000
    nearLimit.projects = Array.from({ length: count }, (_, index) => ({
      id: `p-${index}`,
      name: `Project ${index}`,
      description: '',
      systemInstructions: '',
      memory: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    }))
    nearLimit.projectDocuments = nearLimit.projects.map((project, index) => ({
      id: `d-${index}`,
      projectId: project.id,
      filename: `${index}.txt`,
      contentType: 'text/plain',
      sizeBytes: 1,
      extractedText: 'x',
      createdAt: timestamp,
      updatedAt: timestamp,
    }))
    nearLimit.cloudChats[0].projectId = nearLimit.projects[0].id
    nearLimit.relationships.projectChats[0].projectId = nearLimit.projects[0].id
    nearLimit.relationships.projectDocuments = nearLimit.projectDocuments.map(
      ({ id, projectId }) => ({ projectId, documentId: id }),
    )

    const formatted = formatNativeBackupV1(nearLimit)
    const manifest = assertValidNativeBackupV1(
      formatted.manifestBytes,
      formatted.files,
    )
    expect(manifest.counts.files).toBe(48_005)
    expect(manifest.counts.relationships).toBe(24_002)
  }, 30_000)

  it('requires matching image metadata, bytes, and message references', () => {
    const missingBytes = { ...input(), images: [] }
    expect(() => formatNativeBackupV1(missingBytes)).toThrow(
      'chat image relationship references unknown entity',
    )

    const wrongLocation = input()
    wrongLocation.images[0].metadata.messageIndex = 1
    expect(() => formatNativeBackupV1(wrongLocation)).toThrow(
      'image descriptor does not match its message reference',
    )
  })

  it('enforces parser-aligned image and archive safety limits', () => {
    expect(NATIVE_BACKUP_LIMITS.archiveBytes).toBe(512 * 1024 * 1024)
    expect(NATIVE_BACKUP_LIMITS.aggregateJsonBytes).toBe(256 * 1024 * 1024)
    const valid = input()
    const oversized = {
      ...valid,
      images: [
        {
          ...valid.images[0],
          bytes: new Uint8Array(NATIVE_BACKUP_LIMITS.imageBytes + 1),
        },
      ],
    }
    expect(() => formatNativeBackupV1(oversized)).toThrow(
      'image size limit exceeded',
    )

    const archiveLimited = input()
    const maxImage = new Uint8Array(NATIVE_BACKUP_LIMITS.imageBytes)
    const imageIds = Array.from({ length: 16 }, (_, index) => `i-${index}`)
    archiveLimited.cloudChats[0].messages[0].attachments = imageIds.map(
      (imageId) => ({ id: `a-${imageId}`, type: 'image', imageId }),
    )
    archiveLimited.relationships.chatImages = imageIds.map((imageId) => ({
      chatId: 'c',
      imageId,
    }))
    archiveLimited.images = imageIds.map((imageId) => ({
      metadata: {
        id: imageId,
        chatId: 'c',
        messageIndex: 0,
        attachmentId: `a-${imageId}`,
        fileName: `${imageId}.png`,
        mimeType: 'image/png',
      },
      bytes: maxImage,
    }))
    expect(() => formatNativeBackupV1(archiveLimited)).toThrow(
      'archive size limit exceeded',
    )
  }, 15_000)

  it('rejects unsafe or noncanonical paths', () => {
    const formatted = formatNativeBackupV1(input())
    const manifest = JSON.parse(
      new TextDecoder().decode(formatted.manifestBytes),
    )
    const project = formatted.files.find(({ kind }) => kind === 'projects')!
    project.path = 'projects/../project.json'
    manifest.files.find(
      ({ kind }: { kind: string }) => kind === 'projects',
    ).path = project.path

    expect(() =>
      assertValidNativeBackupV1(
        new TextEncoder().encode(JSON.stringify(manifest)),
        formatted.files,
      ),
    ).toThrow('invalid or unlisted path')
  })

  it('detects content, hash, size, count, and completeness tampering', () => {
    const formatted = formatNativeBackupV1(input())
    const tamperedFiles = formatted.files.map((file) => ({
      ...file,
      bytes: new Uint8Array(file.bytes),
    }))
    tamperedFiles[0].bytes[0] ^= 1
    expect(() =>
      assertValidNativeBackupV1(formatted.manifestBytes, tamperedFiles),
    ).toThrow('size or hash mismatch')

    type MutableManifest = {
      counts: { images: number; relationships?: number }
      complete: boolean
      files: unknown[]
    }
    for (const mutation of [
      (manifest: MutableManifest) => manifest.counts.images++,
      (manifest: MutableManifest) => delete manifest.counts.relationships,
      (manifest: MutableManifest) => (manifest.complete = false),
      (manifest: MutableManifest) => manifest.files.pop(),
    ]) {
      const manifest = JSON.parse(
        new TextDecoder().decode(formatted.manifestBytes),
      ) as MutableManifest
      mutation(manifest)
      expect(() =>
        assertValidNativeBackupV1(
          new TextEncoder().encode(JSON.stringify(manifest)),
          formatted.files,
        ),
      ).toThrow()
    }
  })
})
