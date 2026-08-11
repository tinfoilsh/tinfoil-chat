import { PAGINATION } from '@/config'
import { cloudSync } from '@/services/cloud/cloud-sync'
import { isCloudSyncEnabled } from '@/utils/cloud-sync-settings'
import { logError } from '@/utils/error-handling'
import { useCallback, useEffect, useRef, useState } from 'react'

interface UseCloudPaginationOptions {
  isSignedIn: boolean
  userId?: string
  pageSize?: number
  initialToken?: string
  isInitialPageReady?: boolean
}

interface UseCloudPaginationReturn {
  hasMore: boolean
  isLoading: boolean
  hasAttempted: boolean
  isInitialized: boolean
  initialize: () => Promise<
    | {
        hasMore: boolean
        nextToken?: string
        deletedIds: string[]
      }
    | undefined
  >
  loadMore: () => Promise<
    | {
        hasMore: boolean
        nextToken?: string
        saved: number
      }
    | undefined
  >
  reset: () => Promise<
    | {
        hasMore: boolean
        nextToken?: string
        deletedIds: string[]
      }
    | undefined
  >
}

export function useCloudPagination(
  options: UseCloudPaginationOptions,
): UseCloudPaginationReturn {
  const {
    isSignedIn,
    userId,
    pageSize = PAGINATION.CHATS_PER_PAGE,
    initialToken,
    isInitialPageReady = false,
  } = options

  const [nextToken, setNextToken] = useState<string | undefined>(undefined)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [hasAttempted, setHasAttempted] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const loadingGenerationRef = useRef<number | null>(null)
  const requestGenerationRef = useRef(0)
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(isCloudSyncEnabled())

  useEffect(() => {
    const checkCloudSyncStatus = () => {
      setCloudSyncEnabled(isCloudSyncEnabled())
    }

    checkCloudSyncStatus()

    window.addEventListener('storage', checkCloudSyncStatus)
    window.addEventListener('cloudSyncSettingChanged', checkCloudSyncStatus)

    return () => {
      window.removeEventListener('storage', checkCloudSyncStatus)
      window.removeEventListener(
        'cloudSyncSettingChanged',
        checkCloudSyncStatus,
      )
    }
  }, [])

  const initialize = useCallback(async () => {
    requestGenerationRef.current += 1
    loadingGenerationRef.current = null
    setIsLoading(false)
    if (!isSignedIn || !userId || !cloudSyncEnabled || !isInitialPageReady) {
      setNextToken(undefined)
      setHasMore(false)
      setHasAttempted(false)
      setIsInitialized(false)
      return
    }

    // Note: We intentionally do NOT delete local chats here.
    // IndexedDB can hold gigabytes of data, so keeping all synced chats
    // locally provides better offline access. Users can fetch older chats
    // from the cloud on demand via loadMore().

    setNextToken(initialToken)
    setHasMore(Boolean(initialToken))
    setHasAttempted(false)
    setIsInitialized(true)
    return {
      hasMore: Boolean(initialToken),
      nextToken: initialToken,
      deletedIds: [], // Never delete local chats
    }
  }, [isSignedIn, userId, cloudSyncEnabled, isInitialPageReady, initialToken])

  const loadMore = useCallback(async () => {
    if (
      !isSignedIn ||
      !userId ||
      isLoading ||
      !cloudSyncEnabled ||
      !isInitialized ||
      loadingGenerationRef.current !== null
    )
      return

    const requestGeneration = requestGenerationRef.current
    loadingGenerationRef.current = requestGeneration
    // Save current state in case we need to rollback
    const previousToken = nextToken
    const previousHasMore = hasMore

    setIsLoading(true)
    setHasAttempted(true)

    try {
      if (!nextToken) {
        setHasMore(false)
        return
      }

      const result = await cloudSync.fetchAndStorePage({
        limit: pageSize,
        continuationToken: nextToken,
      })
      if (requestGeneration !== requestGenerationRef.current) return

      setNextToken(result.nextToken)
      setHasMore(!!result.nextToken)
      return result
    } catch (error) {
      if (requestGeneration !== requestGenerationRef.current) return
      // Rollback state on error
      setNextToken(previousToken)
      setHasMore(previousHasMore)

      logError('Failed to load more chats', error, {
        component: 'useCloudPagination',
        action: 'loadMore',
        metadata: {
          hadToken: !!previousToken,
          wasInitialized: isInitialized,
        },
      })
      return undefined
    } finally {
      if (loadingGenerationRef.current === requestGeneration) {
        loadingGenerationRef.current = null
      }
      if (
        requestGeneration === requestGenerationRef.current &&
        loadingGenerationRef.current === null
      ) {
        setIsLoading(false)
      }
    }
  }, [
    isSignedIn,
    userId,
    isLoading,
    nextToken,
    pageSize,
    hasMore,
    cloudSyncEnabled,
    isInitialized,
  ])

  const reset = useCallback(async () => {
    setHasAttempted(false)
    setIsInitialized(false)
    return initialize()
  }, [initialize])

  // Initialize when user changes (only if cloud sync is enabled)
  useEffect(() => {
    if (isSignedIn && userId && cloudSyncEnabled) {
      void initialize()
    } else {
      setNextToken(undefined)
      setHasMore(false)
      setHasAttempted(false)
      setIsInitialized(false)
    }
  }, [isSignedIn, userId, cloudSyncEnabled, initialize])

  return {
    hasMore,
    isLoading,
    hasAttempted,
    isInitialized,
    initialize,
    loadMore,
    reset,
  }
}
