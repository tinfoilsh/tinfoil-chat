import { useProjects } from '@/hooks/use-projects'
import type { Project } from '@/types/project'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCachedProjects: vi.fn(),
  replaceProjects: vi.fn(),
  listProjects: vi.fn(),
  getRemoteProjects: vi.fn(),
}))

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isSignedIn: true, userId: 'cached-project-user' }),
}))

vi.mock('@/services/storage/project-cache', () => ({
  PROJECT_CACHE_UPDATED_EVENT: 'projectCacheUpdated',
  projectCache: {
    captureGeneration: () => 0,
    captureRefreshGeneration: () => 0,
    isCurrentRefreshGeneration: () => true,
    getProjects: mocks.getCachedProjects,
    replaceProjects: mocks.replaceProjects,
  },
}))

vi.mock('@/services/cloud/project-storage', () => ({
  projectStorage: {
    listProjects: mocks.listProjects,
    getProjects: mocks.getRemoteProjects,
  },
}))

const cachedProject: Project = {
  id: 'project-1',
  name: 'Cached project',
  description: '',
  systemInstructions: '',
  memory: [],
  createdAt: '2026-08-10T12:00:00.000Z',
  updatedAt: '2026-08-10T12:00:00.000Z',
  syncVersion: 1,
}

describe('useProjects', () => {
  beforeEach(() => {
    mocks.getCachedProjects.mockReset().mockResolvedValue([cachedProject])
    mocks.replaceProjects.mockReset().mockResolvedValue(undefined)
    mocks.listProjects.mockReset()
    mocks.getRemoteProjects.mockReset()
  })

  it('renders cached projects while revalidating in the background', async () => {
    let resolveRemotePage!: (value: {
      projects: Array<{
        id: string
        key: string
        createdAt: string
        updatedAt: string
        syncVersion: number
        size: number
      }>
      hasMore: boolean
    }) => void
    mocks.listProjects.mockReturnValue(
      new Promise((resolve) => {
        resolveRemotePage = resolve
      }),
    )

    const { result } = renderHook(() => useProjects())

    await waitFor(() => {
      expect(result.current.projects).toEqual([cachedProject])
      expect(result.current.loading).toBe(false)
    })

    const refreshedProject = { ...cachedProject, name: 'Refreshed project' }
    mocks.getRemoteProjects.mockResolvedValue(
      new Map([[refreshedProject.id, refreshedProject]]),
    )
    await act(async () => {
      resolveRemotePage({
        projects: [
          {
            id: refreshedProject.id,
            key: refreshedProject.id,
            createdAt: refreshedProject.createdAt,
            updatedAt: refreshedProject.updatedAt,
            syncVersion: refreshedProject.syncVersion,
            size: 0,
          },
        ],
        hasMore: false,
      })
    })

    await waitFor(() =>
      expect(result.current.projects[0]?.name).toBe('Refreshed project'),
    )
    expect(mocks.replaceProjects).toHaveBeenCalledWith(
      'cached-project-user',
      [refreshedProject],
      0,
    )
  })
})
