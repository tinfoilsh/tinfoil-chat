import { buildClaudeProjectExport } from '@/services/backup/claude-project-export'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  getProjects: vi.fn(),
  listDocuments: vi.fn(),
  getDocuments: vi.fn(),
}))

vi.mock('@/services/cloud/project-storage', () => ({
  projectStorage: mocks,
}))

const timestamp = '2026-08-18T12:00:00.000Z'

describe('Claude project compatibility export', () => {
  beforeEach(() => vi.clearAllMocks())

  it('freshly paginates and reports unreadable rows without placeholders', async () => {
    mocks.listProjects
      .mockResolvedValueOnce({
        projects: [
          {
            id: 'p1',
            createdAt: timestamp,
            updatedAt: timestamp,
            syncVersion: 1,
          },
        ],
        nextContinuationToken: 'page-2',
      })
      .mockResolvedValueOnce({
        projects: [
          {
            id: 'p2',
            createdAt: timestamp,
            updatedAt: timestamp,
            syncVersion: 1,
          },
        ],
      })
    mocks.getProjects.mockResolvedValue(
      new Map([
        [
          'p1',
          {
            id: 'p1',
            name: 'Readable',
            description: '',
            systemInstructions: '',
            color: '#fff',
            memory: [{ fact: 'not represented by Claude' }],
            syncVersion: 1,
          },
        ],
      ]),
    )
    mocks.listDocuments.mockResolvedValue({
      documents: [
        {
          id: 'd1',
          projectId: 'p1',
          createdAt: timestamp,
          updatedAt: timestamp,
          syncVersion: 1,
        },
        {
          id: 'd2',
          projectId: 'p1',
          createdAt: timestamp,
          updatedAt: timestamp,
          syncVersion: 1,
        },
      ],
    })
    mocks.getDocuments.mockResolvedValue(
      new Map([
        [
          'd1',
          { id: 'd1', filename: 'notes.txt', content: 'authoritative text' },
        ],
        ['d2', { id: 'd2', decryptionFailed: true }],
      ]),
    )

    const result = await buildClaudeProjectExport()

    expect(mocks.listProjects).toHaveBeenCalledTimes(2)
    expect(mocks.listProjects).toHaveBeenNthCalledWith(2, {
      limit: 100,
      continuationToken: 'page-2',
    })
    expect(result.projects).toEqual([
      expect.objectContaining({
        uuid: 'p1',
        created_at: timestamp,
        updated_at: timestamp,
        docs: [
          expect.objectContaining({
            uuid: 'd1',
            content: 'authoritative text',
            created_at: timestamp,
          }),
        ],
      }),
    ])
    expect(result.skippedProjects).toBe(1)
    expect(result.skippedDocuments).toBe(1)
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        {
          projectId: 'p2',
          message: 'Project could not be read consistently.',
        },
        {
          projectId: 'p1',
          documentId: 'd2',
          message: 'Project document could not be decrypted.',
        },
      ]),
    )
    expect(JSON.stringify(result.projects)).not.toContain('Encrypted')
  })

  it('omits a project whose metadata changed during export', async () => {
    mocks.listProjects.mockResolvedValue({
      projects: [
        {
          id: 'p1',
          createdAt: timestamp,
          updatedAt: timestamp,
          syncVersion: 1,
        },
      ],
    })
    mocks.getProjects.mockResolvedValue(
      new Map([
        [
          'p1',
          {
            id: 'p1',
            name: 'Changed',
            description: '',
            systemInstructions: '',
            syncVersion: 2,
          },
        ],
      ]),
    )

    const result = await buildClaudeProjectExport()

    expect(result.projects).toEqual([])
    expect(result.skippedProjects).toBe(1)
    expect(mocks.listDocuments).not.toHaveBeenCalled()
  })
})
