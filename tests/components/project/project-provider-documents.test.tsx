import { useProject } from '@/components/project/project-context'
import { ProjectProvider } from '@/components/project/project-provider'
import type { Project, ProjectDocument } from '@/types/project'
import { act, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  listDocuments: vi.fn(),
  getDocuments: vi.fn(),
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
  loadMemory: vi.fn(),
  processMessages: vi.fn(),
}))

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isSignedIn: true }),
}))

vi.mock('@/hooks/use-memory', () => ({
  useMemory: () => ({
    loadMemory: mocks.loadMemory,
    processMessages: mocks.processMessages,
  }),
}))

vi.mock('@/services/project/project-events', () => ({
  projectEvents: { on: vi.fn(() => vi.fn()) },
}))

vi.mock('@/services/cloud/project-storage', () => ({
  projectStorage: {
    getProject: mocks.getProject,
    listDocuments: mocks.listDocuments,
    getDocuments: mocks.getDocuments,
    uploadDocument: mocks.uploadDocument,
    deleteDocument: mocks.deleteDocument,
  },
}))

vi.mock('@/utils/error-handling', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}))

const project: Project = {
  id: 'project-1',
  name: 'Research',
  description: '',
  systemInstructions: '',
  memory: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  syncVersion: 1,
}

const listedDocument = {
  id: 'doc-1',
  projectId: project.id,
  sizeBytes: 0,
  syncVersion: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const persistedDocument: ProjectDocument = {
  ...listedDocument,
  filename: 'notes.pdf',
  contentType: 'application/pdf',
  sizeBytes: 2048,
  content: 'Project notes',
}

const testFile = new File(['Project notes'], 'notes.pdf', {
  type: 'application/pdf',
})

function wrapper({ children }: PropsWithChildren) {
  return <ProjectProvider>{children}</ProjectProvider>
}

async function renderInProject() {
  const rendered = renderHook(() => useProject(), { wrapper })
  await act(async () => {
    await rendered.result.current.enterProjectMode(project.id)
  })
  return rendered
}

describe('ProjectProvider documents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getProject.mockResolvedValue(project)
    mocks.listDocuments.mockResolvedValue({ documents: [listedDocument] })
    mocks.getDocuments.mockResolvedValue(
      new Map([['doc-1', persistedDocument]]),
    )
  })

  it('keeps decoded document sizes after a refresh', async () => {
    const { result } = await renderInProject()
    await act(async () => {
      await result.current.refreshDocuments()
    })

    expect(result.current.projectDocuments[0].sizeBytes).toBe(2048)
  })

  it('does not let a stale refresh remove a completed upload', async () => {
    mocks.listDocuments.mockResolvedValueOnce({ documents: [] })
    mocks.getDocuments.mockResolvedValueOnce(new Map())
    const { result } = await renderInProject()

    let resolveRefresh!: (documents: Map<string, ProjectDocument>) => void
    mocks.listDocuments.mockResolvedValueOnce({ documents: [] })
    mocks.getDocuments.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefresh = resolve
      }),
    )

    let refreshPromise!: Promise<void>
    act(() => {
      refreshPromise = result.current.refreshDocuments()
    })
    await vi.waitFor(() => expect(mocks.getDocuments).toHaveBeenCalledTimes(2))

    const uploadedDocument = {
      ...persistedDocument,
      id: 'doc-uploaded',
    }
    mocks.uploadDocument.mockResolvedValue(uploadedDocument)
    await act(async () => {
      await result.current.uploadDocument(testFile, 'Project notes')
    })

    await act(async () => {
      resolveRefresh(new Map())
      await refreshPromise
    })

    expect(result.current.projectDocuments).toContainEqual(uploadedDocument)
  })

  it('discards a refresh that snapshots while an upload is pending', async () => {
    mocks.listDocuments.mockResolvedValueOnce({ documents: [] })
    mocks.getDocuments.mockResolvedValueOnce(new Map())
    const { result } = await renderInProject()

    let resolveUpload!: (document: ProjectDocument) => void
    mocks.uploadDocument.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUpload = resolve
      }),
    )
    let uploadPromise!: Promise<ProjectDocument>
    act(() => {
      uploadPromise = result.current.uploadDocument(testFile, 'Project notes')
    })

    let resolveRefresh!: (documents: Map<string, ProjectDocument>) => void
    mocks.listDocuments.mockResolvedValueOnce({ documents: [] })
    mocks.getDocuments.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefresh = resolve
      }),
    )
    let refreshPromise!: Promise<void>
    act(() => {
      refreshPromise = result.current.refreshDocuments()
    })
    await vi.waitFor(() => expect(mocks.getDocuments).toHaveBeenCalledTimes(2))

    const uploadedDocument = {
      ...persistedDocument,
      id: 'doc-uploaded',
    }
    await act(async () => {
      resolveUpload(uploadedDocument)
      await uploadPromise
    })
    await act(async () => {
      resolveRefresh(new Map())
      await refreshPromise
    })

    expect(result.current.projectDocuments).toContainEqual(uploadedDocument)
  })

  it('does not let a stale refresh restore a deleted document', async () => {
    const { result } = await renderInProject()

    let resolveDelete!: () => void
    mocks.deleteDocument.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveDelete = resolve
      }),
    )
    let deletePromise!: Promise<void>
    act(() => {
      deletePromise = result.current.removeDocument(persistedDocument.id)
    })

    let resolveRefresh!: (documents: Map<string, ProjectDocument>) => void
    mocks.listDocuments.mockResolvedValueOnce({ documents: [listedDocument] })
    mocks.getDocuments.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefresh = resolve
      }),
    )
    let refreshPromise!: Promise<void>
    act(() => {
      refreshPromise = result.current.refreshDocuments()
    })
    await vi.waitFor(() => expect(mocks.getDocuments).toHaveBeenCalledTimes(2))

    await act(async () => {
      resolveDelete()
      await deletePromise
    })
    await act(async () => {
      resolveRefresh(new Map([['doc-1', persistedDocument]]))
      await refreshPromise
    })

    expect(result.current.projectDocuments).toEqual([])
  })

  it('does not duplicate a document when deletion rollback follows a refresh', async () => {
    const { result } = await renderInProject()

    let rejectDelete!: (error: Error) => void
    mocks.deleteDocument.mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => {
        rejectDelete = reject
      }),
    )
    let deletePromise!: Promise<void>
    act(() => {
      deletePromise = result.current.removeDocument(persistedDocument.id)
    })

    await act(async () => {
      await result.current.refreshDocuments()
    })
    await act(async () => {
      rejectDelete(new Error('Delete failed'))
      await expect(deletePromise).rejects.toThrow('Delete failed')
    })

    expect(result.current.projectDocuments).toHaveLength(1)
    expect(result.current.projectDocuments[0]).toMatchObject(persistedDocument)
  })

  it('restores the committed project after a superseding switch fails', async () => {
    const { result } = await renderInProject()
    let resolvePendingSwitch!: (project: Project) => void
    mocks.getProject
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePendingSwitch = resolve
        }),
      )
      .mockResolvedValueOnce(null)

    let pendingSwitch!: Promise<boolean>
    act(() => {
      pendingSwitch = result.current.enterProjectMode('project-b')
    })
    await act(async () => {
      await expect(result.current.enterProjectMode('project-d')).resolves.toBe(
        false,
      )
    })

    const uploadedDocument = {
      ...persistedDocument,
      id: 'doc-after-failed-switch',
    }
    mocks.uploadDocument.mockResolvedValue(uploadedDocument)
    await act(async () => {
      await result.current.uploadDocument(testFile, 'Project notes')
    })

    await act(async () => {
      resolvePendingSwitch({ ...project, id: 'project-b' })
      await expect(pendingSwitch).resolves.toBe(false)
    })

    expect(result.current.activeProject?.id).toBe(project.id)
    expect(result.current.projectDocuments).toContainEqual(uploadedDocument)
  })
})
