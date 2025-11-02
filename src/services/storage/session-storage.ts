import type { Chat } from '@/components/chat/types'
import { logError } from '@/utils/error-handling'

const SESSION_CHATS_KEY = 'tinfoil_session_chats'

export const sessionChatStorage = {
  // Get all chats from session storage
  getAllChats(): Chat[] {
    try {
      const chatsJson = sessionStorage.getItem(SESSION_CHATS_KEY)
      if (!chatsJson) return []

      const chats = JSON.parse(chatsJson)
      if (!Array.isArray(chats)) return []

      // Convert date strings back to Date objects
      return chats.map((chat) => ({
        ...chat,
        createdAt: new Date(chat.createdAt),
        messages: Array.isArray(chat.messages)
          ? chat.messages.map((msg: any) => ({
              ...msg,
              timestamp: new Date(msg.timestamp),
            }))
          : [], // Default to empty array if messages is not an array
      }))
    } catch (error) {
      logError('Failed to get chats from session storage', error, {
        component: 'sessionChatStorage',
        action: 'getAllChats',
      })
      return []
    }
  },

  // Save a chat to session storage
  saveChat(chat: Chat): void {
    try {
      // Validate chat parameter
      if (!chat) {
        logError(
          'Cannot save chat: chat parameter is undefined or null',
          undefined,
          {
            component: 'sessionChatStorage',
            action: 'saveChat',
          },
        )
        return
      }

      // Never save blank chats to storage
      if (chat.isBlankChat) {
        return
      }

      if (!chat.id) {
        logError('Cannot save chat: chat.id is undefined or null', undefined, {
          component: 'sessionChatStorage',
          action: 'saveChat',
        })
        return
      }

      const chats = this.getAllChats()
      const existingIndex = chats.findIndex((c) => c.id === chat.id)

      if (existingIndex >= 0) {
        chats[existingIndex] = chat
      } else {
        chats.push(chat)
      }

      sessionStorage.setItem(SESSION_CHATS_KEY, JSON.stringify(chats))
    } catch (error) {
      logError('Failed to save chat to session storage', error, {
        component: 'sessionChatStorage',
        action: 'saveChat',
        metadata: { chatId: chat?.id || 'undefined' },
      })
    }
  },

  // Delete a chat from session storage
  deleteChat(chatId: string): void {
    try {
      const chats = this.getAllChats()
      const filteredChats = chats.filter((c) => c.id !== chatId)
      sessionStorage.setItem(SESSION_CHATS_KEY, JSON.stringify(filteredChats))
    } catch (error) {
      logError('Failed to delete chat from session storage', error, {
        component: 'sessionChatStorage',
        action: 'deleteChat',
        metadata: { chatId },
      })
    }
  },

  // Clear all chats from session storage
  clearAll(): void {
    try {
      sessionStorage.removeItem(SESSION_CHATS_KEY)
    } catch (error) {
      logError('Failed to clear session storage', error, {
        component: 'sessionChatStorage',
        action: 'clearAll',
      })
    }
  },
}
