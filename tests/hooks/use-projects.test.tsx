import { useProjects } from '@/hooks/use-projects'
import type { Project, ProjectListResponse } from '@/types/project'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: { isSignedIn: true, userId: 'cached-project-user' },
  getCachedProjects: vi.fn(),
  replaceProjects: vi.fn(),
  listProjects: vi.fn(),
  getRemoteProjects: vi.fn(),
}))

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => mocks.auth,
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
    mocks.auth.isSignedIn = true
    mocks.auth.userId = 'cached-project-user'
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

  it('hides the previous account projects immediately on user change', async () => {
    let resolveRemotePage!: (value: {
      projects: ProjectListResponse['projects']
      hasMore: boolean
    }) => void
    mocks.auth.userId = 'first-project-user'
    mocks.listProjects.mockReturnValue(
      new Promise((resolve) => {
        resolveRemotePage = resolve
      }),
    )
    const { result, rerender } = renderHook(() => useProjects())
    await waitFor(() =>
      expect(result.current.projects).toEqual([cachedProject]),
    )

    mocks.auth.userId = 'second-project-user'
    mocks.getCachedProjects.mockReturnValue(new Promise(() => {}))
    mocks.listProjects.mockReturnValue(new Promise(() => {}))
    rerender()

    expect(result.current.projects).toEqual([])
    expect(result.current.loading).toBe(true)
    const previousUserProject = {
      ...cachedProject,
      id: 'previous-user-project',
    }
    mocks.getRemoteProjects.mockResolvedValue(
      new Map([[previousUserProject.id, previousUserProject]]),
    )
    await act(async () => {
      resolveRemotePage({
        projects: [
          {
            id: previousUserProject.id,
            key: previousUserProject.id,
            createdAt: previousUserProject.createdAt,
            updatedAt: previousUserProject.updatedAt,
            syncVersion: previousUserProject.syncVersion,
            size: 0,
          },
        ],
        hasMore: false,
      })
    })
    await waitFor(() => expect(result.current.projects).toEqual([]))
  })

  it('settles loading when cache and remote reads fail', async () => {
    mocks.auth.userId = 'failed-project-user'
    mocks.getCachedProjects.mockRejectedValue(new Error('Cache unavailable'))
    mocks.listProjects.mockRejectedValue(new Error('Remote unavailable'))

    const { result } = renderHook(() => useProjects())

    await waitFor(() => expect(result.current.error).toBe('Remote unavailable'))
    expect(result.current.loading).toBe(false)
    expect(result.current.projects).toEqual([])
  })
})
