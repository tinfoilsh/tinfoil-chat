import type { Attachment } from '@/components/chat/types'
import { AuthTokenUnavailableError } from '@/services/auth'
import { CloudBackupReadError } from '@/services/cloud/cloud-storage'
import {
  NATIVE_BACKUP_LIMITS,
  NativeBackupCollectionError,
  collectNativeBackupV1,
  collectNativeBackupV2,
  formatNativeBackupV1,
  formatNativeBackupV2,
  type NativeBackupCollectionDependencies,
} from '@/services/native-backup'
import type { StoredChat } from '@/services/storage/indexed-db'
import { SyncEnclaveError } from '@/services/sync-enclave'
import type { Project, ProjectDocument } from '@/types/project'

const timestamp = '2026-08-20T12:00:00.000Z'
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const pngBase64 = (suffix?: number) =>
  btoa(String.fromCharCode(...png, ...(suffix === undefined ? [] : [suffix])))

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
    memory: [
      {
        id: 'fact',
        fact: 'Likes tea',
        category: 'preference',
        confidence: 1,
        date: timestamp,
      },
    ],
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

function dependencies(
  overrides: Partial<NativeBackupCollectionDependencies> = {},
): NativeBackupCollectionDependencies {
  return {
    isAuthenticated: async () => true,
    activeUserId: () => 'user',
    requireUnlockedCek: () => {},
    listChats: async () => ({ items: [] }),
    getCloudChat: async () => null,
    getCloudImage: async () => null,
    listProjects: async () => ({ items: [] }),
    getProject: async () => null,
    listDocuments: async () => [],
    getDocument: async () => null,
    getLocalChats: async () => [],
    getLocalChat: async () => null,
    ...overrides,
  }
}

