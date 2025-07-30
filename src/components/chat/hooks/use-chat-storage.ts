import { r2Storage } from '@/services/cloud/r2-storage'
import { chatStorage } from '@/services/storage/chat-storage'
import { logError, logWarning } from '@/utils/error-handling'
import { useCallback, useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { CONSTANTS } from '../constants'
import type { Chat } from '../types'

// Generate a temporary chat ID that will be replaced with server ID
function generateTemporaryChatId(): string {
  return `temp_${uuidv4()}`
}

// Get a server-assigned chat ID from the backend
async function getServerChatId(): Promise<string | null> {
  try {
    if (await r2Storage.isAuthenticated()) {
      const result = await r2Storage.generateConversationId()
      return result.conversationId
    }
  } catch (error) {
    logWarning('Failed to generate ID from backend', {
      component: 'useChatStorage',
      action: 'getServerChatId',
      metadata: { error },
    })
  }
  return null
}

// Create a new chat object with placeholder ID (will be replaced when first message is sent)
function createNewChatObjectSync(): Chat {
  return {
    id: 'new-chat-' + Date.now(), // Temporary placeholder ID
    title: 'New Chat',
    messages: [],
    createdAt: new Date(),
    hasTemporaryId: true, // Flag to indicate this needs a server ID
    isBlankChat: true,
  }
}

interface UseChatStorageProps {
  storeHistory: boolean
}

interface UseChatStorageReturn {
  chats: Chat[]
  currentChat: Chat
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>
  setCurrentChat: React.Dispatch<React.SetStateAction<Chat>>
  createNewChat: () => void
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
    if (!storeHistory || typeof window === 'undefined') return

    try {
      const savedChats = await chatStorage.getAllChatsWithSyncStatus()

      // Get current chats state to preserve blank chats
      setChats((prevChats) => {
        // Create a map to track chats by ID for deduplication
        const chatMap = new Map<string, Chat>()

        // First add saved chats
        savedChats.forEach((chat: Chat) => {
          chatMap.set(chat.id, {
            ...chat,
            createdAt: new Date(chat.createdAt),
          })
        })

        // Then add blank chats that aren't saved yet
        prevChats.forEach((chat) => {
          if (chat.isBlankChat && !chatMap.has(chat.id)) {
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
  }, [storeHistory]) // Don't depend on currentChat.id to prevent recreating on every render

  // Load chats from storage asynchronously
  useEffect(() => {
    let isMounted = true

    if (storeHistory && typeof window !== 'undefined') {
      const loadChats = async () => {
        try {
          const savedChats = await chatStorage.getAllChatsWithSyncStatus()

          // Check if component is still mounted before updating state
          if (!isMounted) return

          if (savedChats.length > 0) {
            const parsedChats = savedChats.map((chat) => ({
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
    } else {
      // If not storing history, clear initial load immediately
      setIsInitialLoad(false)
    }

    // Cleanup function to set isMounted to false
    return () => {
      isMounted = false
    }
  }, [storeHistory])

  // Create a new chat
  const createNewChat = useCallback(() => {
    if (!storeHistory) return // Prevent creating new chats for basic users

    // Check if any chat in the list is blank (not just current chat)
    const hasBlankChat = chats.some((chat) => chat.isBlankChat === true)

    if (hasBlankChat) {
      // Find the blank chat and switch to it
      const blankChat = chats.find((chat) => chat.isBlankChat === true)
      if (blankChat) {
        setCurrentChat(blankChat)
      }
      return
    }

    // Create new chat instantly with temporary ID
    const tempChat = createNewChatObjectSync()

    setCurrentChat(tempChat)
    setChats((prev) => [tempChat, ...prev])

    // Don't request server ID here - wait until first message is sent
    // This ensures createdAt reflects when the chat actually has content
  }, [storeHistory, chats])

  // Delete a chat
  const deleteChat = useCallback(
    (chatId: string) => {
      if (!storeHistory) return // Prevent deleting chats for basic users

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
        chatStorage.deleteChat(chatId).catch((error) => {
          logError('Failed to delete chat from storage', error, {
            component: 'useChatStorage',
          })
        })
        return newChats
      })
    },
    [currentChat?.id, storeHistory],
  )

  // Switch to a different chat
  const switchChat = useCallback(
    async (chat: Chat) => {
      if (!storeHistory) return // Prevent switching chats for basic users

      setCurrentChat(chat)
      setIsInitialLoad(true)

      // Set isInitialLoad back to false after a brief delay to show the chat
      setTimeout(() => {
        setIsInitialLoad(false)
      }, CONSTANTS.CHAT_INIT_DELAY_MS)
    },
    [storeHistory],
  )

  // Handle chat selection
  const handleChatSelect = useCallback(
    (chatId: string) => {
      if (!storeHistory) return // Prevent chat selection for basic users

      const selectedChat = chats.find((chat) => chat.id === chatId) || chats[0]
      switchChat(selectedChat)
    },
    [chats, switchChat, storeHistory],
  )

  // Update chat title
  const updateChatTitle = useCallback(
    (chatId: string, newTitle: string) => {
      if (!storeHistory) return // Prevent updating titles for basic users

      setChats((prevChats) => {
        const updatedChats = prevChats.map((chat) =>
          chat.id === chatId ? { ...chat, title: newTitle } : chat,
        )

        // Update in storage
        const chatToUpdate = updatedChats.find((c) => c.id === chatId)
        if (chatToUpdate) {
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
        }

        return updatedChats
      })

      // Also update current chat if it's the one being edited
      if (currentChat?.id === chatId) {
        setCurrentChat((prev) => ({ ...prev, title: newTitle }))
      }
    },
    [storeHistory, currentChat?.id, reloadChats],
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
