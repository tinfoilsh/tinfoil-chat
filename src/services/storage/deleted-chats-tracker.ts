import { logInfo } from '@/utils/error-handling'

const DELETED_CHATS_KEY = 'tinfoil-deleted-chats'

/**
 * Tracks deleted chats to prevent resurrection during sync.
 * IDs persist for the browser session (via sessionStorage) and are only
 * removed explicitly via removeFromDeleted() or clear().
 */
class DeletedChatsTracker {
  private deletedChats: Set<string> = new Set()

  constructor() {
    this.loadFromStorage()
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return
    try {
      const stored = sessionStorage.getItem(DELETED_CHATS_KEY)
      if (stored) {
        const parsed: unknown[] = JSON.parse(stored)
        parsed.forEach((entry) => {
          if (typeof entry === 'string') {
            this.deletedChats.add(entry)
          } else if (entry && typeof entry === 'object' && 'chatId' in entry) {
            // Backward compat with old {chatId, deletedAt} format
            this.deletedChats.add((entry as { chatId: string }).chatId)
          }
        })
        this.saveToStorage()
      }
    } catch (error) {
      // Ignore errors loading from storage
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return
    try {
      const ids = Array.from(this.deletedChats)
      if (ids.length > 0) {
        sessionStorage.setItem(DELETED_CHATS_KEY, JSON.stringify(ids))
      } else {
        sessionStorage.removeItem(DELETED_CHATS_KEY)
      }
    } catch (error) {
      // Silently fail - storage may be unavailable or full
    }
  }

  markAsDeleted(chatId: string): void {
    this.deletedChats.add(chatId)
    this.saveToStorage()

    logInfo('Marked chat as deleted', {
      component: 'DeletedChatsTracker',
      action: 'markAsDeleted',
      metadata: { chatId },
    })
  }

  isDeleted(chatId: string): boolean {
    return this.deletedChats.has(chatId)
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
    return Array.from(this.deletedChats)
  }
}

export const deletedChatsTracker = new DeletedChatsTracker()
