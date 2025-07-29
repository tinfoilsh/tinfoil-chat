import { r2Storage } from '@/services/cloud/r2-storage'
import { chatStorage } from '@/services/storage/chat-storage'
import { logError, logWarning } from '@/utils/error-handling'
import { useCallback, useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { CONSTANTS } from '../constants'
import type { Chat } from '../types'

// Generate a chat ID with proper format for cloud storage (synchronous fallback)
function generateChatIdSync(): string {
  const timestamp = Date.now()
  const reverseTimestamp = 9999999999999 - timestamp
  return `${reverseTimestamp}_${uuidv4()}`
}

// Generate a chat ID with proper format for cloud storage (async with backend)
async function generateChatId(): Promise<string> {
  try {
    // Try to get a properly formatted ID from the backend
    if (await r2Storage.isAuthenticated()) {
      const result = await r2Storage.generateConversationId()
      return result.conversationId
    }
  } catch (error) {
    // Fallback to client-side generation if offline or not authenticated
    logWarning(
      'Failed to generate ID from backend, using client-side generation',
      {
        component: 'useChatStorage',
        action: 'generateChatId',
        metadata: { error },
      },
    )
  }

  return generateChatIdSync()
}

// Helper to create a new chat object with generated ID
async function createNewChatObject(): Promise<Chat> {
  const id = await generateChatId()
  return {
    id,
    title: 'New Chat',
    messages: [],
    createdAt: new Date(),
  }
}

// Synchronous version for initial state (before auth is ready)
function createNewChatObjectSync(): Chat {
  return {
    id: generateChatIdSync(),
    title: 'New Chat',
    messages: [],
    createdAt: new Date(),
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
      const savedChatIds = new Set(savedChats.map((chat) => chat.id))

      // Get current chats state to preserve unsaved empty chats
      setChats((prevChats) => {
        // Find all unsaved empty chats (not just the current one)
        const unsavedEmptyChats = prevChats.filter(
          (chat) =>
            (!chat.messages || chat.messages.length === 0) &&
            !savedChatIds.has(chat.id),
        )

        if (savedChats.length > 0) {
          const parsedChats = savedChats.map((chat: Chat) => ({
            ...chat,
            createdAt: new Date(chat.createdAt),
          }))

          // Combine unsaved empty chats with saved chats
          const combinedChats = [...unsavedEmptyChats, ...parsedChats]

          // Sort by ID to maintain consistent order (newer first)
          const finalChats = combinedChats.sort((a, b) =>
            a.id.localeCompare(b.id),
          )

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
        } else {
          // No saved chats found, keep unsaved empty chats
          return unsavedEmptyChats.length > 0 ? unsavedEmptyChats : prevChats
        }
      })
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

            // Check if we need to add a new empty chat (only on initial load)
            const hasEmptyUsableChat = usableChats.some(
              (chat) => !chat.messages || chat.messages.length === 0,
            )

            let finalChats = parsedChats
            let newChat = null

            if (!hasEmptyUsableChat) {
              // No empty usable chat exists, create one for initial load
              newChat = createNewChatObjectSync()
              finalChats = [newChat, ...parsedChats]
            }

            setChats(finalChats)

            // Set initial current chat
            if (newChat) {
              setCurrentChat(newChat)
            } else {
              // Find the best usable chat to start with
              const emptyUsableChat = usableChats.find(
                (chat) => !chat.messages || chat.messages.length === 0,
              )
              setCurrentChat(
                emptyUsableChat || usableChats[0] || parsedChats[0],
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

    // Don't create a new chat if the current chat is already empty
    if (currentChat?.messages?.length === 0) {
      return // Current chat is already empty, no need to create a new one
    }

    // Create new chat asynchronously to use backend ID generation
    createNewChatObject()
      .then((newChat) => {
        setCurrentChat(newChat)

        // Update chats array by adding the new chat at the beginning
        setChats((prev) => {
          const updatedChats = [newChat, ...prev]
          // Don't save empty chats - they'll be saved when the first message is added
          return updatedChats
        })
      })
      .catch((error) => {
        logError('Failed to create new chat', error, {
          component: 'useChatStorage',
          action: 'createNewChat',
        })

        // Fallback to sync generation if async fails
        const newChat = createNewChatObjectSync()
        setCurrentChat(newChat)
        setChats((prev) => [newChat, ...prev])
      })
  }, [storeHistory, currentChat?.messages?.length])

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
