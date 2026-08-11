import { projectStorage } from '@/services/cloud/project-storage'
import { ENCRYPTION_KEY_CHANGED_EVENT } from '@/services/encryption/encryption-service'
import {
  PROJECT_CACHE_UPDATED_EVENT,
  projectCache,
} from '@/services/storage/project-cache'
import type { Project, ProjectListResponse } from '@/types/project'
import { logError, logInfo } from '@/utils/error-handling'
import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useRef, useState } from 'react'

const PROJECT_PAGE_LIMIT = 20

interface UseProjectsOptions {
  autoLoad?: boolean
}

interface UseProjectsReturn {
  projects: Project[]
  loading: boolean
  error: string | null
  hasMore: boolean
  loadProjects: () => Promise<void>
  loadMore: () => Promise<void>
  refresh: () => Promise<void>
}

type ProjectListItem = ProjectListResponse['projects'][number]

const refreshByUser = new Map<
  string,
  { generation: number; promise: Promise<Project[]> }
>()

function projectFromListItem(
  item: ProjectListItem,
  full: Project | undefined,
): Project {
  if (!full) {
    return {
      id: item.id,
      name: 'Encrypted',
      description: '',
      systemInstructions: '',
      memory: [],
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      syncVersion: item.syncVersion,
      decryptionFailed: true,
    }
  }
  return {
    ...full,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    syncVersion: item.syncVersion,
  }
}

async function loadProjectPage(
  continuationToken?: string,
): Promise<{ response: ProjectListResponse; projects: Project[] }> {
  const response = await projectStorage.listProjects({
    limit: PROJECT_PAGE_LIMIT,
    continuationToken,
  })
  const decryptedById = await projectStorage.getProjects(
    response.projects.map((item) => item.id),
  )
  return {
    response,
    projects: response.projects.map((item) =>
      projectFromListItem(item, decryptedById.get(item.id)),
    ),
  }
}

async function fetchAllProjects(): Promise<Project[]> {
  const projects: Project[] = []
  let continuationToken: string | undefined

  do {
    const page = await loadProjectPage(continuationToken)
    projects.push(...page.projects)
    continuationToken = page.response.nextContinuationToken
  } while (continuationToken)

  return projects
}

function revalidateProjects(userId: string): Promise<Project[]> {
  const cacheGeneration = projectCache.captureGeneration()
  const refreshGeneration = projectCache.captureRefreshGeneration()
  const existing = refreshByUser.get(userId)
  if (existing?.generation === refreshGeneration) return existing.promise

  const refresh = fetchAllProjects()
    .then(async (projects) => {
      if (!projectCache.isCurrentRefreshGeneration(refreshGeneration)) {
        return projectCache.getProjects(userId)
      }
      try {
        await projectCache.replaceProjects(userId, projects, cacheGeneration)
      } catch (error) {
        logError('Failed to cache projects', error, {
          component: 'useProjects',
          action: 'cacheProjects',
        })
      }
      return projects
    })
    .finally(() => {
      if (refreshByUser.get(userId)?.promise === refresh) {
        refreshByUser.delete(userId)
      }
    })
  refreshByUser.set(userId, { generation: refreshGeneration, promise: refresh })
  return refresh
}

export function useProjects(
  options: UseProjectsOptions = {},
): UseProjectsReturn {
  const { autoLoad = true } = options
  const { isSignedIn, userId } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const initializedUserRef = useRef<string | null>(null)
  const currentUserRef = useRef(userId)

  useEffect(() => {
    currentUserRef.current = userId
  }, [userId])

  const loadProjects = useCallback(async () => {
    if (!isSignedIn || !userId) {
      setProjects([])
      return
    }

    const requestUserId = userId
    setLoading(projects.length === 0)
    setError(null)
    let remoteApplied = false

    void projectCache
      .getProjects(requestUserId)
      .then((cachedProjects) => {
        if (currentUserRef.current !== requestUserId || remoteApplied) return

        setProjects(cachedProjects)
        if (cachedProjects.length > 0) setLoading(false)
      })
      .catch((cacheError) => {
        logError('Failed to load cached projects', cacheError, {
          component: 'useProjects',
          action: 'loadCachedProjects',
        })
      })

    try {
      const remoteProjects = await revalidateProjects(requestUserId)
      if (currentUserRef.current !== requestUserId) return

      remoteApplied = true
      setProjects(remoteProjects)
      logInfo('Loaded projects', {
        component: 'useProjects',
        action: 'loadProjects',
        metadata: { count: remoteProjects.length },
      })
    } catch (err) {
      if (currentUserRef.current !== requestUserId) return

      const message =
        err instanceof Error ? err.message : 'Failed to load projects'
      setError(message)
      logError('Failed to load projects', err, {
        component: 'useProjects',
        action: 'loadProjects',
      })
    } finally {
      if (currentUserRef.current === requestUserId) setLoading(false)
    }
  }, [isSignedIn, userId, projects.length])

  const refresh = useCallback(() => loadProjects(), [loadProjects])
  const loadMore = useCallback(async () => {}, [])

  useEffect(() => {
    if (
      autoLoad &&
      isSignedIn &&
      userId &&
      initializedUserRef.current !== userId
    ) {
      initializedUserRef.current = userId
      void loadProjects()
    }
  }, [autoLoad, isSignedIn, userId, loadProjects])

  useEffect(() => {
    if (!isSignedIn || !userId) {
      initializedUserRef.current = null
      setProjects([])
      setLoading(false)
      return
    }

    const handleCacheUpdate = (event: Event) => {
      const updatedUserId = (event as CustomEvent<{ userId?: string }>).detail
        .userId
      if (updatedUserId && updatedUserId !== userId) return
      if (!updatedUserId) setProjects([])

      void projectCache.getProjects(userId).then((cachedProjects) => {
        if (currentUserRef.current === userId) setProjects(cachedProjects)
      })
    }

    window.addEventListener(PROJECT_CACHE_UPDATED_EVENT, handleCacheUpdate)
    return () =>
      window.removeEventListener(PROJECT_CACHE_UPDATED_EVENT, handleCacheUpdate)
  }, [isSignedIn, userId])

  useEffect(() => {
    const handleKeyChange = () => {
      if (projects.some((project) => project.decryptionFailed) && isSignedIn) {
        logInfo('Encryption key changed, refreshing projects', {
          component: 'useProjects',
          action: 'encryptionKeyChanged',
        })
        void refresh()
      }
    }

    window.addEventListener(ENCRYPTION_KEY_CHANGED_EVENT, handleKeyChange)
    return () => {
      window.removeEventListener(ENCRYPTION_KEY_CHANGED_EVENT, handleKeyChange)
    }
  }, [projects, isSignedIn, refresh])

  return {
    projects,
    loading,
    error,
    hasMore: false,
    loadProjects,
    loadMore,
    refresh,
  }
}
