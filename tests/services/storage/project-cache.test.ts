import { projectCache } from '@/services/storage/project-cache'
import type { Project } from '@/types/project'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  saveProjectForUser: vi.fn(),
  deleteAllProjects: vi.fn(),
}))

vi.mock('@/services/storage/indexed-db', () => ({
  indexedDBStorage: {
    getProjectsForUser: vi.fn(),
    replaceProjectsForUser: vi.fn(),
    saveProjectForUser: mocks.saveProjectForUser,
    deleteProjectForUser: vi.fn(),
    deleteAllProjects: mocks.deleteAllProjects,
  },
}))

const project: Project = {
  id: 'project-1',
  name: 'Project',
  description: '',
  systemInstructions: '',
  memory: [],
  createdAt: '2026-08-11T12:00:00.000Z',
  updatedAt: '2026-08-11T12:00:00.000Z',
  syncVersion: 1,
}

describe('projectCache', () => {
  beforeEach(() => {
    mocks.saveProjectForUser.mockReset().mockResolvedValue(undefined)
    mocks.deleteAllProjects.mockReset().mockResolvedValue(undefined)
  })

  it('rejects writes from invalidated account operations', async () => {
    const generation = projectCache.captureGeneration()
    projectCache.invalidate()

    await projectCache.saveProject('user-1', project, generation)

    expect(mocks.saveProjectForUser).not.toHaveBeenCalled()
  })

  it('clears durable project data after invalidating pending writes', async () => {
    const generation = projectCache.captureGeneration()

    await projectCache.clear()
    await projectCache.saveProject('user-1', project, generation)

    expect(mocks.deleteAllProjects).toHaveBeenCalledOnce()
    expect(mocks.saveProjectForUser).not.toHaveBeenCalled()
  })

  it('keeps concurrent point mutations in the same account session', async () => {
    const firstGeneration = projectCache.beginMutation()
    const secondGeneration = projectCache.beginMutation()

    await Promise.all([
      projectCache.saveProject('user-1', project, firstGeneration),
      projectCache.saveProject(
        'user-1',
        { ...project, id: 'project-2' },
        secondGeneration,
      ),
    ])

    expect(mocks.saveProjectForUser).toHaveBeenCalledTimes(2)
  })
})
