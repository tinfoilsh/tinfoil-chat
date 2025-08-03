import { logError } from '@/utils/error-handling'
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

export class R2StorageService {
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

    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  }

  async isAuthenticated(): Promise<boolean> {
    if (!this.getToken) return false
    const token = await this.getToken()
    return token !== null && token !== ''
  }

  async uploadChat(chat: StoredChat): Promise<void> {
    // Encrypt the chat data first
    await encryptionService.initialize()
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
      }),
    })

    if (!response.ok) {
      throw new Error(`Failed to upload chat: ${response.statusText}`)
    }
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
        // Extract timestamp from the chat ID to use as createdAt
        const timestamp = chatId.split('_')[0]
        const parsedTimestamp = parseInt(timestamp, 10)
        const createdAtMs = !isNaN(parsedTimestamp)
          ? 9999999999999 - parsedTimestamp
          : Date.now()

        return {
          id: chatId,
          title: 'Encrypted',
          messages: [],
          createdAt: new Date(createdAtMs).toISOString(),
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
        component: 'R2Storage',
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

    const url = `${API_BASE_URL}/api/chats/list${params.toString() ? `?${params.toString()}` : ''}`
    const response = await fetch(url, {
      headers: await this.getHeaders(),
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
}

export const r2Storage = new R2StorageService()
