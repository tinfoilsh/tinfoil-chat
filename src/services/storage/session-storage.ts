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
      return Array.isArray(chats) ? chats : []
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
        metadata: { chatId: chat.id },
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
