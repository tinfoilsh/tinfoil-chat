import { chatStorage } from '@/services/storage/chat-storage'
import { sessionChatStorage } from '@/services/storage/session-storage'
import { logError } from '@/utils/error-handling'
import type React from 'react'
import type { Chat, Message } from '../types'

/**
 * Chat Persistence Helper
 *
 * Handles saving chat updates to storage with these guarantees:
 * 1. Local-only chats are stored in IndexedDB but NEVER synced to cloud
 * 2. Cloud chats are stored in IndexedDB immediately, then synced to cloud
 * 3. Guest users' chats are stored in session storage only
 * 4. All saves happen immediately through a sequential queue (no debounce, no skipping)
 */

interface CreateUpdateChatWithHistoryCheckParams {
  storeHistory: boolean
  isStreamingRef: React.MutableRefObject<boolean>
  currentChatIdRef: React.MutableRefObject<string>
}

export function createUpdateChatWithHistoryCheck({
  storeHistory,
  isStreamingRef,
  currentChatIdRef,
}: CreateUpdateChatWithHistoryCheckParams) {
  return function updateChatWithHistoryCheck(
    setChats: React.Dispatch<React.SetStateAction<Chat[]>>,
    chatSnapshot: Chat,
    setCurrentChat: React.Dispatch<React.SetStateAction<Chat>>,
    chatId: string,
    newMessages: Message[],
    skipCloudSync = false,
  ) {
    const isCurrentChat = currentChatIdRef.current === chatId

    // Only update messages and set isBlankChat based on message count
    // Keep all other properties from chatSnapshot (including title, isLocalOnly, etc.)
    const updatedChat: Chat = {
      ...chatSnapshot,
      id: chatId,
      messages: newMessages,
      isBlankChat: newMessages.length === 0,
    }

    setChats((prevChats) => {
      return prevChats.map((c) => (c.id === chatId ? updatedChat : c))
    })

    if (isCurrentChat) {
      setCurrentChat(updatedChat)
    }

    if (storeHistory) {
      const shouldSkipCloudSync =
        skipCloudSync || updatedChat.isLocalOnly || isStreamingRef.current

      chatStorage
        .saveChat(updatedChat, shouldSkipCloudSync)
        .then((savedChat) => {
          if (savedChat.id !== updatedChat.id) {
            // ID changed (server assigned new ID)
            if (isCurrentChat && currentChatIdRef.current === updatedChat.id) {
              // If we're streaming, transfer the streaming state to the new ID
              if (isStreamingRef.current) {
                import('@/services/cloud/streaming-tracker').then(
                  ({ streamingTracker }) => {
                    streamingTracker.endStreaming(updatedChat.id)
                    streamingTracker.startStreaming(savedChat.id)
                  },
                )
              }
              currentChatIdRef.current = savedChat.id
              setCurrentChat(savedChat)
            }
            setChats((prevChats) =>
              prevChats.map((c) => (c.id === updatedChat.id ? savedChat : c)),
            )
          }
        })
        .catch((error) => {
          logError('Failed to save chat during update', error, {
            component: 'chat-persistence',
            metadata: {
              chatId,
              isLocalOnly: updatedChat.isLocalOnly,
            },
          })
        })
    } else {
      sessionChatStorage.saveChat(updatedChat)
    }
  }
}
