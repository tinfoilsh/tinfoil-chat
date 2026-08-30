import type { Attachment } from '@/components/chat/types'
import { AuthTokenUnavailableError } from '@/services/auth'
import { CloudBackupReadError } from '@/services/cloud/cloud-storage'
import {
  collectNativeBackupV2,
  formatNativeBackupV2,
  type NativeBackupCollectionDependencies,
} from '@/services/native-backup'
import type { StoredChat } from '@/services/storage/indexed-db'
import type {
  BackupInventoryItem,
  BackupInventoryResponse,
} from '@/services/sync-enclave/sync-api'
import { SyncNetworkError } from '@/services/sync-enclave/sync-enclave-client'
import type { Project, ProjectDocument } from '@/types/project'

const timestamp = '2026-08-20T12:00:00.000Z'
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

function chat(overrides: Partial<StoredChat> = {}): StoredChat {
  return {
    id: 'chat',
    title: 'Chat',
    messages: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    lastAccessedAt: 0,
    syncVersion: 1,
    ...overrides,
  }
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project',
    name: 'Project',
    description: '',
    systemInstructions: 'Be concise',
    color: 'blue',
    memory: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    syncVersion: 1,
    ...overrides,
  }
}

function document(overrides: Partial<ProjectDocument> = {}): ProjectDocument {
  return {
    id: 'document',
    projectId: 'project',
    filename: 'notes.txt',
    contentType: 'text/plain',
    sizeBytes: 4,
    syncVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    content: 'text',
    ...overrides,
  }
}

function item(
  scope: BackupInventoryItem['scope'],
  id: string,
  etag: string,
  projectId?: string,
): BackupInventoryItem {
  return {
    scope,
    id,
    etag,
    ...(projectId ? { project_id: projectId } : {}),
    created_at: timestamp,
    updated_at: timestamp,
  }
}

function inventory(items: BackupInventoryItem[] = []): BackupInventoryResponse {
  return { captured_at: timestamp, total_items: items.length, items }
}

function dependencies(
  overrides: Partial<NativeBackupCollectionDependencies> = {},
): NativeBackupCollectionDependencies {
  return {
    isAuthenticated: async () => true,
    activeUserId: () => 'user',
    requireUnlockedCek: () => {},
    getCloudInventory: async () => inventory(),
    getCloudChat: async () => null,
    getCloudImage: async () => null,
    getProject: async () => null,
    getDocument: async () => null,
    getLocalChats: async () => [],
    getLocalChat: async () => null,
    ...overrides,
  }
}

