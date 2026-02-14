import type { Attachment, Message } from '@/components/chat/types'
import { decryptAttachment, encryptAttachment } from '@/utils/binary-codec'
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
    syncVersion: number
    size: number
    formatVersion: number
    content?: string
    projectId?: string
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

export type RawChatContent =
  | { content: string; formatVersion: 0 }
  | { binaryContent: ArrayBuffer; formatVersion: 1 }

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
    const messages: Message[] = (chat.messages as Message[]) || []

    // Step 1: Collect image attachments that have base64 data to upload
    const attachmentsToUpload: {
      attachment: Attachment
      base64Data: string
    }[] = []
    for (const msg of messages) {
      for (const att of msg.attachments || []) {
        if (att.type === 'image' && att.base64) {
          attachmentsToUpload.push({ attachment: att, base64Data: att.base64 })
        }
      }
    }

    // Step 2: Encrypt and upload each image attachment separately
    for (const { attachment, base64Data } of attachmentsToUpload) {
      const raw = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0))
      const { encryptedData, key, iv } = await encryptAttachment(raw)
      await this.uploadAttachment(attachment.id, chat.id, encryptedData)

      // Store key material on the attachment for inclusion in chat JSON
      attachment.encryptionKey = btoa(
        String.fromCharCode.apply(null, Array.from(key)),
      )
      attachment.encryptionIV = btoa(
        String.fromCharCode.apply(null, Array.from(iv)),
      )
    }

    // Step 3: Build a stripped copy — remove base64 blobs, keep thumbnails + key material
    const strippedMessages = messages.map((msg) => ({
      ...msg,
      attachments: msg.attachments?.map((att) => {
        if (att.type === 'image' && att.base64) {
          const { base64: _removed, ...rest } = att
          return rest
        }
        return att
      }),
    }))

    const strippedChat = {
      ...chat,
      messages: strippedMessages,
    }

    // Step 4: Compress + encrypt to v1 binary
    const binary = await encryptionService.encryptV1(strippedChat)

    // Step 5: Upload binary to v1 endpoint
    const headers: Record<string, string> = {
      ...(await this.getHeaders()),
      'Content-Type': 'application/octet-stream',
      'X-Message-Count': String(messages.length),
    }
    if (chat.projectId) {
      headers['X-Project-Id'] = chat.projectId
    }

    const response = await fetch(
      `${API_BASE_URL}/api/storage/conversation/${chat.id}/data`,
      {
        method: 'PUT',
        headers,
        body: binary,
      },
    )

    if (!response.ok) {
      throw new Error(`Failed to upload chat: ${response.statusText}`)
    }

    return null
  }

  private async uploadAttachment(
    attachmentId: string,
    chatId: string,
    encryptedData: Uint8Array,
  ): Promise<void> {
    const response = await fetch(
      `${API_BASE_URL}/api/storage/attachment/${attachmentId}`,
      {
        method: 'PUT',
        headers: {
          ...(await this.getHeaders()),
          'Content-Type': 'application/octet-stream',
          'X-Chat-Id': chatId,
        },
        body: encryptedData,
      },
    )

    if (!response.ok) {
      throw new Error(
        `Failed to upload attachment ${attachmentId}: ${response.statusText}`,
      )
    }
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
   * Returns v0 JSON string or v1 binary ArrayBuffer based on X-Format-Version header.
   */
  async fetchRawChatContent(chatId: string): Promise<RawChatContent | null> {
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

    const formatVersion = parseInt(
      response.headers.get('X-Format-Version') || '0',
      10,
    )

    if (formatVersion === 1) {
      const binaryContent = await response.arrayBuffer()
      return { binaryContent, formatVersion: 1 }
    }

    const content = await response.text()
    return { content, formatVersion: 0 }
  }

  async downloadChat(chatId: string): Promise<StoredChat | null> {
    try {
      const raw = await this.fetchRawChatContent(chatId)

      if (raw === null) {
        return null
      }

      const remote: RemoteChatData = {
        id: chatId,
        ...(raw.formatVersion === 1
          ? { binaryContent: raw.binaryContent, formatVersion: 1 }
          : { content: raw.content, formatVersion: 0 }),
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

  /**
   * Fetch a single encrypted attachment blob by ID.
   */
  async fetchAttachment(attachmentId: string): Promise<ArrayBuffer | null> {
    const response = await fetch(
      `${API_BASE_URL}/api/storage/attachment/${attachmentId}`,
    )

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      throw new Error(
        `Failed to fetch attachment ${attachmentId}: ${response.statusText}`,
      )
    }

    return response.arrayBuffer()
  }

  /**
   * Fetch and decrypt all image attachments for a v1 chat, populating the base64 field
   * on each attachment in-place. Attachments that fail to load are silently skipped.
   */
  async loadChatImages(chat: StoredChat): Promise<void> {
    const messages = (chat.messages as Message[]) || []
    const tasks: Promise<void>[] = []

    for (const msg of messages) {
      for (const att of msg.attachments || []) {
        if (att.type !== 'image' || !att.encryptionKey || att.base64) {
          continue
        }

        tasks.push(
          (async () => {
            try {
              const encryptedBuf = await this.fetchAttachment(att.id)
              if (!encryptedBuf) return

              const keyBytes = Uint8Array.from(atob(att.encryptionKey!), (c) =>
                c.charCodeAt(0),
              )
              const decrypted = await decryptAttachment(
                new Uint8Array(encryptedBuf),
                keyBytes,
              )

              // Convert raw bytes back to base64 for display
              const CHUNK_SIZE = 0x8000
              const chunks: string[] = []
              for (let i = 0; i < decrypted.length; i += CHUNK_SIZE) {
                const chunk = decrypted.subarray(i, i + CHUNK_SIZE)
                chunks.push(String.fromCharCode.apply(null, Array.from(chunk)))
              }
              att.base64 = btoa(chunks.join(''))
            } catch {
              // Silently skip failed attachments — thumbnail is still available
            }
          })(),
        )
      }
    }

    await Promise.all(tasks)
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
    continuationToken?: string
  }): Promise<ChatListResponse> {
    const params = new URLSearchParams()
    params.append('since', options.since)
    if (options.includeContent) {
      params.append('includeContent', 'true')
    }
    if (options.continuationToken) {
      params.append('continuationToken', options.continuationToken)
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

  async getAllChatsSyncStatus(): Promise<ChatSyncStatus> {
    const url = `${API_BASE_URL}/api/chats/all-sync-status?_t=${Date.now()}`
    const response = await fetch(url, {
      headers: await this.getHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(
        `Failed to get all chats sync status: ${response.statusText}`,
      )
    }

    return response.json()
  }

  async getAllChatsUpdatedSince(options: {
    since: string
    continuationToken?: string
  }): Promise<ChatListResponse> {
    const params = new URLSearchParams()
    params.append('since', options.since)
    if (options.continuationToken) {
      params.append('continuationToken', options.continuationToken)
    }
    params.append('_t', Date.now().toString())

    const url = `${API_BASE_URL}/api/chats/all-updated-since?${params.toString()}`
    const response = await fetch(url, {
      headers: await this.getHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(
        `Failed to get all chats updated since: ${response.statusText}`,
      )
    }

    return response.json()
  }
}

export const cloudStorage = new CloudStorageService()
