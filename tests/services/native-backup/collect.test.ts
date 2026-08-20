import type { Attachment } from '@/components/chat/types'
import { AuthTokenUnavailableError } from '@/services/auth'
import {
  NATIVE_BACKUP_LIMITS,
  NativeBackupCollectionError,
  collectNativeBackupV1,
  type NativeBackupCollectionDependencies,
} from '@/services/native-backup'
import type { StoredChat } from '@/services/storage/indexed-db'
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
    expect(getStable).toHaveBeenCalledTimes(3)

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
    expect(listProjects).toHaveBeenCalledTimes(2)
  })

  it('deduplicates mutable paginated rows at their latest versions', async () => {
    const listChats = vi
      .fn()
      .mockResolvedValueOnce({
        items: [{ id: 'chat', syncVersion: 1 }],
        next: 'next',
      })
      .mockResolvedValueOnce({ items: [{ id: 'chat', syncVersion: 2 }] })
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
    expect(listDocuments).toHaveBeenCalledTimes(1)
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
})
