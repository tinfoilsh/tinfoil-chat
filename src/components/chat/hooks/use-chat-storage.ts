import { logError } from '@/utils/error-handling'
import { useCallback, useEffect, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { CONSTANTS } from '../constants'
import type { Chat } from '../types'

// Utility function to remove imageData from messages before localStorage storage
// This prevents hitting browser storage quotas since base64 images can be very large
const stripImageDataForStorage = (chats: Chat[]): Chat[] => {
  return chats.map((chat) => ({
    ...chat,
    messages: chat.messages.map((msg) => {
      const { imageData, ...msgWithoutImageData } = msg
      return msgWithoutImageData
    }),
  }))
}

interface UseChatStorageProps {
  storeHistory: boolean
  isClient: boolean
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
}

export function useChatStorage({
  storeHistory,
  isClient,
}: UseChatStorageProps): UseChatStorageReturn {
  const [isInitialLoad, setIsInitialLoad] = useState(true)

  const [chats, setChats] = useState<Chat[]>(() => {
    const defaultChat: Chat = {
      id: uuidv4(),
      title: 'New Chat',
      messages: [],
      createdAt: new Date(),
    }

    // Return default chat for server-side rendering
    if (typeof window === 'undefined') {
      return [defaultChat]
    }

    // Return default chat initially, then load from storage asynchronously
    return [defaultChat]
  })

  // Initialize currentChat with the first chat
  const [currentChat, setCurrentChat] = useState<Chat>(chats[0])

  // Load chats from storage asynchronously
  useEffect(() => {
    if (storeHistory && typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('chats')
        if (saved) {
          const savedChats = JSON.parse(saved)
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
              const newChat: Chat = {
                id: uuidv4(),
                title: 'New Chat',
                messages: [],
                createdAt: new Date(),
              }
              const updatedChats = [newChat, ...parsedChats]
              setChats(updatedChats)
              setCurrentChat(newChat)
              localStorage.setItem(
                'chats',
                JSON.stringify(stripImageDataForStorage(updatedChats)),
              )
            } else {
              // If the latest chat is empty, use it
              setCurrentChat(firstChat)
            }
          }
        }
        // Clear initial load state after loading chats
        setIsInitialLoad(false)
      } catch (error) {
        logError('Failed to load chats from localStorage', error, {
          component: 'useChatStorage',
        })
        setIsInitialLoad(false)
      }
    } else {
      // If not storing history, clear initial load immediately
      setIsInitialLoad(false)
    }
  }, [storeHistory])

  // Create a new chat
  const createNewChat = useCallback(() => {
    if (!storeHistory) return // Prevent creating new chats for basic users

    // Don't create a new chat if the current chat is already empty
    if (currentChat?.messages?.length === 0) {
      return // Current chat is already empty, no need to create a new one
    }

    const newChat: Chat = {
      id: uuidv4(),
      title: 'New Chat',
      messages: [],
      createdAt: new Date(),
    }
    setCurrentChat(newChat)

    // Update chats array by adding the new chat at the beginning
    setChats((prev) => {
      const updatedChats = [newChat, ...prev]
      // Save to localStorage explicitly
      if (storeHistory) {
        localStorage.setItem(
          'chats',
          JSON.stringify(stripImageDataForStorage(updatedChats)),
        )
      }
      return updatedChats
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
          const newChat: Chat = {
            id: uuidv4(),
            title: 'New Chat',
            messages: [],
            createdAt: new Date(),
          }
          setCurrentChat(newChat)
          return [newChat]
        }

        // If we deleted the current chat, switch to the first remaining chat
        if (currentChat?.id === chatId) {
          setCurrentChat(newChats[0])
        }

        localStorage.setItem(
          'chats',
          JSON.stringify(stripImageDataForStorage(newChats)),
        )
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
        localStorage.setItem(
          'chats',
          JSON.stringify(stripImageDataForStorage(updatedChats)),
        )
        return updatedChats
      })

      // Also update current chat if it's the one being edited
      if (currentChat?.id === chatId) {
        setCurrentChat((prev) => ({ ...prev, title: newTitle }))
      }
    },
    [storeHistory, currentChat?.id],
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
  }
}
