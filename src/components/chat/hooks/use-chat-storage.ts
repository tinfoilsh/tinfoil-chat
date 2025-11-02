import { chatEvents } from '@/services/storage/chat-events'
import { logError } from '@/utils/error-handling'
import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CONSTANTS } from '../constants'
import type { Chat } from '../types'
import {
  createBlankChat,
  deleteChat as deleteChatFromStorage,
  ensureAtLeastOneChat,
  getBlankChat,
  loadChats,
  sortChats,
} from './chat-operations'
import { ChatPersistenceManager } from './chat-persistence-manager'

interface UseChatStorageProps {
  storeHistory: boolean
  scrollToBottom?: () => void
}

interface UseChatStorageReturn {
  chats: Chat[]
  currentChat: Chat
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>
  setCurrentChat: React.Dispatch<React.SetStateAction<Chat>>
  createNewChat: (isLocalOnly?: boolean, fromUserAction?: boolean) => void
  deleteChat: (chatId: string) => void
  updateChatTitle: (chatId: string, newTitle: string) => void
  switchChat: (chat: Chat) => Promise<void>
  handleChatSelect: (chatId: string) => void
  setIsInitialLoad: (loading: boolean) => void
  isInitialLoad: boolean
  reloadChats: () => Promise<void>
}

export function useChatStorage({
  storeHistory,
}: UseChatStorageProps): UseChatStorageReturn {
  const { isSignedIn } = useAuth()
  const [isInitialLoad, setIsInitialLoad] = useState(true)

  // Initialize with blank chats for both modes
  const [chats, setChats] = useState<Chat[]>(() => {
    if (typeof window === 'undefined') {
      return [createBlankChat(false), createBlankChat(true)]
    }
    return [createBlankChat(false), createBlankChat(true)]
  })

  const [currentChat, setCurrentChat] = useState<Chat>(chats[0])

  // Create persistence manager
  const persistenceManager = useMemo(
    () => new ChatPersistenceManager(!!isSignedIn),
    [isSignedIn],
  )

  // Update persistence manager when auth changes
  useEffect(() => {
    persistenceManager.setSignedIn(!!isSignedIn)
  }, [isSignedIn, persistenceManager])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      persistenceManager.cleanup()
    }
  }, [persistenceManager])

  // Load chats from storage
  const reloadChats = useCallback(async () => {
    if (typeof window === 'undefined') return

    try {
      const loadedChats = await loadChats(storeHistory && !!isSignedIn)

      setChats((prevChats) => {
        // Always ensure we have blank chats for both modes
        const cloudBlank =
          getBlankChat(prevChats, false) || createBlankChat(false)
        const localBlank =
          getBlankChat(prevChats, true) || createBlankChat(true)

        // Merge loaded chats with state (excluding blank chats)
        const nonBlankChats = loadedChats.filter((c) => !c.isBlankChat)

        // Combine blank chats with loaded chats and sort
        const finalChats = sortChats([cloudBlank, localBlank, ...nonBlankChats])

        // If current chat was deleted and it's not a blank chat, switch to first available chat
        const currentChatExists = finalChats.some(
          (c) =>
            c.id === currentChat.id ||
            (c.isBlankChat &&
              currentChat.isBlankChat &&
              c.isLocalOnly === currentChat.isLocalOnly),
        )
        if (!currentChatExists && finalChats.length > 0) {
          setCurrentChat(finalChats[0])
        }

        return finalChats
      })

      // Update current chat if it was modified and is not a blank chat
      if (!currentChat.isBlankChat) {
        const updatedCurrentChat = loadedChats.find(
          (c) => c.id === currentChat.id,
        )
        if (updatedCurrentChat) {
          setCurrentChat((prev) => {
            // Don't update if actively streaming
            const lastMessage = prev.messages[prev.messages.length - 1]
            const isStreaming =
              lastMessage?.role === 'assistant' &&
              (lastMessage.isThinking || !lastMessage.content)

            if (isStreaming) return prev

            // Only update if actually changed
            if (
              prev.messages.length !== updatedCurrentChat.messages.length ||
              prev.syncedAt !== updatedCurrentChat.syncedAt ||
              prev.title !== updatedCurrentChat.title
            ) {
              return updatedCurrentChat
            }
            return prev
          })
        }
      }
    } catch (error) {
      logError('Failed to reload chats', error, {
        component: 'useChatStorage',
      })
    }
  }, [
    storeHistory,
    isSignedIn,
    currentChat.id,
    currentChat.isBlankChat,
    currentChat.isLocalOnly,
  ])

  // Listen for chat events (cloud sync, pagination, etc.)
  useEffect(() => {
    const cleanup = chatEvents.on((event) => {
      if (event.reason === 'sync' || event.reason === 'pagination') {
        reloadChats()
      }
    })

    return cleanup
  }, [reloadChats])

  // Initial load
  useEffect(() => {
    let mounted = true

    const loadInitialChats = async () => {
      if (typeof window === 'undefined') return

      try {
        const loadedChats = await loadChats(storeHistory && !!isSignedIn)

        if (!mounted) return

        // Always have blank chats for both modes
        const cloudBlank = createBlankChat(false)
        const localBlank = createBlankChat(true)

        // Filter out any blank chats from loaded data (they shouldn't be persisted)
        const nonBlankChats = loadedChats.filter((c) => !c.isBlankChat)

        // Combine and sort
        const finalChats = sortChats([cloudBlank, localBlank, ...nonBlankChats])

        setChats(finalChats)
        setCurrentChat(finalChats[0]) // Start with the cloud blank chat
      } catch (error) {
        logError('Failed to load initial chats', error, {
          component: 'useChatStorage',
        })
      } finally {
        if (mounted) {
          setIsInitialLoad(false)
        }
      }
    }

    loadInitialChats()

    return () => {
      mounted = false
    }
  }, [storeHistory, isSignedIn])

  // Create new chat (switch to the appropriate blank chat)
  const createNewChat = useCallback(
    (isLocalOnly = false, fromUserAction = true) => {
      // Find the blank chat for this mode
      const blankChat = chats.find(
        (c) => c.isBlankChat === true && c.isLocalOnly === isLocalOnly,
      )

      // If blank chat exists, just switch to it
      if (blankChat) {
        if (fromUserAction || currentChat.id !== '') {
          setCurrentChat(blankChat)
        }
      } else {
        // Create a new blank chat if it doesn't exist (shouldn't normally happen)
        const newBlankChat = createBlankChat(isLocalOnly)
        setChats((prev) => sortChats([newBlankChat, ...prev]))
        setCurrentChat(newBlankChat)
      }
    },
    [chats, currentChat.id],
  )

  // Delete chat
  const deleteChat = useCallback(
    (chatId: string) => {
      setChats((prevChats) => {
        const filtered = prevChats.filter((c) => c.id !== chatId)
        const newChats = ensureAtLeastOneChat(filtered)

        // Switch to another chat if we deleted the current one
        if (currentChat?.id === chatId && newChats.length > 0) {
          setCurrentChat(newChats[0])
        }

        return newChats
      })

      // Delete from storage
      deleteChatFromStorage(chatId, !!isSignedIn).catch((error) => {
        logError('Failed to delete chat', error, {
          component: 'useChatStorage',
          metadata: { chatId },
        })
      })
    },
    [currentChat?.id, isSignedIn],
  )

  // Update chat title
  const updateChatTitle = useCallback(
    (chatId: string, newTitle: string) => {
      setChats((prevChats) => {
        const updatedChats = prevChats.map((chat) =>
          chat.id === chatId ? { ...chat, title: newTitle } : chat,
        )

        const chatToUpdate = updatedChats.find((c) => c.id === chatId)
        if (chatToUpdate && storeHistory) {
          persistenceManager.save(chatToUpdate).catch((error) => {
            logError('Failed to save chat title update', error, {
              component: 'useChatStorage',
              metadata: { chatId },
            })
          })
        }

        return updatedChats
      })

      if (currentChat?.id === chatId) {
        setCurrentChat((prev) => ({ ...prev, title: newTitle }))
      }
    },
    [storeHistory, currentChat?.id, persistenceManager],
  )

  // Switch to a different chat
  const switchChat = useCallback(async (chat: Chat) => {
    setCurrentChat(chat)
    setIsInitialLoad(true)

    // Brief delay to show loading state
    setTimeout(() => {
      setIsInitialLoad(false)
    }, CONSTANTS.CHAT_INIT_DELAY_MS)
  }, [])

  // Handle chat selection
  const handleChatSelect = useCallback(
    (chatId: string) => {
      // For blank chats, we need to find them by their blank status and local mode
      // since they don't have IDs
      const selectedChat = chats.find((chat) => {
        if (chat.isBlankChat && chatId === '') {
          // For blank chat selection, match by the current chat's local mode
          return chat.isLocalOnly === currentChat.isLocalOnly
        }
        return chat.id === chatId
      })
      if (selectedChat) {
        switchChat(selectedChat)
      }
    },
    [chats, currentChat.isLocalOnly, switchChat],
  )

  return {
    chats,
    currentChat,
    setChats,
    setCurrentChat,
    createNewChat,
    deleteChat,
    updateChatTitle,
    switchChat,
    handleChatSelect,
    setIsInitialLoad,
    isInitialLoad,
    reloadChats,
  }
}
