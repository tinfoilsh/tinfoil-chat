import { CLOUD_SYNC, PAGINATION } from '@/config'
import { cloudSync } from '@/services/cloud/cloud-sync'
import { r2Storage } from '@/services/cloud/r2-storage'
import { indexedDBStorage } from '@/services/storage/indexed-db'
import { isCloudSyncEnabled } from '@/utils/cloud-sync-settings'
import { logError } from '@/utils/error-handling'
import { useCallback, useEffect, useRef, useState } from 'react'

interface UseCloudPaginationOptions {
  isSignedIn: boolean
  userId?: string
  pageSize?: number
}

interface UseCloudPaginationReturn {
  hasMore: boolean
  isLoading: boolean
  hasAttempted: boolean
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
  const { isSignedIn, userId, pageSize = PAGINATION.CHATS_PER_PAGE } = options

  const [nextToken, setNextToken] = useState<string | undefined>(undefined)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [hasAttempted, setHasAttempted] = useState(false)
  const initializedRef = useRef(false)

  const initialize = useCallback(async () => {
    if (!isSignedIn || !userId || !isCloudSyncEnabled()) return

    try {
      const allChats = await indexedDBStorage.getAllChats()
      const syncedChats = allChats
        .filter(
          (chat) =>
            chat.syncedAt &&
            !(chat as any).isBlankChat &&
            !(chat as any).hasTemporaryId,
        )
        .sort((a, b) => {
          const timeA = new Date(a.createdAt).getTime()
          const timeB = new Date(b.createdAt).getTime()
          return timeB - timeA
        })

      const deletedIds: string[] = []
      if (syncedChats.length > pageSize) {
        const chatsToDelete = syncedChats.slice(pageSize)
        for (const chat of chatsToDelete) {
          // Skip deletion for chats that were recently synced
          // Remote listings might not include them yet due to eventual consistency
          const recentlySynced =
            typeof chat.syncedAt === 'number' &&
            Date.now() - chat.syncedAt < CLOUD_SYNC.DELETION_GRACE_MS
          if (recentlySynced) {
            continue
          }

          try {
            await indexedDBStorage.deleteChat(chat.id)
            deletedIds.push(chat.id)
          } catch (deleteError) {
            logError('Failed to prune paginated chat', deleteError, {
              component: 'useCloudPagination',
              action: 'initialize_delete',
              metadata: { chatId: chat.id },
            })
          }
        }
      }

      const result = await r2Storage.listChats({ limit: pageSize })
      setNextToken(result.nextContinuationToken)
      setHasMore(!!result.nextContinuationToken)
      setHasAttempted(false)
      initializedRef.current = true
      return {
        hasMore: !!result.nextContinuationToken,
        nextToken: result.nextContinuationToken,
        deletedIds,
      }
    } catch (error) {
      logError('Failed to initialize pagination', error, {
        component: 'useCloudPagination',
        action: 'initialize',
      })
      return undefined
    }
  }, [isSignedIn, userId, pageSize])

  const loadMore = useCallback(async () => {
    if (!isSignedIn || !userId || isLoading || !isCloudSyncEnabled()) return

    // Save current state in case we need to rollback
    const previousToken = nextToken
    const previousHasMore = hasMore

    setIsLoading(true)
    setHasAttempted(true)

    try {
      let tokenToUse = nextToken
      if (!tokenToUse && !initializedRef.current) {
        const init = await r2Storage.listChats({ limit: pageSize })
        tokenToUse = init.nextContinuationToken
      }

      if (!tokenToUse) {
        setHasMore(false)
        return
      }

      const result = await cloudSync.fetchAndStorePage({
        limit: pageSize,
        continuationToken: tokenToUse,
      })

      setNextToken(result.nextToken)
      setHasMore(!!result.nextToken)
      return result
    } catch (error) {
      // Rollback state on error
      setNextToken(previousToken)
      setHasMore(previousHasMore)

      // If this was the first attempt and we have no token,
      // we should allow retry on next attempt
      if (!previousToken && !initializedRef.current) {
        setHasAttempted(false)
      }

      logError('Failed to load more chats', error, {
        component: 'useCloudPagination',
        action: 'loadMore',
        metadata: {
          hadToken: !!previousToken,
          wasInitialized: initializedRef.current,
        },
      })
      return undefined
    } finally {
      setIsLoading(false)
    }
  }, [isSignedIn, userId, isLoading, nextToken, pageSize, hasMore])

  const reset = useCallback(async () => {
    setHasAttempted(false)
    initializedRef.current = false
    return initialize()
  }, [initialize])

  // Initialize when user changes (only if cloud sync is enabled)
  useEffect(() => {
    if (isSignedIn && userId && isCloudSyncEnabled()) {
      void initialize()
    } else {
      setNextToken(undefined)
      setHasMore(false)
      setHasAttempted(false)
      initializedRef.current = false
    }
  }, [isSignedIn, userId, initialize])

  return { hasMore, isLoading, hasAttempted, initialize, loadMore, reset }
}
