import { encryptionService } from '../encryption/encryption-service'
import type { StoredChat } from '../storage/indexed-db'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.tinfoil.sh'

export interface PresignedUrlResponse {
  url: string
  key: string
}

export interface ChatListResponse {
  chats: Array<{
    id: string
    key: string
    lastModified: string
    size: number
  }>
}

export class R2StorageService {
  private authToken: string | null = null

  setAuthToken(token: string) {
    this.authToken = token
  }

  private async getHeaders(): Promise<HeadersInit> {
    if (!this.authToken) {
      throw new Error('Authentication token not set')
    }

    return {
      Authorization: `Bearer ${this.authToken}`,
      'Content-Type': 'application/json',
    }
  }

  async getPresignedUrl(
    operation: 'get' | 'put',
    chatId: string,
  ): Promise<PresignedUrlResponse> {
    const response = await fetch(`${API_BASE_URL}/api/storage/presign`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({
        operation,
        chatId,
      }),
    })

    if (!response.ok) {
      throw new Error(`Failed to get presigned URL: ${response.statusText}`)
    }

    return response.json()
  }

  async uploadChat(chat: StoredChat): Promise<void> {
    // Get presigned URL for upload
    const { url } = await this.getPresignedUrl('put', chat.id)

    // Encrypt the chat data
    await encryptionService.initialize()
    const encrypted = await encryptionService.encrypt(chat)

    // Upload encrypted data
    const response = await fetch(url, {
      method: 'PUT',
      body: JSON.stringify(encrypted),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to upload chat: ${response.statusText}`)
    }
  }

  async downloadChat(chatId: string): Promise<StoredChat | null> {
    try {
      // Get presigned URL for download
      const { url } = await this.getPresignedUrl('get', chatId)

      // Download encrypted data
      const response = await fetch(url)

      if (response.status === 404) {
        return null
      }

      if (!response.ok) {
        throw new Error(`Failed to download chat: ${response.statusText}`)
      }

      const encrypted = await response.json()

      // Decrypt the chat data
      await encryptionService.initialize()
      const decrypted = await encryptionService.decrypt(encrypted)

      return decrypted
    } catch (error) {
      console.error(`Failed to download chat ${chatId}:`, error)
      return null
    }
  }

  async listChats(): Promise<ChatListResponse> {
    const response = await fetch(`${API_BASE_URL}/api/storage/chats`, {
      headers: await this.getHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Failed to list chats: ${response.statusText}`)
    }

    return response.json()
  }

  async deleteChat(chatId: string): Promise<void> {
    const response = await fetch(
      `${API_BASE_URL}/api/storage/chats/${chatId}`,
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
