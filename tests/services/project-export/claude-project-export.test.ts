import {
  buildClaudeProjectExport,
  ClaudeProjectExportSizeError,
} from '@/services/project-export/claude-project-export'
import type {
  Project,
  ProjectDocument,
  ProjectListResponse,
} from '@/types/project'
import claudeProjectsFixture from '../../fixtures/claude-projects.json'

type ExportStorage = Parameters<typeof buildClaudeProjectExport>[0]

const createdAt = '2026-01-02T03:04:05.000Z'
const updatedAt = '2026-02-03T04:05:06.000Z'

function listItem(id: string): ProjectListResponse['projects'][number] {
  return {
    id,
    key: id,
    createdAt,
    updatedAt,
    syncVersion: 1,
    size: 0,
  }
}

function project(id: string): Project {
  return {
    id,
    name: id === 'project-1' ? 'Research' : id,
    description: id === 'project-1' ? 'Source notes' : '',
    systemInstructions:
      id === 'project-1' ? 'Answer from the provided material.' : '',
    memory: [
      {
        id: 'fact-1',
        fact: 'unsupported',
        date: createdAt,
        category: 'test',
        confidence: 1,
      },
    ],
    color: '#ffffff',
    createdAt: 'ignored',
    updatedAt: 'ignored',
    syncVersion: 1,
  }
}

function storage(overrides: Partial<ExportStorage> = {}): ExportStorage {
  return {
    listProjects: vi.fn().mockResolvedValue({
      projects: [listItem('project-1')],
      hasMore: false,
    }),
    getProject: vi.fn().mockImplementation(async (id: string) => project(id)),
    listDocuments: vi.fn().mockResolvedValue({ documents: [] }),
    getDocument: vi.fn(),
    ...overrides,
  } as ExportStorage
}

describe('buildClaudeProjectExport', () => {
  it('paginates a fresh project listing before reading projects', async () => {
    const calls: string[] = []
    const testStorage = storage({
      listProjects: vi
        .fn()
        .mockImplementationOnce(async () => {
          calls.push('list-1')
          return {
            projects: [listItem('project-1')],
            hasMore: true,
            nextContinuationToken: 'next',
          }
        })
        .mockImplementationOnce(async () => {
          calls.push('list-2')
          return {
            projects: [listItem('project-2')],
            hasMore: false,
          }
        }),
      getProject: vi.fn().mockImplementation(async (id: string) => {
        calls.push(`get-${id}`)
        return project(id)
      }),
    })

    const result = await buildClaudeProjectExport(testStorage)

    expect(JSON.parse(result.json)).toHaveLength(2)
    expect(calls).toEqual([
      'list-1',
      'list-2',
      'get-project-1',
      'get-project-2',
    ])
  })

  it('matches the Claude projects fixture without unsupported fields', async () => {
    const testStorage = storage({
      listDocuments: vi.fn().mockResolvedValue({
        documents: [
          {
            id: 'document-1',
            projectId: 'project-1',
            sizeBytes: 123,
            syncVersion: 1,
            createdAt: '2026-01-03T03:04:05.000Z',
            updatedAt,
          },
        ],
      }),
      getDocument: vi.fn().mockResolvedValue({
        id: 'document-1',
        projectId: 'project-1',
        filename: 'notes.txt',
        contentType: 'text/plain',
        sizeBytes: 123,
        syncVersion: 1,
        createdAt,
        updatedAt,
        content: 'Extracted text only',
      } satisfies ProjectDocument),
    })

    const result = await buildClaudeProjectExport(testStorage)

    expect(JSON.parse(result.json)).toEqual(claudeProjectsFixture)
    expect(result.counts).toEqual({
      exportedProjects: 1,
      skippedProjects: 0,
      exportedDocuments: 1,
      skippedDocuments: 0,
    })
    expect(result.json).not.toContain('memory')
    expect(result.json).not.toContain('color')
    expect(result.json).not.toContain('contentType')
    expect(result.json).not.toContain('sizeBytes')
  })

  it('aborts when any project-list page fails', async () => {
    const getProject = vi.fn()
    const testStorage = storage({
      listProjects: vi
        .fn()
        .mockResolvedValueOnce({
          projects: [listItem('project-1')],
          hasMore: true,
          nextContinuationToken: 'next',
        })
        .mockRejectedValueOnce(new Error('unavailable')),
      getProject,
    })

    await expect(buildClaudeProjectExport(testStorage)).rejects.toThrow(
      'unavailable',
    )
    expect(getProject).not.toHaveBeenCalled()
  })

  it('returns counts and warnings for project and document failures', async () => {
    const testStorage = storage({
      listProjects: vi.fn().mockResolvedValue({
        projects: [
          listItem('missing'),
          listItem('docs-unavailable'),
          listItem('partial'),
        ],
        hasMore: false,
      }),
      getProject: vi
        .fn()
        .mockImplementation(async (id: string) =>
          id === 'missing' ? null : project(id),
        ),
      listDocuments: vi.fn().mockImplementation(async (id: string) => {
        if (id === 'docs-unavailable') throw new Error('unavailable')
        return {
          documents: ['good', 'bad'].map((documentId) => ({
            ...listItem(documentId),
            projectId: id,
            sizeBytes: 1,
          })),
        }
      }),
      getDocument: vi.fn().mockImplementation(async (_projectId, id) => {
        if (id === 'bad') throw new Error('unavailable')
        return {
          id,
          projectId: 'partial',
          filename: 'good.txt',
          contentType: 'text/plain',
          sizeBytes: 1,
          syncVersion: 1,
          createdAt,
          updatedAt,
          content: 'text',
        }
      }),
    })

    const result = await buildClaudeProjectExport(testStorage)

    expect(result.counts).toEqual({
      exportedProjects: 2,
      skippedProjects: 1,
      exportedDocuments: 1,
      skippedDocuments: 1,
    })
    expect(result.warnings).toHaveLength(3)
    expect(JSON.parse(result.json)).toHaveLength(2)
  })

  it('never reads more than four documents concurrently', async () => {
    let active = 0
    let maximumActive = 0
    const documents = Array.from({ length: 10 }, (_, index) => ({
      ...listItem(`document-${index}`),
      projectId: 'project-1',
      sizeBytes: 1,
    }))
    const testStorage = storage({
      listDocuments: vi.fn().mockResolvedValue({ documents }),
      getDocument: vi.fn().mockImplementation(async (_projectId, id) => {
        active++
        maximumActive = Math.max(maximumActive, active)
        await new Promise<void>((resolve) => queueMicrotask(resolve))
        active--
        return {
          id,
          projectId: 'project-1',
          filename: `${id}.txt`,
          contentType: 'text/plain',
          sizeBytes: 1,
          syncVersion: 1,
          createdAt,
          updatedAt,
          content: 'text',
        }
      }),
    })

    await buildClaudeProjectExport(testStorage)

    expect(maximumActive).toBe(4)
  })

  it('rejects encoded JSON over the configured bound', async () => {
    await expect(
      buildClaudeProjectExport(storage(), { maxEncodedBytes: 10 }),
    ).rejects.toBeInstanceOf(ClaudeProjectExportSizeError)
  })
})
