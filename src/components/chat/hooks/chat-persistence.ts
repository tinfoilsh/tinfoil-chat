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

    let updatedChatForSaving: Chat = {
      ...chatSnapshot,
      id: chatId,
      messages: newMessages,
      intendedLocalOnly: (chatSnapshot as any).intendedLocalOnly,
      isLocalOnly: (chatSnapshot as any).isLocalOnly,
    } as Chat

    setChats((prevChats) => {
      const currentChatFromState = prevChats.find((c) => c.id === chatId)

      // Merge current state with snapshot to preserve properties that may have been updated
      // (like title generation) while also applying new updates (like messages)
      if (currentChatFromState) {
        updatedChatForSaving = {
          ...currentChatFromState,
          ...chatSnapshot,
          messages: newMessages,
          // Explicitly preserve flags
          intendedLocalOnly:
            (chatSnapshot as any).intendedLocalOnly ??
            (currentChatFromState as any).intendedLocalOnly,
          isLocalOnly:
            (chatSnapshot as any).isLocalOnly ??
            currentChatFromState.isLocalOnly,
        }
      }

      return prevChats.map((c) => (c.id === chatId ? updatedChatForSaving : c))
    })

    if (isCurrentChat) {
      setCurrentChat(updatedChatForSaving)
    }

    if (!isThinking || immediate) {
      if (storeHistory) {
        const skipCloudSync = isStreamingRef.current && !immediate

        chatStorage
          .saveChat(updatedChatForSaving, skipCloudSync)
          .then((savedChat) => {
            // Only update refs if ID changed (for new chats getting server ID)
            if (savedChat.id !== updatedChatForSaving.id) {
              if (
                isCurrentChat &&
                currentChatIdRef.current === updatedChatForSaving.id
              ) {
                currentChatIdRef.current = savedChat.id
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
