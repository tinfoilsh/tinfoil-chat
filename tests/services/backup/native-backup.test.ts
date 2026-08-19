import type { Chat } from '@/components/chat/types'
import {
  buildNativeBackup,
  NATIVE_BACKUP_FORMAT,
  NATIVE_CLOUD_IMPORT_FORMAT,
  restoreNativeBackup,
  validateNativeBackup,
} from '@/services/backup/native-backup'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import contractFixture from '../../fixtures/native-cloud-import-v1.json'

const createdAt = '2026-08-18T12:00:00.000Z'

function chat(id: string, isLocalOnly: boolean, image = false): Chat {
  return {
    id,
    title: `${id} title`,
    createdAt: new Date(createdAt),
    updatedAt: createdAt,
    isLocalOnly,
    projectId: 'project-1',
    messages: [
      {
        role: 'user',
        content: 'hello',
        timestamp: new Date(createdAt),
        attachments: image
          ? [
              {
                id: `${id}-image`,
                type: 'image',
                fileName: 'photo.png',
                mimeType: 'image/png',
                base64: btoa('image bytes'),
                encryptionKey: 'must-not-be-exported',
              },
            ]
          : undefined,
      },
    ],
  }
}

async function archive(complete = true, backupId?: string) {
  const built = await buildNativeBackup({
    projects: [
      {
        id: 'project-1',
        name: 'Research',
        description: 'Description',
        systemInstructions: 'Be exact',
        color: '#123456',
        memory: [
          {
            id: 'fact-1',
            fact: 'Prefers concise answers',
            date: createdAt,
            category: 'preference',
            confidence: 1,
          },
        ],
        createdAt,
        updatedAt: createdAt,
        syncVersion: 2,
      },
    ],
    projectDocuments: [
      {
        id: 'doc-1',
        projectId: 'project-1',
        filename: 'paper.pdf',
        contentType: 'application/pdf',
        sizeBytes: 9000,
        syncVersion: 3,
        createdAt,
        updatedAt: createdAt,
        content: 'Extracted text',
      },
    ],
    cloudChats: [chat('cloud-1', false, true)],
    localChats: [chat('local-1', true, true)],
    complete,
    warnings: complete
      ? []
      : [
          {
            code: 'changed',
            kind: 'cloud_chats',
            message: 'A row kept changing.',
          },
        ],
  })
  if (!backupId) return built
  const files = unzipSync(built.data)
  const manifest = JSON.parse(strFromU8(files['manifest.json']))
  manifest.backup_id = backupId
  files['manifest.json'] = strToU8(JSON.stringify(manifest))
  return { ...built, data: zipSync(files), manifest }
}

