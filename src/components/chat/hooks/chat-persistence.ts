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

    // Prepare the updated chat by getting current state
    let updatedChatForSaving: Chat

    // First, determine the base chat to use
    let baseChat = chatSnapshot
    setChats((prevChats) => {
      const currentChatFromState = prevChats.find((c) => c.id === chatId)
      // Use the current chat from state if available, otherwise fall back to snapshot
      // This ensures we preserve any updates that happened during streaming (like title changes)
      if (currentChatFromState) {
        baseChat = currentChatFromState
      }

      updatedChatForSaving = {
        ...baseChat,
        id: chatId,
        messages: newMessages,
      }

      return prevChats.map((c) => (c.id === chatId ? updatedChatForSaving : c))
    })

    // At this point updatedChatForSaving is definitely assigned
    updatedChatForSaving = {
      ...baseChat,
      id: chatId,
      messages: newMessages,
    }

    if (isCurrentChat) {
      setCurrentChat(updatedChatForSaving)
    }

    if (!isThinking || immediate) {
      if (storeHistory) {
        const skipCloudSync = isStreamingRef.current && !immediate
        const chatToSave = updatedChatForSaving

        chatStorage
          .saveChat(chatToSave, skipCloudSync)
          .then((savedChat) => {
            if (savedChat.id !== chatToSave.id) {
              // Only switch currentChatIdRef if this chat is still the current chat
              if (isCurrentChat && currentChatIdRef.current === chatToSave.id) {
                currentChatIdRef.current = savedChat.id
                setCurrentChat(savedChat)
              }
              setChats((prevChats) =>
                prevChats.map((c) => (c.id === chatToSave.id ? savedChat : c)),
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
