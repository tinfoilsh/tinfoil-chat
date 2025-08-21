import { logInfo } from '@/utils/error-handling'

const DELETED_CHATS_KEY = 'tinfoil-deleted-chats'
const EXPIRY_TIME = 5 * 60 * 1000 // 5 minutes

interface DeletedChatEntry {
  chatId: string
  deletedAt: number
}

class DeletedChatsTracker {
  private deletedChats: Map<string, number> = new Map()

  constructor() {
    this.loadFromStorage()
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return

    try {
      const stored = sessionStorage.getItem(DELETED_CHATS_KEY)
      if (stored) {
        const entries: DeletedChatEntry[] = JSON.parse(stored)
        const now = Date.now()

        // Only keep entries that aren't expired
        entries.forEach((entry) => {
          if (now - entry.deletedAt < EXPIRY_TIME) {
            this.deletedChats.set(entry.chatId, entry.deletedAt)
          }
        })

        // Update storage to remove expired entries
        this.saveToStorage()
      }
    } catch (error) {
      // Ignore errors loading from storage
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return

    const now = Date.now()
    const entries: DeletedChatEntry[] = []

    // Only save non-expired entries
    this.deletedChats.forEach((deletedAt, chatId) => {
      if (now - deletedAt < EXPIRY_TIME) {
        entries.push({ chatId, deletedAt })
      }
    })

    try {
      if (entries.length > 0) {
        sessionStorage.setItem(DELETED_CHATS_KEY, JSON.stringify(entries))
      } else {
        sessionStorage.removeItem(DELETED_CHATS_KEY)
      }
    } catch (error) {
      // Silently fail - storage may be unavailable or full
    }
  }

  markAsDeleted(chatId: string): void {
    this.deletedChats.set(chatId, Date.now())
    this.saveToStorage()

    logInfo('Marked chat as deleted', {
      component: 'DeletedChatsTracker',
      action: 'markAsDeleted',
      metadata: { chatId },
    })
  }

  isDeleted(chatId: string): boolean {
    const deletedAt = this.deletedChats.get(chatId)
    if (!deletedAt) return false

    const now = Date.now()
    const isExpired = now - deletedAt > EXPIRY_TIME

    if (isExpired) {
      // Remove expired entry
      this.deletedChats.delete(chatId)
      this.saveToStorage()
      return false
    }

    return true
  }

  removeFromDeleted(chatId: string): void {
    if (this.deletedChats.delete(chatId)) {
      this.saveToStorage()

      logInfo('Removed chat from deleted tracker', {
        component: 'DeletedChatsTracker',
        action: 'removeFromDeleted',
        metadata: { chatId },
      })
    }
  }

  clear(): void {
    this.deletedChats.clear()
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(DELETED_CHATS_KEY)
    }
  }

  getDeletedIds(): string[] {
    const now = Date.now()
    const validIds: string[] = []
    const expiredIds: string[] = []

    this.deletedChats.forEach((deletedAt, chatId) => {
      if (now - deletedAt < EXPIRY_TIME) {
        validIds.push(chatId)
      } else {
        expiredIds.push(chatId)
      }
    })

    // Remove expired entries from memory
    if (expiredIds.length > 0) {
      expiredIds.forEach((id) => this.deletedChats.delete(id))
      this.saveToStorage()
    }

    return validIds
  }
}

export const deletedChatsTracker = new DeletedChatsTracker()
