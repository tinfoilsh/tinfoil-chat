import { chatStorage } from '@/services/storage/chat-storage'
import { sessionChatStorage } from '@/services/storage/session-storage'
import { logError } from '@/utils/error-handling'
import type React from 'react'
import type { Chat, Message } from '../types'

/**
 * Persistence helper for chat state.
 *
 * Guarantees:
 * - Writes to IndexedDB (or session storage for guests) on each incremental update.
 * - Defers cloud sync while streaming unless immediate=true to reduce churn.
 * - If the backend assigns a new id, rewrites ids consistently across state.
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
    immediate = false,
    isThinking = false,
  ) {
    const isCurrentChat = currentChatIdRef.current === chatId

    const updatedChatForSaving: Chat = {
      ...chatSnapshot,
      id: chatId,
      messages: newMessages,
    }

    if (isCurrentChat) setCurrentChat(updatedChatForSaving)

    setChats((prevChats) =>
      prevChats.map((c) => (c.id === chatId ? updatedChatForSaving : c)),
    )

    if ((!isThinking || immediate) && updatedChatForSaving) {
      if (storeHistory) {
        const skipCloudSync = isStreamingRef.current && !immediate

        chatStorage
          .saveChat(updatedChatForSaving, skipCloudSync)
          .then((savedChat) => {
            if (savedChat.id !== updatedChatForSaving.id) {
              currentChatIdRef.current = savedChat.id
              if (isCurrentChat) {
                setCurrentChat(savedChat)
              }
              setChats((prevChats) =>
                prevChats.map((c) =>
                  c.id === updatedChatForSaving.id ? savedChat : c,
                ),
              )
            }
          })
          .catch((error) => {
            logError('Failed to save chat during update', error, {
              component: 'chat-persistence',
            })
          })
      } else {
        sessionChatStorage.saveChat(updatedChatForSaving)
      }
    }
  }
}
