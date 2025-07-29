import { r2Storage } from '@/services/cloud/r2-storage'
import { chatStorage } from '@/services/storage/chat-storage'
import { logError } from '@/utils/error-handling'
import { useCallback, useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
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
    if (r2Storage.isAuthenticated()) {
      const result = await r2Storage.generateConversationId()
      return result.conversationId
    }
  } catch (error) {
    // Fallback to client-side generation if offline or not authenticated
    console.warn(
      'Failed to generate ID from backend, using client-side generation:',
      error,
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
      const savedChats = await chatStorage.getAllChats()
      if (savedChats.length > 0) {
        const parsedChats = savedChats.map((chat: Chat) => ({
          ...chat,
          createdAt: new Date(chat.createdAt),
        }))
        setChats(parsedChats)

        // Check if the current chat still exists after reload
        const currentChatStillExists = parsedChats.some(
          (chat) => chat.id === currentChatRef.current?.id,
        )

        // If current chat was deleted, switch to the first chat
        if (!currentChatStillExists) {
          const firstChat = parsedChats[0]
          if (firstChat.messages && firstChat.messages.length > 0) {
            // If the latest chat has messages, create a new empty chat
            const newChat = createNewChatObjectSync()
            const updatedChats = [newChat, ...parsedChats]
            setChats(updatedChats)
            setCurrentChat(newChat)
            // Don't save empty chats - they'll be saved when the first message is added
          } else {
            setCurrentChat(firstChat)
          }
        }
      } else {
        // No chats found, create a new one
        const newChat = createNewChatObjectSync()
        setChats([newChat])
        setCurrentChat(newChat)
        // Don't save empty chats - they'll be saved when the first message is added
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
          const savedChats = await chatStorage.getAllChats()

          // Check if component is still mounted before updating state
          if (!isMounted) return

          if (savedChats.length > 0) {
            const parsedChats = savedChats.map((chat: Chat) => ({
              ...chat,
              createdAt: new Date(chat.createdAt),
            }))
            setChats(parsedChats)

            // Check if the first (most recent) chat has messages
            const firstChat = parsedChats[0]
            if (firstChat.messages && firstChat.messages.length > 0) {
              // If the latest chat has messages, create a new empty chat
              const newChat = createNewChatObjectSync()
              const updatedChats = [newChat, ...parsedChats]

              // Check again before updating state
              if (!isMounted) return

              setChats(updatedChats)
              setCurrentChat(newChat)
              // Don't save empty chats - they'll be saved when the first message is added
            } else {
              // If the latest chat is empty, use it
              if (isMounted) {
                setCurrentChat(firstChat)
              }
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
        if (storeHistory) {
          chatStorage.deleteChat(chatId).catch((error) => {
            logError('Failed to delete chat from storage', error, {
              component: 'useChatStorage',
            })
          })
        }

        return newChats
      })
    },
    [storeHistory, currentChat],
  )

  // Update chat title
  const updateChatTitle = useCallback(
    (chatId: string, newTitle: string) => {
      setChats((prevChats) => {
        const updatedChats = prevChats.map((chat) =>
          chat.id === chatId ? { ...chat, title: newTitle } : chat,
        )

        // Update current chat if it's the one being updated
        if (currentChat?.id === chatId) {
          setCurrentChat((prev) => ({ ...prev, title: newTitle }))
        }

        // Save to storage
        if (storeHistory) {
          const chatToUpdate = updatedChats.find((c) => c.id === chatId)
          if (chatToUpdate) {
            chatStorage.saveChat(chatToUpdate).catch((error) => {
              logError('Failed to update chat title in storage', error, {
                component: 'useChatStorage',
              })
            })
          }
        }

        return updatedChats
      })
    },
    [storeHistory, currentChat],
  )

  // Switch to a different chat
  const switchChat = useCallback(
    async (chat: Chat) => {
      // Save current chat before switching
      if (
        storeHistory &&
        currentChat &&
        currentChat.messages.length > 0 &&
        currentChat.id !== chat.id
      ) {
        try {
          await chatStorage.saveChat(currentChat)
        } catch (error) {
          logError('Failed to save current chat before switching', error, {
            component: 'useChatStorage',
          })
        }
      }

      setCurrentChat(chat)
    },
    [storeHistory, currentChat],
  )

  // Handle chat selection from sidebar
  const handleChatSelect = useCallback(
    (chatId: string) => {
      const selectedChat = chats.find((chat) => chat.id === chatId)
      if (selectedChat) {
        setCurrentChat(selectedChat)
      }
    },
    [chats],
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
