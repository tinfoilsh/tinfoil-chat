import { logInfo } from '@/utils/error-handling'
import { indexedDBStorage, type StoredChat } from './indexed-db'

const CHATS_STORAGE_KEY = 'chats' // The key currently used by the app

interface LegacyChat {
  id: string
  title: string
  messages: Array<{
    role: string
    content: string
    timestamp?: string | Date
    documentContent?: string
    documents?: Array<{ name: string }>
    imageData?: Array<{ base64: string; mimeType: string }>
    thoughts?: string
    isThinking?: boolean
    isError?: boolean
  }>
  createdAt: string | Date
}

export interface MigrationResult {
  success: boolean
  migratedCount: number
  totalCount: number
  errors: string[]
}

// Helper function to convert legacy ID to new format
function convertToNewIdFormat(legacyId: string): string {
  // If ID already has the new format, return as is
  if (legacyId.includes('_') && /^\d+_/.test(legacyId)) {
    return legacyId
  }

  // Convert legacy ID to new format using current timestamp
  const timestamp = Date.now()
  const reverseTimestamp = 9999999999999 - timestamp
  return `${reverseTimestamp}_${legacyId}`
}

export class StorageMigration {
  async needsMigration(): Promise<boolean> {
    // Simply check if chats exist in localStorage
    const chatsData = localStorage.getItem(CHATS_STORAGE_KEY)
    return !!chatsData
  }

  async migrate(): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      migratedCount: 0,
      totalCount: 0,
      errors: [],
    }

    try {
      // Get chat data from localStorage
      const chatsDataStr = localStorage.getItem(CHATS_STORAGE_KEY)

      if (!chatsDataStr) {
        // No data to migrate
        result.success = true
        return result
      }

      // Parse chats
      let chats: LegacyChat[]
      try {
        chats = JSON.parse(chatsDataStr)
        if (!Array.isArray(chats)) {
          throw new Error('Chat data is not an array')
        }
      } catch (error) {
        result.errors.push(`Failed to parse chat data: ${error}`)
        return result
      }

      result.totalCount = chats.length

      // Initialize IndexedDB
      await indexedDBStorage.initialize()

      // Migrate each chat in reverse order (oldest first) to maintain proper timestamp-based IDs
      // This ensures older chats get smaller reverse timestamps in their IDs
      for (const legacyChat of chats.slice().reverse()) {
        // Skip empty chats (no messages)
        if (!legacyChat.messages || legacyChat.messages.length === 0) {
          logInfo('Skipping empty chat during migration', {
            component: 'StorageMigration',
            action: 'migrateLocalStorage',
            metadata: { chatId: legacyChat.id, title: legacyChat.title },
          })
          continue
        }

        try {
          const chat: StoredChat = {
            id: convertToNewIdFormat(legacyChat.id),
            title: legacyChat.title || 'Untitled Chat',
            messages: legacyChat.messages
              .filter((msg) => msg.content?.trim() || msg.thoughts?.trim())
              .map((msg) => ({
                role: (msg.role === 'user' ? 'user' : 'assistant') as
                  | 'user'
                  | 'assistant',
                content: msg.content,
                timestamp:
                  msg.timestamp instanceof Date
                    ? msg.timestamp
                    : msg.timestamp
                      ? new Date(msg.timestamp)
                      : new Date(),
                documentContent: msg.documentContent,
                documents: msg.documents,
                imageData: msg.imageData,
                thoughts: msg.thoughts,
                isThinking: msg.isThinking,
                isError: msg.isError,
              })),
            createdAt:
              typeof legacyChat.createdAt === 'string'
                ? legacyChat.createdAt
                : legacyChat.createdAt.toISOString(),
            updatedAt: new Date().toISOString(),
            // Include sync metadata directly to avoid double write
            locallyModified: true,
            syncVersion: 0,
            lastAccessedAt: Date.now(),
            // Don't set syncedAt - this indicates it needs to be synced
          }

          // Save the chat with sync metadata in a single operation
          await indexedDBStorage.saveChat(chat)

          result.migratedCount++
        } catch (error) {
          result.errors.push(
            `Failed to migrate chat ${legacyChat.id}: ${error}`,
          )
        }
      }

      // Mark migration as successful if all chats were migrated
      if (result.migratedCount === result.totalCount) {
        result.success = true
      }

      return result
    } catch (error) {
      result.errors.push(`Migration failed: ${error}`)
      return result
    }
  }

  async rollback(): Promise<void> {
    // Clear IndexedDB
    await indexedDBStorage.clearAll()
  }

  // Utility to check if localStorage has chat data
  hasLegacyData(): boolean {
    const data = localStorage.getItem(CHATS_STORAGE_KEY)
    if (!data) return false

    try {
      const parsed = JSON.parse(data)
      return Array.isArray(parsed) && parsed.length > 0
    } catch {
      return false
    }
  }

  // Clean up localStorage data after successful migration
  async cleanupLegacyData(): Promise<void> {
    // Simply remove the chats from localStorage
    localStorage.removeItem(CHATS_STORAGE_KEY)
  }
}

export const storageMigration = new StorageMigration()
