import { chatStorage } from '@/services/storage/chat-storage'
import { deletedChatsTracker } from '@/services/storage/deleted-chats-tracker'
import { sessionChatStorage } from '@/services/storage/session-storage'
import { logError } from '@/utils/error-handling'
import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CONSTANTS } from '../constants'
import type { Chat } from '../types'

// Create a new chat object with placeholder ID (will be replaced when first message is sent)
function createNewChatObjectSync(intendedLocalOnly = false): Chat {
  return {
    id: 'new-chat-' + Date.now(), // Temporary placeholder ID
    title: 'New Chat',
    messages: [],
    createdAt: new Date(),
    hasTemporaryId: true, // Flag to indicate this needs a server ID
    isBlankChat: true,
    intendedLocalOnly, // Track if this should be a local-only chat
  }
}

interface UseChatStorageProps {
  storeHistory: boolean
  scrollToBottom?: () => void
}

interface UseChatStorageReturn {
  chats: Chat[]
  currentChat: Chat
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>
  setCurrentChat: React.Dispatch<React.SetStateAction<Chat>>
  createNewChat: (intendedLocalOnly?: boolean) => void
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
  scrollToBottom,
}: UseChatStorageProps): UseChatStorageReturn {
  const { isSignedIn } = useAuth()
  const [isInitialLoad, setIsInitialLoad] = useState(true)

  const [chats, setChats] = useState<Chat[]>(() => {
    const defaultChat = createNewChatObjectSync()

    // Return default chat for server-side rendering
    if (typeof window === 'undefined') {
      return [defaultChat]
    }

    // Return default chat initially, then load from storage asynchronously
    return [defaultChat]
  })

  // Initialize currentChat with the first chat
  const [currentChat, setCurrentChat] = useState<Chat>(chats[0])

  // Keep a ref to currentChat for stable callbacks
  const currentChatRef = useRef(currentChat)
  useEffect(() => {
    currentChatRef.current = currentChat
  }, [currentChat])

  // Reload chats from storage
  const reloadChats = useCallback(async () => {
    if (typeof window === 'undefined') return

    try {
      // Use sessionStorage for non-signed-in users, IndexedDB for signed-in
      const savedChats =
        storeHistory && isSignedIn
          ? await chatStorage.getAllChatsWithSyncStatus()
          : sessionChatStorage.getAllChats()

      // Get current chats state to preserve blank chats
      setChats((prevChats) => {
        // Create a map to track chats by ID for deduplication
        const chatMap = new Map<string, Chat>()

        // First add saved chats (filtering out recently deleted ones)
        savedChats.forEach((chat: Chat) => {
          // Skip if this chat was recently deleted
          if (!deletedChatsTracker.isDeleted(chat.id)) {
            chatMap.set(chat.id, {
              ...chat,
              createdAt: new Date(chat.createdAt),
            })
          }
        })

        // Then add blank chats and recently created chats that aren't saved yet
        prevChats.forEach((chat) => {
          // Preserve blank chats OR chats that don't have syncedAt (not yet synced)
          if ((chat.isBlankChat || !chat.syncedAt) && !chatMap.has(chat.id)) {
            chatMap.set(chat.id, chat)
          }
        })

        // Convert map to array and sort
        const finalChats = Array.from(chatMap.values()).sort((a, b) => {
          // Blank chats first
          if (a.isBlankChat && !b.isBlankChat) return -1
          if (!a.isBlankChat && b.isBlankChat) return 1

          // Then by creation date
          const timeA = new Date(a.createdAt).getTime()
          const timeB = new Date(b.createdAt).getTime()
          return timeB - timeA
        })

        // Determine which chat should be current
        const currentChatStillExists = finalChats.some(
          (chat) => chat.id === currentChatRef.current?.id,
        )

        const currentChatIsUsable =
          currentChatStillExists &&
          !(currentChatRef.current as any)?.decryptionFailed

        if (!currentChatIsUsable) {
          // Need to find a new current chat
          // Find all usable (non-encrypted) chats
          const usableChats = finalChats.filter(
            (chat) => !(chat as any).decryptionFailed,
          )

          // Find the best usable chat
          const emptyUsableChat = usableChats.find(
            (chat) => !chat.messages || chat.messages.length === 0,
          )
          setCurrentChat(emptyUsableChat || usableChats[0] || finalChats[0])
        }
        // Otherwise keep the current chat as is

        return finalChats
      })

      // Update current chat if it was modified remotely
      const currentChatId = currentChatRef.current?.id
      if (currentChatId) {
        const updatedChat = savedChats.find((chat) => chat.id === currentChatId)
        if (updatedChat) {
          setCurrentChat((prevChat) => {
            // Skip update if we're actively streaming (assistant is thinking or generating)
            const lastMessage = prevChat.messages[prevChat.messages.length - 1]
            const isActivelyStreaming =
              lastMessage &&
              lastMessage.role === 'assistant' &&
              (lastMessage.isThinking ||
                (lastMessage.thoughts && !lastMessage.content) ||
                (!lastMessage.thoughts && !lastMessage.content))

            if (isActivelyStreaming) {
              return prevChat // Don't update during active streaming
            }

            // Only update if the chat has actually changed
            if (
              prevChat.id === updatedChat.id &&
              (prevChat.messages.length !== updatedChat.messages.length ||
                prevChat.syncedAt !== updatedChat.syncedAt)
            ) {
              return {
                ...updatedChat,
                createdAt: new Date(updatedChat.createdAt),
              }
            }
            return prevChat
          })
        }
      }
    } catch (error) {
      logError('Failed to reload chats from storage', error, {
        component: 'useChatStorage',
      })
    }
  }, [storeHistory, isSignedIn]) // Don't depend on currentChat.id to prevent recreating on every render

  // Load chats from storage asynchronously
  useEffect(() => {
    let isMounted = true

    if (typeof window !== 'undefined') {
      const loadChats = async () => {
        try {
          const savedChats =
            storeHistory && isSignedIn
              ? await chatStorage.getAllChatsWithSyncStatus()
              : sessionChatStorage.getAllChats()

          // Check if component is still mounted before updating state
          if (!isMounted) return

          if (savedChats.length > 0) {
            const parsedChats = savedChats
              .filter((chat) => !deletedChatsTracker.isDeleted(chat.id))
              .map((chat) => ({
                ...chat,
                createdAt: new Date(chat.createdAt),
              }))
            // Find all usable (non-encrypted) chats
            const usableChats = parsedChats.filter(
              (chat) => !(chat as any).decryptionFailed,
            )

            // Check if we need to add a new blank chat (only on initial load)
            const hasBlankUsableChat = usableChats.some(
              (chat) => chat.isBlankChat === true,
            )

            let finalChats = parsedChats
            let newChat = null

            if (!hasBlankUsableChat) {
              // No blank usable chat exists, create one for initial load
              newChat = createNewChatObjectSync()
              finalChats = [newChat, ...parsedChats]
            }

            setChats(finalChats)

            // Set initial current chat
            if (newChat) {
              setCurrentChat(newChat)
            } else {
              // Find the best usable chat to start with
              const blankUsableChat = usableChats.find(
                (chat) => chat.isBlankChat === true,
              )
              setCurrentChat(
                blankUsableChat || usableChats[0] || parsedChats[0],
              )
            }
          }
          // Clear initial load state after loading chats
          if (isMounted) {
            setIsInitialLoad(false)
          }
        } catch (error) {
          logError('Failed to load chats from storage', error, {
            component: 'useChatStorage',
          })
          if (isMounted) {
            setIsInitialLoad(false)
          }
        }
      }

      loadChats()
    }

    // Clear initial load if we're not storing or on server
    if (!storeHistory || typeof window === 'undefined') {
      setIsInitialLoad(false)
    }

    // Cleanup function to set isMounted to false
    return () => {
      isMounted = false
    }
  }, [storeHistory, isSignedIn])

  // Create a new chat
  const createNewChat = useCallback(
    (intendedLocalOnly = false) => {
      // Check if any chat in the list is blank (not just current chat)
      const hasBlankChat = chats.some((chat) => chat.isBlankChat === true)

      if (hasBlankChat) {
        // Find the blank chat and switch to it
        const blankChat = chats.find((chat) => chat.isBlankChat === true)
        if (blankChat) {
          // Update the intended type if different
          if (blankChat.intendedLocalOnly !== intendedLocalOnly) {
            const updatedChat = { ...blankChat, intendedLocalOnly }
            setCurrentChat(updatedChat)
            setChats((prevChats) =>
              prevChats.map((c) => (c.id === blankChat.id ? updatedChat : c)),
            )
          } else {
            setCurrentChat(blankChat)
          }
        }
        return
      }

      // Create new chat instantly with temporary ID
      const tempChat = createNewChatObjectSync(intendedLocalOnly)

      setCurrentChat(tempChat)
      setChats((prev) => [tempChat, ...prev])

      // Don't request server ID here - wait until first message is sent
      // This ensures createdAt reflects when the chat actually has content
    },
    [chats],
  )

  // Delete a chat
  const deleteChat = useCallback(
    (chatId: string) => {
      // Mark as deleted immediately to prevent re-sync
      deletedChatsTracker.markAsDeleted(chatId)

      setChats((prevChats) => {
        const newChats = prevChats.filter((chat) => chat.id !== chatId)

        // Always ensure there's at least one chat
        if (newChats.length === 0) {
          const newChat = createNewChatObjectSync()
          setCurrentChat(newChat)
          // Don't save empty chats - they'll be saved when the first message is added
          return [newChat]
        }

        // If we deleted the current chat, switch to the first remaining chat
        if (currentChat?.id === chatId) {
          setCurrentChat(newChats[0])
        }

        // Delete from storage
        if (isSignedIn) {
          chatStorage.deleteChat(chatId).catch((error) => {
            logError('Failed to delete chat from storage', error, {
              component: 'useChatStorage',
              action: 'deleteChat',
              metadata: { chatId },
            })
          })
        } else {
          sessionChatStorage.deleteChat(chatId)
        }
        return newChats
      })
    },
    [currentChat?.id, isSignedIn],
  )

  // Switch to a different chat
  const switchChat = useCallback(async (chat: Chat) => {
    setCurrentChat(chat)
    setIsInitialLoad(true)

    // Set isInitialLoad back to false after a brief delay to show the chat
    setTimeout(() => {
      setIsInitialLoad(false)
    }, CONSTANTS.CHAT_INIT_DELAY_MS)
  }, [])

  // Handle chat selection
  const handleChatSelect = useCallback(
    (chatId: string) => {
      const selectedChat = chats.find((chat) => chat.id === chatId) || chats[0]
      switchChat(selectedChat)
    },
    [chats, switchChat],
  )

  // Update chat title
  const updateChatTitle = useCallback(
    (chatId: string, newTitle: string) => {
      setChats((prevChats) => {
        const updatedChats = prevChats.map((chat) =>
          chat.id === chatId ? { ...chat, title: newTitle } : chat,
        )

        // Update in storage
        const chatToUpdate = updatedChats.find((c) => c.id === chatId)
        if (chatToUpdate) {
          if (storeHistory && isSignedIn) {
            chatStorage
              .saveChatAndSync(chatToUpdate)
              .then(() => {
                // Reload after sync to update syncedAt
                reloadChats()
              })
              .catch((error) => {
                logError('Failed to update chat title in storage', error, {
                  component: 'useChatStorage',
                })
              })
          } else {
            // Save to session storage for non-signed-in users
            sessionChatStorage.saveChat(chatToUpdate)
          }
        }

        return updatedChats
      })

      // Also update current chat if it's the one being edited
      if (currentChat?.id === chatId) {
        setCurrentChat((prev) => ({ ...prev, title: newTitle }))
      }
    },
    [storeHistory, isSignedIn, currentChat?.id, reloadChats],
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
