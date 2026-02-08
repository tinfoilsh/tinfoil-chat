import { logError } from '@/utils/error-handling'
import { authTokenManager } from '../auth'
import { encryptionService } from '../encryption/encryption-service'
import { DB_VERSION, type StoredChat } from '../storage/indexed-db'
import { processRemoteChat, type RemoteChatData } from './chat-codec'

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

export interface BulkConversationResult {
  conversationId: string
  success: boolean
  error?: string
}

export interface BulkUploadResponse {
  results: BulkConversationResult[]
  succeeded: number
  failed: number
}

export class CloudStorageService {
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
    return authTokenManager.getAuthHeaders()
  }

  async isAuthenticated(): Promise<boolean> {
    return authTokenManager.isAuthenticated()
  }

  async uploadChat(chat: StoredChat): Promise<string | null> {
    // Encrypt the chat data first
    const encrypted = await encryptionService.encrypt(chat)

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
        conversationId: chat.id,
        data: JSON.stringify(encrypted),
        metadata,
        projectId: chat.projectId,
      }),
    })

    if (!response.ok) {
      throw new Error(`Failed to upload chat: ${response.statusText}`)
    }

    return null
  }

  async bulkUploadChats(
    chats: Array<{
      id: string
      title: string
      messages: Array<unknown>
      createdAt: Date | string
      projectId?: string
      isLocalOnly?: boolean
    }>,
  ): Promise<BulkUploadResponse> {
    if (chats.length === 0) {
      return { results: [], succeeded: 0, failed: 0 }
    }

    if (chats.length > 100) {
      throw new Error('Maximum 100 chats per bulk upload request')
    }

    // Encrypt all chats in parallel
    const conversations = await Promise.all(
      chats.map(async (chat) => {
        const encrypted = await encryptionService.encrypt(chat)
        const createdAtStr =
          chat.createdAt instanceof Date
            ? chat.createdAt.toISOString()
            : chat.createdAt
        return {
          conversationId: chat.id,
          data: JSON.stringify(encrypted),
          metadata: {
            'db-version': String(DB_VERSION),
            'message-count': String(chat.messages?.length || 0),
            'chat-created-at': createdAtStr,
            'chat-updated-at': new Date().toISOString(),
          },
          projectId: chat.projectId,
        }
      }),
    )

    const response = await fetch(
      `${API_BASE_URL}/api/storage/conversations/bulk`,
      {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify({ conversations }),
      },
    )

    if (!response.ok) {
      throw new Error(`Bulk upload failed: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Fetch raw encrypted content for a single chat by ID.
   * Returns the raw JSON string, or null if not found.
   */
  async fetchRawChatContent(chatId: string): Promise<string | null> {
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

    return response.text()
  }

  async downloadChat(chatId: string): Promise<StoredChat | null> {
    try {
      const rawContent = await this.fetchRawChatContent(chatId)

      if (rawContent === null) {
        return null
      }

      const remote: RemoteChatData = {
        id: chatId,
        content: rawContent,
      }

      const result = await processRemoteChat(remote)
      return result.chat
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

  async updateChatProject(
    chatId: string,
    projectId: string | null,
  ): Promise<void> {
    const response = await fetch(
      `${API_BASE_URL}/api/storage/conversation/${chatId}/project`,
      {
        method: 'PATCH',
        headers: await this.getHeaders(),
        body: JSON.stringify({ projectId }),
      },
    )

    if (!response.ok) {
      throw new Error(`Failed to update chat project: ${response.statusText}`)
    }
  }

  async getDeletedChatsSince(since: string): Promise<{ deletedIds: string[] }> {
    const params = new URLSearchParams()
    params.append('since', since)
    params.append('_t', Date.now().toString())

    const url = `${API_BASE_URL}/api/chats/deleted-since?${params.toString()}`
    const response = await fetch(url, {
      headers: await this.getHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(
        `Failed to get deleted chats since: ${response.statusText}`,
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
