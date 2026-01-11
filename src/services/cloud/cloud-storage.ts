import { ensureValidISODate } from '@/utils/chat-timestamps'
import { logError } from '@/utils/error-handling'
import { isTokenValid } from '@/utils/token-validation'
import { encryptionService } from '../encryption/encryption-service'
import { DB_VERSION, type StoredChat } from '../storage/indexed-db'

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.tinfoil.sh'

export interface ChatListResponse {
  conversations: Array<{
    id: string
    key: string
    createdAt: string
    updatedAt: string
    title: string
    messageCount: number
    size: number
    content?: string
  }>
  nextContinuationToken?: string
  hasMore: boolean
}

export interface ChatSyncStatus {
  count: number
  lastUpdated: string | null
}

export interface ProfileSyncStatus {
  exists: boolean
  version?: number
  lastUpdated?: string
}

export class CloudStorageService {
  private getToken: (() => Promise<string | null>) | null = null

  setTokenGetter(getToken: () => Promise<string | null>) {
    this.getToken = getToken
  }

  async generateConversationId(timestamp?: string): Promise<{
    conversationId: string
    timestamp: string
    reverseTimestamp: number
  }> {
    const response = await fetch(`${API_BASE_URL}/api/chats/generate-id`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({ timestamp }),
    })

    if (!response.ok) {
      throw new Error(
        `Failed to generate conversation ID: ${response.statusText}`,
      )
    }

    return response.json()
  }

  private async getHeaders(): Promise<HeadersInit> {
    if (!this.getToken) {
      throw new Error('Token getter not set')
    }

    const token = await this.getToken()
    if (!token) {
      throw new Error('Failed to get authentication token')
    }

    if (!isTokenValid(token)) {
      throw new Error('Token is expired')
    }

    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  }

  async isAuthenticated(): Promise<boolean> {
    if (!this.getToken) return false
    const token = await this.getToken()
    return isTokenValid(token)
  }

  async uploadChat(chat: StoredChat): Promise<string | null> {
    let chatId = chat.id
    let chatToUpload = chat

    // If the chat has a temp ID, generate a proper server ID first
    if (chatId.startsWith('temp-')) {
      try {
        const result = await this.generateConversationId()
        chatId = result.conversationId
        chatToUpload = { ...chat, id: chatId }
      } catch (error) {
        logError(
          'Failed to generate server ID for temp chat, skipping upload',
          error,
          {
            component: 'CloudStorage',
            action: 'uploadChat',
            metadata: { tempId: chat.id },
          },
        )
        return null
      }
    }

    // Encrypt the chat data first
    await encryptionService.initialize()
    const encrypted = await encryptionService.encrypt(chatToUpload)

    // Metadata for the chat
    const metadata = {
      'db-version': String(DB_VERSION),
      'message-count': String(chat.messages?.length || 0),
      'chat-created-at': chat.createdAt,
      'chat-updated-at': chat.updatedAt,
    }

    // Upload through backend proxy to avoid CORS issues
    const response = await fetch(`${API_BASE_URL}/api/storage/conversation`, {
      method: 'PUT',
      headers: await this.getHeaders(),
      body: JSON.stringify({
        conversationId: chatId,
        data: JSON.stringify(encrypted),
        metadata,
        projectId: chat.projectId,
      }),
    })

    if (!response.ok) {
      throw new Error(`Failed to upload chat: ${response.statusText}`)
    }

    // Return the new ID if it changed, null otherwise
    return chatId !== chat.id ? chatId : null
  }

  async downloadChat(chatId: string): Promise<StoredChat | null> {
    try {
      // Download encrypted data directly from backend
      const response = await fetch(
        `${API_BASE_URL}/api/storage/conversation/${chatId}`,
        {
          headers: await this.getHeaders(),
        },
      )

      if (response.status === 404) {
        return null
      }

      if (!response.ok) {
        throw new Error(`Failed to download chat: ${response.statusText}`)
      }

      const encrypted = await response.json()

      // Try to decrypt the chat data
      try {
        await encryptionService.initialize()
        const decrypted = await encryptionService.decrypt(encrypted)
        return decrypted
      } catch (decryptError) {
        // If decryption fails, store the encrypted data for later retry
        const safeCreatedAt = ensureValidISODate(undefined, chatId)

        return {
          id: chatId,
          title: 'Encrypted',
          messages: [],
          createdAt: safeCreatedAt,
          updatedAt: new Date().toISOString(),
          lastAccessedAt: Date.now(),
          decryptionFailed: true,
          encryptedData: JSON.stringify(encrypted),
          syncedAt: Date.now(),
          locallyModified: false,
          syncVersion: 1,
        } as StoredChat
      }
    } catch (error) {
      logError(`Failed to download chat ${chatId}`, error, {
        component: 'CloudStorage',
        action: 'downloadChat',
        metadata: { chatId },
      })
      return null
    }
  }

  async listChats(options?: {
    limit?: number
    continuationToken?: string
    includeContent?: boolean
  }): Promise<ChatListResponse> {
    const params = new URLSearchParams()
    if (options?.limit) {
      params.append('limit', options.limit.toString())
    }
    if (options?.continuationToken) {
      params.append('continuationToken', options.continuationToken)
    }
    if (options?.includeContent) {
      params.append('includeContent', 'true')
    }

    // Add cache-busting parameter to avoid stale CDN/browser cache
    params.append('_t', Date.now().toString())

    const url = `${API_BASE_URL}/api/chats/list${params.toString() ? `?${params.toString()}` : ''}`
    const response = await fetch(url, {
      headers: await this.getHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Failed to list chats: ${response.statusText}`)
    }

    return response.json()
  }

  async updateMetadata(
    chatId: string,
    metadata: Record<string, string>,
  ): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/storage/metadata`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({
        conversationId: chatId,
        metadata,
      }),
    })

    if (!response.ok) {
      throw new Error(`Failed to update metadata: ${response.statusText}`)
    }
  }

  async deleteChat(chatId: string): Promise<void> {
    const response = await fetch(
      `${API_BASE_URL}/api/storage/conversation/${chatId}`,
      {
        method: 'DELETE',
        headers: await this.getHeaders(),
      },
    )

    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete chat: ${response.statusText}`)
    }
  }

  async getChatSyncStatus(): Promise<ChatSyncStatus> {
    // Add cache-busting parameter to avoid stale CDN/browser cache
    const url = `${API_BASE_URL}/api/chats/sync-status?_t=${Date.now()}`
    const response = await fetch(url, {
      headers: await this.getHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Failed to get chat sync status: ${response.statusText}`)
    }

    return response.json()
  }

  async getProfileSyncStatus(): Promise<ProfileSyncStatus> {
    const response = await fetch(`${API_BASE_URL}/api/profile/sync-status`, {
      headers: await this.getHeaders(),
    })

    if (!response.ok) {
      throw new Error(
        `Failed to get profile sync status: ${response.statusText}`,
      )
    }

    return response.json()
  }

  async getChatsUpdatedSince(options: {
    since: string
    includeContent?: boolean
  }): Promise<ChatListResponse> {
    const params = new URLSearchParams()
    params.append('since', options.since)
    if (options.includeContent) {
      params.append('includeContent', 'true')
    }
    // Add cache-busting parameter to avoid stale CDN/browser cache
    params.append('_t', Date.now().toString())

    const url = `${API_BASE_URL}/api/chats/updated-since?${params.toString()}`
    const response = await fetch(url, {
      headers: await this.getHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(
        `Failed to get chats updated since: ${response.statusText}`,
      )
    }

    return response.json()
  }
}

export const cloudStorage = new CloudStorageService()
