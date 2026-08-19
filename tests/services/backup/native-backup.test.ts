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

async function archive(complete = true) {
  return buildNativeBackup({
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
}

describe('native Tinfoil backup', () => {
  it('preserves projects, memory, color, documents, relationships and images', async () => {
    const built = await archive()
    const validated = validateNativeBackup(built.data)

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
    const validated = validateNativeBackup(built.data)
    expect(validated.manifest.complete).toBe(false)
    expect(validated.manifest.warnings).toEqual([
      expect.objectContaining({ code: 'changed', kind: 'cloud_chats' }),
    ])
  })

  it('rejects malformed archives, hash changes, counts and schemas', async () => {
    expect(() => validateNativeBackup(strToU8('not a zip'))).toThrow(
      'valid ZIP',
    )

    const built = await archive()
    const changed = unzipSync(built.data)
    changed['projects.json'] = strToU8('[]')
    expect(() => validateNativeBackup(zipSync(changed))).toThrow(
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
    expect(() => validateNativeBackup(zipSync(invalidSchema))).toThrow(
      'version 1 schema',
    )
  })

  it('restores local chats idempotently and partitions the cloud package', async () => {
    const built = await archive()
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
    const second = await restoreNativeBackup(
      built.data,
      'destination-user',
      store,
    )

    expect(first.local).toEqual({ imported: 1, skipped: 0, conflicts: 0 })
    expect(second.local).toEqual({ imported: 0, skipped: 1, conflicts: 0 })
    expect([...stored.values()][0]).toMatchObject({
      isLocalOnly: true,
      projectId: 'project-1',
    })
    const cloudFiles = unzipSync(
      new Uint8Array(await first.cloudArchive!.arrayBuffer()),
    )
    const cloudManifest = JSON.parse(strFromU8(cloudFiles['manifest.json']))
    expect(cloudManifest.format).toBe(NATIVE_CLOUD_IMPORT_FORMAT)
    expect(cloudManifest.counts.local_chats).toBe(0)
    expect(cloudFiles['local_chats.json']).toBeUndefined()
    expect(
      Object.keys(cloudFiles).some((path) => path.startsWith('images/local/')),
    ).toBe(false)
  })
})