describe('native backup collection', () => {
  it('uses one captured inventory and passes opaque ETags to grouped reads', async () => {
    const getCloudInventory = vi
      .fn()
      .mockResolvedValue(
        inventory([
          item('chat', 'chat', 'chat-etag', 'project'),
          item('project', 'project', 'project-etag'),
          item('project_document', 'document', 'document-etag', 'project'),
        ]),
      )
    const getCloudChat = vi
      .fn()
      .mockResolvedValue(chat({ projectId: 'project' }))
    const getProject = vi.fn().mockResolvedValue(project())
    const getDocument = vi.fn().mockResolvedValue(document())

    const result = await collectNativeBackupV2(
      dependencies({
        getCloudInventory,
        getCloudChat,
        getProject,
        getDocument,
      }),
    )

    expect(getCloudInventory).toHaveBeenCalledOnce()
    expect(getCloudChat).toHaveBeenCalledWith('chat', 'chat-etag')
    expect(getProject).toHaveBeenCalledWith('project', 'project-etag')
    expect(getDocument).toHaveBeenCalledWith(
      'project',
      'document',
      'document-etag',
    )
    expect(result.projects[0]).toMatchObject({
      id: 'project',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    expect(result.relationships).toMatchObject({
      projectChats: [{ projectId: 'project', chatId: 'chat' }],
      projectDocuments: [{ projectId: 'project', documentId: 'document' }],
    })
    expect(() => formatNativeBackupV2(result)).not.toThrow()
  })

  it('reuses the captured cloud inventory while local inventory converges', async () => {
    const local = chat({
      id: 'local',
      isLocalOnly: true,
      syncUserId: 'user',
    })
    const getCloudInventory = vi.fn().mockResolvedValue(inventory())
    const getLocalChats = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([local])
      .mockResolvedValue([local])
    const getLocalChat = vi.fn().mockResolvedValue(local)

    const result = await collectNativeBackupV2(
      dependencies({ getCloudInventory, getLocalChats, getLocalChat }),
    )

    expect(getCloudInventory).toHaveBeenCalledOnce()
    expect(result.localChats.map(({ id }) => id)).toEqual(['local'])
  })

  it.each([
    ['snapshot_deleted', 'deleted', 'record_deleted_after_snapshot'],
    ['snapshot_changed', 'unstable', 'record_changed_after_snapshot'],
  ] as const)(
    'omits a cloud item reported as %s after capture',
    async (readCategory, omissionCategory, reason) => {
      const getCloudChat = vi.fn(async () => {
        throw new CloudBackupReadError(readCategory, reason, true)
      })

      const result = await collectNativeBackupV2(
        dependencies({
          getCloudInventory: async () =>
            inventory([item('chat', 'chat', 'opaque-etag')]),
          getCloudChat,
        }),
      )

      expect(getCloudChat).toHaveBeenCalledOnce()
      expect(result.cloudChats).toEqual([])
      expect(result.omissions).toContainEqual({
        kind: 'cloud_chat',
        source_id: 'chat',
        category: omissionCategory,
        reason,
      })
    },
  )

  it('omits dependent documents and repairs relationships for an omitted project', async () => {
    const cloudChat = chat({ projectId: 'project' })
    const result = await collectNativeBackupV2(
      dependencies({
        getCloudInventory: async () =>
          inventory([
            item('chat', 'chat', 'chat-etag', 'project'),
            item('project', 'project', 'project-etag'),
            item('project_document', 'document', 'doc-etag', 'project'),
          ]),
        getCloudChat: async () => cloudChat,
        getProject: async () => {
          throw new CloudBackupReadError(
            'item_invalid',
            'project_payload_invalid',
            true,
          )
        },
      }),
    )

    expect(result.projects).toEqual([])
    expect(result.projectDocuments).toEqual([])
    expect(result.cloudChats[0].projectId).toBeUndefined()
    expect(result.omissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'project', source_id: 'project' }),
        expect.objectContaining({
          kind: 'project_document',
          source_id: 'document',
          reason: 'parent_project_omitted',
        }),
        expect.objectContaining({ kind: 'relationship', source_id: 'chat' }),
      ]),
    )
  })

  it('keeps owner local chats and omits unavailable attachments', async () => {
    const attachment: Attachment = {
      id: 'image',
      type: 'image',
      fileName: 'image.png',
      encryptionKey: 'key',
    }
    const source = chat({
      id: 'local',
      isLocalOnly: true,
      syncUserId: 'user',
      messages: [
        {
          role: 'user',
          content: 'image',
          timestamp: new Date(timestamp),
          attachments: [attachment],
        },
      ],
    })
    const result = await collectNativeBackupV2(
      dependencies({
        getLocalChats: async () => [source],
        getLocalChat: async () => source,
      }),
    )

    expect(result.localChats).toHaveLength(1)
    expect(result.localChats[0].messages[0].attachments).toEqual([])
    expect(result.omissions[0]).toMatchObject({
      kind: 'attachment',
      parent_source_id: 'local',
    })
  })

  it('includes available embedded local images in the browser archive input', async () => {
    const source = chat({
      id: 'local',
      isLocalOnly: true,
      syncUserId: 'user',
      messages: [
        {
          role: 'user',
          content: 'image',
          timestamp: new Date(timestamp),
          attachments: [
            {
              id: 'image',
              type: 'image',
              fileName: 'image.png',
              base64: btoa(String.fromCharCode(...png)),
            },
          ],
        },
      ],
    })
    const result = await collectNativeBackupV2(
      dependencies({
        getLocalChats: async () => [source],
        getLocalChat: async () => source,
      }),
    )

    expect(result.images).toHaveLength(1)
    expect(result.images[0].bytes).toEqual(png)
  })

  it.each([
    new AuthTokenUnavailableError('signed out'),
    new SyncNetworkError(),
    new CloudBackupReadError('key_unavailable', 'cloud_key_unavailable', false),
  ])(
    'keeps authentication, network, and key failures fatal',
    async (failure) => {
      await expect(
        collectNativeBackupV2(
          dependencies({
            getCloudInventory: async () =>
              inventory([item('chat', 'chat', 'etag')]),
            getCloudChat: async () => {
              throw failure
            },
          }),
        ),
      ).rejects.toBe(failure)
    },
  )
})