describe('native Tinfoil backup', () => {
  it('preserves projects, memory, color, documents, relationships and images', async () => {
    const built = await archive()
    const validated = await validateNativeBackup(built.data)

    expect(built.filename).toBe(
      `tinfoil-backup-${validated.manifest.created_at.slice(0, 10)}.zip`,
    )
    expect(validated.manifest.format).toBe(NATIVE_BACKUP_FORMAT)
    expect(validated.manifest.counts).toEqual({
      projects: 1,
      project_documents: 1,
      cloud_chats: 1,
      local_chats: 1,
      relationships: 2,
      images: 2,
    })
    expect(validated.projects[0]).toMatchObject({
      color: '#123456',
      memory: [{ fact: 'Prefers concise answers' }],
    })
    expect(validated.projectDocuments[0]).toMatchObject({
      content: 'Extracted text',
      sizeBytes: 9000,
    })
    expect(validated.relationships.map((item) => item.location).sort()).toEqual(
      ['cloud', 'local'],
    )
    expect(
      validated.manifest.files.every((file) => file.sha256.length === 64),
    ).toBe(true)
    expect(JSON.stringify(validated.cloudChats)).not.toContain('encryptionKey')
    expect(JSON.stringify(validated.cloudChats)).not.toContain('base64')
  })

  it('keeps an incomplete archive downloadable with structured warnings', async () => {
    const built = await archive(false)
    const validated = await validateNativeBackup(built.data)
    expect(validated.manifest.complete).toBe(false)
    expect(validated.manifest.warnings).toEqual([
      expect.objectContaining({ code: 'changed', kind: 'cloud_chats' }),
    ])
  })

  it('rejects malformed archives, hash changes, counts and schemas', async () => {
    await expect(validateNativeBackup(strToU8('not a zip'))).rejects.toThrow(
      'valid ZIP',
    )

    const built = await archive()
    const changed = unzipSync(built.data)
    changed['projects.json'] = strToU8('[]')
    await expect(validateNativeBackup(zipSync(changed))).rejects.toThrow(
      'integrity check',
    )

    const invalidSchema = unzipSync(built.data)
    const manifest = JSON.parse(strFromU8(invalidSchema['manifest.json']))
    invalidSchema['projects.json'] = strToU8(JSON.stringify([{ id: 4 }]))
    const bytes = invalidSchema['projects.json']
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    manifest.files.find(
      (entry: { path: string }) => entry.path === 'projects.json',
    ).sha256 = Array.from(digest, (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('')
    manifest.files.find(
      (entry: { path: string }) => entry.path === 'projects.json',
    ).size = bytes.byteLength
    invalidSchema['manifest.json'] = strToU8(JSON.stringify(manifest))
    await expect(validateNativeBackup(zipSync(invalidSchema))).rejects.toThrow(
      'version 1 schema',
    )
  })

  it('restores local chats idempotently and partitions the cloud package', async () => {
    const built = await archive(true, contractFixture.source_backup_id)
    const stored = new Map<string, Chat>()
    const store = {
      getChat: vi.fn(async (id: string) => stored.get(id) ?? null),
      saveChat: vi.fn(async (value: Chat) => {
        stored.set(value.id, value)
      }),
    }

    const first = await restoreNativeBackup(
      built.data,
      'destination-user',
      store,
    )
    expect(first.local.imported).toBe(0)
    await first.finalizeLocal({ 'project-1': 'destination-project-1' })
    const second = await restoreNativeBackup(
      built.data,
      'destination-user',
      store,
    )
    await second.finalizeLocal({ 'project-1': 'destination-project-1' })

    expect(first.local).toEqual({ imported: 1, skipped: 0, conflicts: 0 })
    expect(second.local).toEqual({ imported: 0, skipped: 1, conflicts: 0 })
    expect([...stored.values()][0]).toMatchObject({
      isLocalOnly: true,
      projectId: 'destination-project-1',
    })
    const cloudFiles = unzipSync(
      new Uint8Array(await first.cloudArchive!.arrayBuffer()),
    )
    const cloudManifest = JSON.parse(strFromU8(cloudFiles['manifest.json']))
    expect(cloudManifest.format).toBe(NATIVE_CLOUD_IMPORT_FORMAT)
    expect(cloudManifest).toMatchObject({
      version: 1,
      counts: { projects: 1, documents: 1, chats: 1, blobs: 1 },
    })
    expect(cloudManifest.source_backup_id).toBe(built.manifest.backup_id)
    expect(cloudManifest.source_backup_id).toBe(
      contractFixture.source_backup_id,
    )
    expect(
      cloudManifest.entities.map((entity: { kind: string }) => entity.kind),
    ).toEqual(['project', 'document', 'chat'])
    expect(
      cloudManifest.entities.map(
        (entity: {
          kind: string
          source_id: string
          project_source_id?: string
          path: string
        }) => ({
          kind: entity.kind,
          source_id: entity.source_id,
          ...(entity.project_source_id
            ? { project_source_id: entity.project_source_id }
            : {}),
          payload: JSON.parse(strFromU8(cloudFiles[entity.path])),
        }),
      ),
    ).toEqual(contractFixture.entities)
    expect(
      cloudManifest.blobs.map((blob: { path: string }) => blob.path),
    ).toEqual(contractFixture.blobs.map((blob) => blob.path))
    expect(
      cloudManifest.blobs.map((blob: { path: string }) =>
        btoa(strFromU8(cloudFiles[blob.path])),
      ),
    ).toEqual(contractFixture.blobs.map((blob) => blob.base64))
    expect(cloudFiles['local_chats.json']).toBeUndefined()
    expect(
      Object.keys(cloudFiles).some((path) => path.startsWith('images/local/')),
    ).toBe(false)
  })

  it('detaches local chats when their project was not restored', async () => {
    const built = await archive()
    const stored: Chat[] = []
    const result = await restoreNativeBackup(built.data, 'destination-user', {
      getChat: async () => null,
      saveChat: async (value) => stored.push(value),
    })

    await result.finalizeLocal({})

    expect(stored[0].projectId).toBeUndefined()
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'local_chat_project_not_restored' }),
    )
  })

  it('rejects unsafe ZIP paths before extracting entries', async () => {
    await expect(
      validateNativeBackup(zipSync({ '../manifest.json': strToU8('{}') })),
    ).rejects.toThrow('safety limits')
  })
})
