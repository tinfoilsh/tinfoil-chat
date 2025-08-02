import type { Chat } from '@/components/chat/types'
import {
  cloudSync,
  type PaginatedChatsResult,
} from '@/services/cloud/cloud-sync'
import type { StoredChat } from '@/services/storage/indexed-db'
import { logError } from '@/utils/error-handling'
import { useCallback, useState } from 'react'

interface UsePaginatedChatsReturn {
  chats: Chat[]
  isLoading: boolean
  hasMore: boolean
  loadMore: () => Promise<void>
  reset: () => void
  error: string | null
}

const CHATS_PER_PAGE = 10

// Convert StoredChat to Chat
function convertStoredChatToChat(storedChat: StoredChat): Chat {
  return {
    id: storedChat.id,
    title: storedChat.title,
    messages: storedChat.messages,
    createdAt: new Date(storedChat.createdAt),
    syncedAt: storedChat.syncedAt,
    locallyModified: storedChat.locallyModified,
    decryptionFailed: storedChat.decryptionFailed,
    hasTemporaryId: storedChat.hasTemporaryId,
    isBlankChat: storedChat.isBlankChat,
  }
}

export function usePaginatedChats(): UsePaginatedChatsReturn {
  const [chats, setChats] = useState<Chat[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [nextToken, setNextToken] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return

    setIsLoading(true)
    setError(null)

    try {
      const result: PaginatedChatsResult =
        await cloudSync.loadChatsWithPagination({
          limit: CHATS_PER_PAGE,
          continuationToken: nextToken,
          loadLocal: true, // Fall back to local if not authenticated
        })

      // Convert StoredChat[] to Chat[]
      const convertedChats = result.chats.map(convertStoredChatToChat)

      // Append new chats to existing ones
      setChats((prev) => [...prev, ...convertedChats])
      setHasMore(result.hasMore)
      setNextToken(result.nextToken)
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load chats'
      setError(errorMessage)
      logError('Failed to load paginated chats', err, {
        component: 'usePaginatedChats',
        action: 'loadMore',
      })
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, hasMore, nextToken])

  const reset = useCallback(() => {
    setChats([])
    setHasMore(true)
    setNextToken(undefined)
    setError(null)
  }, [])

  return {
    chats,
    isLoading,
    hasMore,
    loadMore,
    reset,
    error,
  }
}
