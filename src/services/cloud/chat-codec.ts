/**
 * Chat Codec
 *
 * Unified pipeline for processing remote chats - decryption and placeholder creation.
 * This module centralizes the decryption logic that was previously duplicated across
 * multiple sync methods.
 */

import { ensureValidISODate } from '@/utils/chat-timestamps'
import { logInfo } from '@/utils/error-handling'
import { encryptionService } from '../encryption/encryption-service'
import type { StoredChat } from '../storage/indexed-db'

/**
 * Remote chat data from the API
 */
export interface RemoteChatData {
  id: string
  content?: string | null
  createdAt?: string
  updatedAt?: string | null
  formatVersion?: number
}

/**
 * Result of processing a remote chat
 */
export interface ProcessedChatResult {
  /** The processed chat (decrypted or placeholder) */
  chat: StoredChat
  /** Processing status */
  status: 'decrypted' | 'decryption_failed' | 'corrupted' | 'no_content'
  /** Original encrypted data (only if decryption failed) */
  encryptedData?: string
}

/**
 * Options for processing a remote chat
 */
export interface ProcessRemoteChatOptions {
  /** Existing local chat (if any) - used to preserve project association */
  localChat?: StoredChat | null
  /** Project ID to associate with the chat */
  projectId?: string
}

/**
 * Process a remote chat - decrypt content or create a placeholder.
 *
 * This is the single pipeline for handling remote chat data:
 * 1. If content is present, attempt decryption
 * 2. If decryption succeeds, return decrypted chat
 * 3. If decryption fails, create a placeholder with encrypted data stored
 * 4. If no content, return a placeholder
 *
 * @param remote The remote chat data from the API
 * @param options Processing options
 * @returns Processed chat result
 */
export async function processRemoteChat(
  remote: RemoteChatData,
  options: ProcessRemoteChatOptions = {},
): Promise<ProcessedChatResult> {
  const { localChat, projectId } = options

  // Determine project ID - prefer explicit, then local chat's
  const effectiveProjectId = projectId ?? localChat?.projectId

  // Safe timestamps with fallbacks
  const safeCreatedAt = ensureValidISODate(remote.createdAt, remote.id)
  const safeUpdatedAt = ensureValidISODate(
    remote.updatedAt ?? remote.createdAt,
    remote.id,
  )

  // If no content, return a placeholder
  if (!remote.content) {
    logInfo('Remote chat has no content', {
      component: 'ChatCodec',
      action: 'processRemoteChat',
      metadata: { chatId: remote.id },
    })

    return {
      chat: createPlaceholderChat({
        id: remote.id,
        createdAt: safeCreatedAt,
        updatedAt: safeUpdatedAt,
        projectId: effectiveProjectId,
        status: 'no_content',
      }),
      status: 'no_content',
    }
  }

  // Try to decrypt the content
  try {
    const encrypted = JSON.parse(remote.content)
    const decrypted = await encryptionService.decrypt(encrypted)

    // Ensure timestamps are valid
    const chat: StoredChat = {
      ...decrypted,
      id: remote.id, // Always use the remote ID
      createdAt: ensureValidISODate(
        decrypted.createdAt ?? remote.createdAt,
        remote.id,
      ),
      updatedAt: ensureValidISODate(
        decrypted.updatedAt ?? remote.updatedAt ?? remote.createdAt,
        remote.id,
      ),
      lastAccessedAt: Date.now(),
      syncedAt: Date.now(),
      locallyModified: false,
      syncVersion: decrypted.syncVersion ?? 1,
      // Explicit projectId from caller is authoritative (e.g. cross-scope sync);
      // fall back to the blob's value, then the local chat's value
      projectId: projectId ?? decrypted.projectId ?? localChat?.projectId,
    }

    return {
      chat,
      status: 'decrypted',
    }
  } catch (decryptError) {
    // Determine if this is data corruption vs wrong key
    const isCorrupted =
      decryptError instanceof Error &&
      decryptError.message.includes('DATA_CORRUPTED')

    const status = isCorrupted ? 'corrupted' : 'decryption_failed'

    logInfo(`Failed to decrypt chat: ${status}`, {
      component: 'ChatCodec',
      action: 'processRemoteChat',
      metadata: {
        chatId: remote.id,
        isCorrupted,
        error:
          decryptError instanceof Error
            ? decryptError.message
            : 'Unknown error',
      },
    })

    return {
      chat: createPlaceholderChat({
        id: remote.id,
        createdAt: safeCreatedAt,
        updatedAt: safeUpdatedAt,
        projectId: effectiveProjectId,
        status,
        encryptedData: remote.content,
        dataCorrupted: isCorrupted,
      }),
      status,
      encryptedData: remote.content,
    }
  }
}

/**
 * Options for creating a placeholder chat
 */
interface PlaceholderOptions {
  id: string
  createdAt: string
  updatedAt: string
  projectId?: string
  status: 'decryption_failed' | 'corrupted' | 'no_content'
  encryptedData?: string
  dataCorrupted?: boolean
}

/**
 * Create a placeholder chat for failed decryption or missing content.
 */
function createPlaceholderChat(options: PlaceholderOptions): StoredChat {
  const {
    id,
    createdAt,
    updatedAt,
    projectId,
    status,
    encryptedData,
    dataCorrupted,
  } = options

  return {
    id,
    title: 'Encrypted',
    messages: [],
    createdAt,
    updatedAt,
    lastAccessedAt: Date.now(),
    decryptionFailed: status !== 'no_content',
    dataCorrupted: dataCorrupted ?? false,
    encryptedData,
    syncedAt: Date.now(),
    locallyModified: false,
    syncVersion: 1,
    projectId,
  } as StoredChat
}

/**
 * Process multiple remote chats in sequence.
 *
 * @param remoteChats Array of remote chats to process
 * @param localChatMap Map of local chats by ID
 * @returns Array of processed chat results
 */
export async function processRemoteChats(
  remoteChats: RemoteChatData[],
  localChatMap: Map<string, StoredChat>,
): Promise<ProcessedChatResult[]> {
  const results: ProcessedChatResult[] = []

  for (const remote of remoteChats) {
    const localChat = localChatMap.get(remote.id)
    const result = await processRemoteChat(remote, { localChat })
    results.push(result)
  }

  return results
}
