import { projectStorage } from '@/services/cloud/project-storage'
import { encryptionService } from '@/services/encryption/encryption-service'
import type { Project, ProjectData } from '@/types/project'
import { logError, logInfo } from '@/utils/error-handling'
import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useRef, useState } from 'react'

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

export function useProjects(
  options: UseProjectsOptions = {},
): UseProjectsReturn {
  const { autoLoad = true } = options
  const { getToken, isSignedIn } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [continuationToken, setContinuationToken] = useState<
    string | undefined
  >()
  const initializedRef = useRef(false)

  useEffect(() => {
    if (isSignedIn && getToken) {
      projectStorage.setTokenGetter(getToken)
    }
  }, [isSignedIn, getToken])

  const loadProjects = useCallback(async () => {
    if (!isSignedIn) {
      setProjects([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await projectStorage.listProjects({
        limit: 20,
        includeContent: true,
      })

      await encryptionService.initialize()

      const decryptedProjects: Project[] = await Promise.all(
        response.projects.map(async (item) => {
          try {
            if (item.content) {
              const decrypted = (await encryptionService.decrypt(
                JSON.parse(item.content),
              )) as ProjectData
              return {
                id: item.id,
                name: decrypted.name,
                description: decrypted.description,
                systemInstructions: decrypted.systemInstructions,
                summary: decrypted.summary,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
                syncVersion: item.syncVersion,
              }
            }
            return {
              id: item.id,
              name: 'Encrypted',
              description: '',
              systemInstructions: '',
              summary: '',
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
              syncVersion: item.syncVersion,
            }
          } catch (decryptError) {
            logError('Failed to decrypt project', decryptError, {
              component: 'useProjects',
              action: 'loadProjects',
              metadata: { projectId: item.id },
            })
            return {
              id: item.id,
              name: 'Encrypted',
              description: '',
              systemInstructions: '',
              summary: '',
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
              syncVersion: item.syncVersion,
              decryptionFailed: true,
            }
          }
        }),
      )

      setProjects(decryptedProjects)
      setHasMore(response.hasMore)
      setContinuationToken(response.nextContinuationToken)

      logInfo('Loaded projects', {
        component: 'useProjects',
        action: 'loadProjects',
        metadata: {
          count: decryptedProjects.length,
          hasMore: response.hasMore,
        },
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load projects'
      setError(message)
      logError('Failed to load projects', err, {
        component: 'useProjects',
        action: 'loadProjects',
      })
    } finally {
      setLoading(false)
    }
  }, [isSignedIn])

  const loadMore = useCallback(async () => {
    if (!isSignedIn || !hasMore || loading || !continuationToken) return

    setLoading(true)
    setError(null)

    try {
      const response = await projectStorage.listProjects({
        limit: 20,
        continuationToken,
        includeContent: true,
      })

      await encryptionService.initialize()

      const decryptedProjects: Project[] = await Promise.all(
        response.projects.map(async (item) => {
          try {
            if (item.content) {
              const decrypted = (await encryptionService.decrypt(
                JSON.parse(item.content),
              )) as ProjectData
              return {
                id: item.id,
                name: decrypted.name,
                description: decrypted.description,
                systemInstructions: decrypted.systemInstructions,
                summary: decrypted.summary,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
                syncVersion: item.syncVersion,
              }
            }
            return {
              id: item.id,
              name: 'Encrypted',
              description: '',
              systemInstructions: '',
              summary: '',
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
              syncVersion: item.syncVersion,
            }
          } catch (decryptError) {
            logError('Failed to decrypt project', decryptError, {
              component: 'useProjects',
              action: 'loadMore',
              metadata: { projectId: item.id },
            })
            return {
              id: item.id,
              name: 'Encrypted',
              description: '',
              systemInstructions: '',
              summary: '',
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
              syncVersion: item.syncVersion,
              decryptionFailed: true,
            }
          }
        }),
      )

      setProjects((prev) => [...prev, ...decryptedProjects])
      setHasMore(response.hasMore)
      setContinuationToken(response.nextContinuationToken)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load more projects'
      setError(message)
      logError('Failed to load more projects', err, {
        component: 'useProjects',
        action: 'loadMore',
      })
    } finally {
      setLoading(false)
    }
  }, [isSignedIn, hasMore, loading, continuationToken])

  const refresh = useCallback(async () => {
    setContinuationToken(undefined)
    await loadProjects()
  }, [loadProjects])

  useEffect(() => {
    if (autoLoad && isSignedIn && !initializedRef.current) {
      initializedRef.current = true
      loadProjects()
    }
  }, [autoLoad, isSignedIn, loadProjects])

  useEffect(() => {
    if (!isSignedIn) {
      initializedRef.current = false
      setProjects([])
      setContinuationToken(undefined)
      setHasMore(false)
    }
  }, [isSignedIn])

  // Listen for encryption key changes to retry decryption
  useEffect(() => {
    const handleKeyChange = () => {
      // Only refresh if we have projects that failed decryption
      const hasFailedDecryption = projects.some((p) => p.decryptionFailed)
      if (hasFailedDecryption && isSignedIn) {
        logInfo('Encryption key changed, refreshing projects', {
          component: 'useProjects',
          action: 'encryptionKeyChanged',
        })
        refresh()
      }
    }

    window.addEventListener('encryptionKeyChanged', handleKeyChange)
    return () => {
      window.removeEventListener('encryptionKeyChanged', handleKeyChange)
    }
  }, [projects, isSignedIn, refresh])

  return {
    projects,
    loading,
    error,
    hasMore,
    loadProjects,
    loadMore,
    refresh,
  }
}