describe('native backup collection', () => {
  it('paginates all cloud chats and projects', async () => {
    const firstChat = chat({ id: 'chat-1' })
    const secondChat = chat({ id: 'chat-2' })
    const firstProject = project({ id: 'project-1' })
    const secondProject = project({ id: 'project-2' })
    const listChats = vi
      .fn()
      .mockResolvedValueOnce({
        items: [{ id: firstChat.id, syncVersion: 1 }],
        next: 'chat-page-2',
      })
      .mockResolvedValueOnce({
        items: [{ id: secondChat.id, syncVersion: 1 }],
      })
      .mockResolvedValue({
        items: [
          { id: firstChat.id, syncVersion: 1 },
          { id: secondChat.id, syncVersion: 1 },
        ],
      })
    const listProjects = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          {
            id: firstProject.id,
            syncVersion: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        next: 'project-page-2',
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: secondProject.id,
            syncVersion: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      })
      .mockResolvedValue({
        items: [firstProject, secondProject].map(
          ({ id, syncVersion, createdAt, updatedAt }) => ({
            id,
            syncVersion,
            createdAt,
            updatedAt,
          }),
        ),
      })

    const result = await collectNativeBackupV1(
      dependencies({
        listChats,
        listProjects,
        getCloudChat: async (id) =>
          id === firstChat.id ? firstChat : secondChat,
        getProject: async (id) =>
          id === firstProject.id ? firstProject : secondProject,
      }),
    )

    expect(listChats).toHaveBeenNthCalledWith(2, 'chat-page-2')
    expect(listProjects).toHaveBeenNthCalledWith(2, 'project-page-2')
    expect(result.cloudChats.map(({ id }) => id)).toEqual(['chat-1', 'chat-2'])
    expect(result.projects.map(({ id }) => id)).toEqual([
      'project-1',
      'project-2',
    ])
  })

  it('includes only signed-in-owner local-only chats', async () => {
    const included = chat({
      id: 'included',
      isLocalOnly: true,
      syncUserId: 'user',
    })
    const cloudCache = chat({ id: 'cloud-cache', syncUserId: 'user' })
    const anonymous = chat({ id: 'anonymous', isLocalOnly: true })
    const otherOwner = chat({
      id: 'other-owner',
      isLocalOnly: true,
      syncUserId: 'other',
    })
    const temporary = chat({
      id: 'temporary',
      isLocalOnly: true,
      syncUserId: 'user',
      isTemporary: true,
    })
    const blank = chat({
      id: 'blank',
      isLocalOnly: true,
      syncUserId: 'user',
      isBlankChat: true,
    })
    const values = [
      included,
      cloudCache,
      anonymous,
      otherOwner,
      temporary,
      blank,
    ]

    const result = await collectNativeBackupV1(
      dependencies({
        getLocalChats: async () => values,
        getLocalChat: async (id) => values.find((value) => value.id === id)!,
      }),
    )

    expect(result.localChats.map(({ id }) => id)).toEqual(['included'])
  })

  it('retrieves document content and cloud and local images with relationships', async () => {
    const imageAttachment: Attachment = {
      id: 'cloud-image',
      type: 'image',
      fileName: 'cloud.png',
      mimeType: 'image/png',
      encryptionKey: 'key',
    }
    const cloudChat = chat({
      id: 'cloud-chat',
      projectId: 'project',
      messages: [
        {
          role: 'user',
          content: 'cloud',
          timestamp: new Date(timestamp),
          attachments: [imageAttachment],
        },
      ],
    })
    const localChat = chat({
      id: 'local-chat',
      isLocalOnly: true,
      syncUserId: 'user',
      messages: [
        {
          role: 'user',
          content: 'local',
          timestamp: new Date(timestamp),
          imageData: [{ base64: pngBase64(), mimeType: 'image/png' }],
        },
      ],
    })
    const doc = document()

    const result = await collectNativeBackupV1(
      dependencies({
        listChats: async () => ({
          items: [{ id: cloudChat.id, syncVersion: 1 }],
        }),
        getCloudChat: async () => cloudChat,
        getCloudImage: async () => png,
        listProjects: async () => ({
          items: [
            {
              id: 'project',
              syncVersion: 1,
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          ],
        }),
        getProject: async () => project(),
        listDocuments: async () => [
          {
            id: doc.id,
            projectId: doc.projectId,
            syncVersion: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        getDocument: async () => doc,
        getLocalChats: async () => [localChat],
        getLocalChat: async () => localChat,
      }),
    )

    expect(result.projectDocuments[0].extractedText).toBe('text')
    expect(result.projects[0]).toMatchObject({
      color: 'blue',
      memory: project().memory,
    })
    expect(result.images.map(({ bytes }) => [...bytes])).toEqual([
      [...png],
      [...png],
    ])
    expect(result.relationships).toEqual({
      projectChats: [{ projectId: 'project', chatId: 'cloud-chat' }],
      projectDocuments: [{ projectId: 'project', documentId: 'document' }],
      chatImages: [
        {
          chatId: 'cloud-chat',
          imageId: '["attachment","cloud-chat",0,0,"cloud-image"]',
        },
        {
          chatId: 'local-chat',
          imageId: 'legacy:local-chat:0:0',
        },
      ],
    })
    expect(() => formatNativeBackupV2(result)).not.toThrow()
  })

  it('keeps documents with the same id in different projects', async () => {
    const projects = [
      project({ id: 'project-1' }),
      project({ id: 'project-2' }),
    ]
    const documents = projects.map(({ id: projectId }) =>
      document({ id: 'shared-document', projectId }),
    )

    const result = await collectNativeBackupV1(
      dependencies({
        listProjects: async () => ({
          items: projects.map(({ id, syncVersion, createdAt, updatedAt }) => ({
            id,
            syncVersion,
            createdAt,
            updatedAt,
          })),
        }),
        getProject: async (id) => projects.find((value) => value.id === id)!,
        listDocuments: async (projectId) =>
          documents
            .filter((value) => value.projectId === projectId)
            .map(({ id, projectId, syncVersion, createdAt, updatedAt }) => ({
              id,
              projectId,
              syncVersion,
              createdAt,
              updatedAt,
            })),
        getDocument: async (projectId, id) =>
          documents.find(
            (value) => value.projectId === projectId && value.id === id,
          )!,
      }),
    )

    expect(result.projectDocuments).toHaveLength(2)
  })

  it('retries one changed record and fails a persistently changing record', async () => {
    const stable = chat({ syncVersion: 2 })
    const getStable = vi.fn().mockResolvedValue(stable)
    const listStable = vi
      .fn()
      .mockResolvedValueOnce({ items: [{ id: stable.id, syncVersion: 1 }] })
      .mockResolvedValue({ items: [{ id: stable.id, syncVersion: 2 }] })
    await collectNativeBackupV1(
      dependencies({
        listChats: listStable,
        getCloudChat: getStable,
      }),
    )
    expect(getStable).toHaveBeenCalledTimes(5)

    let version = 1
    await expect(
      collectNativeBackupV1(
        dependencies({
          listChats: async () => ({ items: [{ id: 'chat', syncVersion: 1 }] }),
          getCloudChat: async () => chat({ syncVersion: version++ }),
        }),
      ),
    ).rejects.toThrow('cloud chat chat: version changed during collection')
  })

  it('revalidates local ownership and eligibility after a changed read', async () => {
    const eligible = chat({ isLocalOnly: true, syncUserId: 'user' })
    const ineligible = chat({
      isLocalOnly: true,
      syncUserId: 'other-user',
    })
    const getLocalChat = vi
      .fn()
      .mockResolvedValueOnce(eligible)
      .mockResolvedValue(ineligible)

    const result = await collectNativeBackupV1(
      dependencies({
        getLocalChats: async () => [eligible],
        getLocalChat,
      }),
    )

    expect(result.localChats).toEqual([])
    expect(getLocalChat).toHaveBeenCalledTimes(3)
  })

  it('detects local image changes during collection', async () => {
    const local = (base64: string) =>
      chat({
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
                mimeType: 'image/png',
                base64,
              },
            ],
          },
        ],
      })
    const getLocalChat = vi
      .fn()
      .mockResolvedValueOnce(local(pngBase64(1)))
      .mockResolvedValueOnce(local(pngBase64(2)))
      .mockResolvedValueOnce(local(pngBase64(3)))
      .mockResolvedValueOnce(local(pngBase64(4)))

    await expect(
      collectNativeBackupV1(
        dependencies({
          getLocalChats: async () => [local(pngBase64(1))],
          getLocalChat,
        }),
      ),
    ).rejects.toThrow('local chat chat: version changed during collection')
  })

  it('adds record context to malformed local chat errors', async () => {
    const malformed = chat({
      isLocalOnly: true,
      syncUserId: 'user',
      createdAt: null as unknown as string,
    })

    await expect(
      collectNativeBackupV1(
        dependencies({
          getLocalChats: async () => [malformed],
          getLocalChat: async () => malformed,
        }),
      ),
    ).rejects.toThrow(
      'local chat chat: record is invalid: Invalid backup timestamp',
    )
  })

  it('refreshes authoritative timestamps when a listed version changes', async () => {
    const oldTimestamp = '2026-08-19T12:00:00.000Z'
    const listProjects = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          {
            id: 'project',
            syncVersion: 1,
            createdAt: oldTimestamp,
            updatedAt: oldTimestamp,
          },
        ],
      })
      .mockResolvedValue({
        items: [
          {
            id: 'project',
            syncVersion: 2,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      })

    const result = await collectNativeBackupV1(
      dependencies({
        listProjects,
        getProject: async () => project({ syncVersion: 2 }),
      }),
    )

    expect(result.projects[0]).toMatchObject({
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    expect(listProjects).toHaveBeenCalledTimes(5)
  })

  it('deduplicates mutable paginated rows at their latest versions', async () => {
    const listChats = vi
      .fn()
      .mockResolvedValueOnce({
        items: [{ id: 'chat', syncVersion: 1 }],
        next: 'next',
      })
      .mockResolvedValueOnce({ items: [{ id: 'chat', syncVersion: 2 }] })
      .mockResolvedValue({ items: [{ id: 'chat', syncVersion: 2 }] })
    const listProjects = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          {
            id: 'project',
            syncVersion: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        next: 'next',
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'project',
            syncVersion: 2,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      })
      .mockResolvedValue({
        items: [
          {
            id: 'project',
            syncVersion: 2,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      })
    const getCloudChat = vi.fn().mockResolvedValue(chat({ syncVersion: 2 }))
    const getProject = vi.fn().mockResolvedValue(project({ syncVersion: 2 }))
    const listDocuments = vi.fn().mockResolvedValue([])

    const result = await collectNativeBackupV1(
      dependencies({
        listChats,
        listProjects,
        getCloudChat,
        getProject,
        listDocuments,
      }),
    )

    expect(result.cloudChats).toHaveLength(1)
    expect(result.projects).toHaveLength(1)
    expect(getCloudChat).toHaveBeenCalledTimes(2)
    expect(getProject).toHaveBeenCalledTimes(1)
    expect(listDocuments).toHaveBeenCalledTimes(2)
  })

  it('fails the whole collection with missing record and image details', async () => {
    await expect(
      collectNativeBackupV1(
        dependencies({
          listProjects: async () => ({
            items: [
              {
                id: 'missing-project',
                syncVersion: 1,
                createdAt: timestamp,
                updatedAt: timestamp,
              },
            ],
          }),
        }),
      ),
    ).rejects.toMatchObject({
      kind: 'project',
      recordId: 'missing-project',
    } satisfies Partial<NativeBackupCollectionError>)

    const missingImage = chat({
      messages: [
        {
          role: 'user',
          content: '',
          timestamp: new Date(timestamp),
          attachments: [
            { id: 'missing', type: 'image', fileName: 'missing.png' },
          ],
        },
      ],
    })
    await expect(
      collectNativeBackupV1(
        dependencies({
          listChats: async () => ({
            items: [{ id: missingImage.id, syncVersion: 1 }],
          }),
          getCloudChat: async () => missingImage,
        }),
      ),
    ).rejects.toThrow(
      'image ["attachment","chat",0,0,"missing"]: image bytes are missing',
    )
  })

  it('preserves authentication failures while reading cloud records', async () => {
    const error = new AuthTokenUnavailableError('signed out')

    await expect(
      collectNativeBackupV1(
        dependencies({
          listChats: async () => ({
            items: [{ id: 'chat', syncVersion: 1 }],
          }),
          getCloudChat: async () => {
            throw error
          },
        }),
      ),
    ).rejects.toBe(error)
  })

  it('preflights per-image limits', async () => {
    const oversized = chat({
      messages: [
        {
          role: 'user',
          content: '',
          timestamp: new Date(timestamp),
          attachments: [
            {
              id: 'large',
              type: 'image',
              fileName: 'large.png',
              encryptionKey: 'key',
            },
          ],
        },
      ],
    })

    await expect(
      collectNativeBackupV1(
        dependencies({
          listChats: async () => ({
            items: [{ id: oversized.id, syncVersion: 1 }],
          }),
          getCloudChat: async () => oversized,
          getCloudImage: async () => {
            const bytes = new Uint8Array(NATIVE_BACKUP_LIMITS.imageBytes + 1)
            bytes.set(png)
            return bytes
          },
        }),
      ),
    ).rejects.toThrow('image size limit exceeded')
  })

  it('omits a persistently unreadable cloud chat in a partial V2 collection', async () => {
    const getCloudChat = vi.fn(async () => {
      throw new CloudBackupReadError(
        'item_invalid',
        'chat_payload_invalid',
        true,
      )
    })
    const result = await collectNativeBackupV2(
      dependencies({
        listChats: async () => ({ items: [{ id: 'broken', syncVersion: 1 }] }),
        getCloudChat,
      }),
    )

    expect(result.cloudChats).toEqual([])
    expect(result.omissions).toEqual([
      expect.objectContaining({
        kind: 'cloud_chat',
        source_id: 'broken',
        category: 'invalid',
        reason: 'chat_payload_invalid',
      }),
    ])
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'source_items_omitted', count: 1 }),
    ])
    expect(getCloudChat).toHaveBeenCalledTimes(3)
  })

  it('omits dependent documents and detaches chats from an omitted project', async () => {
    const sourceChat = chat({ projectId: 'project' })
    const result = await collectNativeBackupV2(
      dependencies({
        listChats: async () => ({
          items: [{ id: sourceChat.id, syncVersion: 1 }],
        }),
        getCloudChat: async () => sourceChat,
        listProjects: async () => ({
          items: [
            {
              id: 'project',
              syncVersion: 1,
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          ],
        }),
        getProject: async () => {
          throw new CloudBackupReadError(
            'item_invalid',
            'project_payload_invalid',
            true,
          )
        },
        listDocuments: async () => [
          {
            id: 'document',
            projectId: 'project',
            syncVersion: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      }),
    )

    expect(result.projects).toEqual([])
    expect(result.projectDocuments).toEqual([])
    expect(result.cloudChats[0].projectId).toBeUndefined()
    expect(result.relationships.projectChats).toEqual([])
    expect(result.relationships.projectDocuments).toEqual([])
    expect(result.omissions.map(({ kind }) => kind)).toEqual([
      'project',
      'project_document',
      'relationship',
    ])
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: 'chats_detached_from_omitted_projects',
        count: 1,
      }),
    )
  })

  it('omits an unreadable attachment and removes its dangling reference', async () => {
    const source = chat({
      messages: [
        {
          role: 'user',
          content: 'image',
          timestamp: new Date(timestamp),
          attachments: [
            {
              id: 'broken-image',
              type: 'image',
              fileName: 'broken.png',
              encryptionKey: 'key',
            },
          ],
        },
      ],
    })
    const result = await collectNativeBackupV2(
      dependencies({
        listChats: async () => ({ items: [{ id: source.id, syncVersion: 1 }] }),
        getCloudChat: async () => source,
        getCloudImage: async () => {
          throw new CloudBackupReadError(
            'item_unavailable',
            'attachment_not_found',
            true,
          )
        },
      }),
    )

    expect(result.cloudChats[0].messages[0].attachments).toEqual([])
    expect(result.images).toEqual([])
    expect(result.relationships.chatImages).toEqual([])
    expect(result.omissions[0]).toMatchObject({
      kind: 'attachment',
      parent_source_id: source.id,
      reason: 'attachment_not_found',
    })
    expect(() => formatNativeBackupV1(result)).not.toThrow()
  })

  it('omits an attachment with a missing item key and keeps exporting', async () => {
    const source = chat({
      messages: [
        {
          role: 'user',
          content: 'image',
          timestamp: new Date(timestamp),
          attachments: [
            { id: 'missing-key', type: 'image', fileName: 'missing.png' },
          ],
        },
      ],
    })
    const result = await collectNativeBackupV2(
      dependencies({
        listChats: async () => ({ items: [{ id: source.id, syncVersion: 1 }] }),
        getCloudChat: async () => source,
        getCloudImage: async () => {
          throw new CloudBackupReadError(
            'item_invalid',
            'attachment_key_unavailable',
            true,
          )
        },
      }),
    )

    expect(result.cloudChats).toHaveLength(1)
    expect(result.cloudChats[0].messages[0].attachments).toEqual([])
    expect(result.omissions).toContainEqual(
      expect.objectContaining({
        kind: 'attachment',
        reason: 'attachment_key_unavailable',
      }),
    )
    expect(() => formatNativeBackupV1(result)).not.toThrow()
  })

  it('removes omitted image references using descending original indexes', async () => {
    const source = chat({
      messages: [
        {
          role: 'user',
          content: 'images',
          timestamp: new Date(timestamp),
          attachments: [
            {
              id: 'missing-first',
              type: 'image',
              fileName: 'first.png',
              encryptionKey: 'key',
            },
            {
              id: 'kept-middle',
              type: 'image',
              fileName: 'middle.png',
              encryptionKey: 'key',
            },
            {
              id: 'missing-last',
              type: 'image',
              fileName: 'last.png',
              encryptionKey: 'key',
            },
            {
              id: 'document',
              type: 'document',
              fileName: 'scan.pdf',
              pages: [
                { page: 0, text: '', is_scanned: true, image: '%%%' },
                { page: 1, text: '', is_scanned: true, image: '%%%' },
              ],
            },
          ],
          imageData: [
            { base64: '%%%', mimeType: 'image/png' },
            { base64: pngBase64(), mimeType: 'image/png' },
            { base64: '%%%', mimeType: 'image/png' },
          ],
        },
      ],
    })
    const result = await collectNativeBackupV2(
      dependencies({
        listChats: async () => ({ items: [{ id: source.id, syncVersion: 1 }] }),
        getCloudChat: async () => source,
        getCloudImage: async (attachment) =>
          attachment.id === 'kept-middle' ? png : null,
      }),
    )

    const message = result.cloudChats[0].messages[0]
    expect(message.attachments?.map(({ id }) => id)).toEqual([
      'kept-middle',
      'document',
    ])
    const documentAttachment = message.attachments?.[1]
    expect(documentAttachment?.type).toBe('document')
    if (documentAttachment?.type === 'document')
      expect(documentAttachment.pages).toEqual([
        { page: 0, text: '', is_scanned: true },
        { page: 1, text: '', is_scanned: true },
      ])
    expect(message.imageData).toHaveLength(1)
    expect(result.images).toHaveLength(2)
    expect(() => formatNativeBackupV1(result)).not.toThrow()
  })

  it('keeps unknown runtime failures fatal', async () => {
    const runtimeFailure = new Error('unexpected runtime failure')
    const source = chat()
    Object.defineProperty(source, 'messages', {
      get() {
        throw runtimeFailure
      },
    })

    await expect(
      collectNativeBackupV2(
        dependencies({
          listChats: async () => ({
            items: [{ id: source.id, syncVersion: 1 }],
          }),
          getCloudChat: async () => source,
        }),
      ),
    ).rejects.toBe(runtimeFailure)
  })

  it('retries the whole cloud pass when inventory versions change', async () => {
    const listChats = vi
      .fn()
      .mockResolvedValueOnce({ items: [{ id: 'chat', syncVersion: 1 }] })
      .mockResolvedValueOnce({ items: [{ id: 'chat', syncVersion: 2 }] })
      .mockResolvedValue({ items: [{ id: 'chat', syncVersion: 2 }] })
    const getCloudChat = vi
      .fn()
      .mockResolvedValueOnce(chat({ title: 'V1', syncVersion: 1 }))
      .mockResolvedValueOnce(chat({ title: 'V1', syncVersion: 1 }))
      .mockResolvedValue(chat({ title: 'V2', syncVersion: 2 }))

    const result = await collectNativeBackupV2(
      dependencies({ listChats, getCloudChat }),
    )

    expect(result.cloudChats[0].title).toBe('V2')
    expect(listChats).toHaveBeenCalledTimes(4)
    expect(getCloudChat).toHaveBeenCalledTimes(4)
  })

  it('fails when the whole cloud inventory never converges', async () => {
    let version = 0
    const listChats = vi.fn(async () => ({
      items: [{ id: 'chat', syncVersion: ++version }],
    }))
    const getCloudChat = vi.fn(async () => chat({ syncVersion: version }))

    await expect(
      collectNativeBackupV2(dependencies({ listChats, getCloudChat })),
    ).rejects.toMatchObject({ kind: 'inventory', omittable: false })
    expect(listChats).toHaveBeenCalledTimes(6)
  })

  it('retries local collection when an eligible chat is added', async () => {
    const added = chat({
      id: 'added',
      title: 'Added',
      isLocalOnly: true,
      syncUserId: 'user',
    })
    const getLocalChats = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue([added])

    const result = await collectNativeBackupV2(
      dependencies({
        getLocalChats,
        getLocalChat: async () => added,
      }),
    )

    expect(result.localChats.map(({ id }) => id)).toEqual(['added'])
    expect(result.omissions).toEqual([])
    expect(getLocalChats).toHaveBeenCalledTimes(4)
  })

  it('retries local collection when an eligible chat is removed', async () => {
    const removed = chat({
      id: 'removed',
      isLocalOnly: true,
      syncUserId: 'user',
    })
    const getLocalChats = vi
      .fn()
      .mockResolvedValueOnce([removed])
      .mockResolvedValue([])

    const result = await collectNativeBackupV2(
      dependencies({
        getLocalChats,
        getLocalChat: async () => removed,
      }),
    )

    expect(result.localChats).toEqual([])
    expect(result.omissions).toEqual([])
    expect(getLocalChats).toHaveBeenCalledTimes(4)
  })

  it('retries local collection when eligible chat content changes', async () => {
    const first = chat({
      id: 'changed',
      title: 'First',
      isLocalOnly: true,
      syncUserId: 'user',
    })
    const second = { ...first, title: 'Second' }
    const getLocalChats = vi
      .fn()
      .mockResolvedValueOnce([first])
      .mockResolvedValue([second])
    const getLocalChat = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(first)
      .mockResolvedValue(second)

    const result = await collectNativeBackupV2(
      dependencies({ getLocalChats, getLocalChat }),
    )

    expect(result.localChats[0].title).toBe('Second')
    expect(result.omissions).toEqual([])
  })

  it('marks a coherent local snapshot partial after bounded inventory instability', async () => {
    let inventoryRead = 0
    let current = chat({
      id: 'unstable',
      isLocalOnly: true,
      syncUserId: 'user',
    })
    const getLocalChats = vi.fn(async () => {
      inventoryRead++
      current = chat({
        id: 'unstable',
        title: `Version ${inventoryRead}`,
        isLocalOnly: true,
        syncUserId: 'user',
      })
      return [current]
    })
    const getLocalChat = vi.fn(async () => current)

    const result = await collectNativeBackupV2(
      dependencies({ getLocalChats, getLocalChat }),
    )

    expect(result.localChats).toHaveLength(1)
    expect(result.omissions).toContainEqual({
      kind: 'local_inventory',
      source_id: 'eligible_local_chats',
      category: 'unstable',
      reason: 'inventory_did_not_converge',
    })
    expect(result.warnings).toContainEqual({
      code: 'local_inventory_unstable',
      category: 'source_coverage',
      count: 1,
    })
    expect(getLocalChats).toHaveBeenCalledTimes(6)
    expect(() => formatNativeBackupV2(result)).not.toThrow()
  })

  it('does not omit systemic key, network, or protocol failures', async () => {
    const failures = [
      new CloudBackupReadError(
        'key_unavailable',
        'attachment_key_unavailable',
        false,
      ),
      new SyncEnclaveError('offline', undefined, 'NETWORK'),
      new Error('invalid protocol response'),
    ]
    for (const failure of failures) {
      await expect(
        collectNativeBackupV2(
          dependencies({
            listChats: async () => ({
              items: [{ id: 'chat', syncVersion: 1 }],
            }),
            getCloudChat: async () => {
              throw failure
            },
          }),
        ),
      ).rejects.toBe(failure)
    }
  })
})
