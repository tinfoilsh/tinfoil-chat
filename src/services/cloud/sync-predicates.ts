/**
 * Sync Predicates
 *
 * Single source of truth for sync eligibility decisions.
 * These predicates centralize the logic for determining which chats
 * can be uploaded, downloaded, or retried for decryption.
 */

import type { StoredChat } from '@/services/storage/indexed-db'

/**
 * Determines if a chat is eligible for upload to the cloud.
 *
 * A chat is NOT uploadable if any of these conditions are true:
 * - isLocalOnly === true (user explicitly chose local storage)
 * - isBlankChat === true (empty placeholder chat)
 * - decryptionFailed === true (would overwrite server data with placeholder)
 * - encryptedData is present (not yet decrypted, same risk as above)
 * - currently streaming (incomplete data)
 *
 * @param chat The chat to check
 * @param isStreaming Optional function to check if chat is streaming
 * @returns true if the chat can be uploaded
 */
export function isUploadableChat(
  chat: StoredChat,
  isStreaming?: (chatId: string) => boolean,
): boolean {
  // Local-only chats are never uploaded
  if (chat.isLocalOnly === true) {
    return false
  }

  // Blank chats (empty placeholders) are never uploaded
  if ((chat as any).isBlankChat === true) {
    return false
  }

  // Chats that failed decryption should never be uploaded
  // (would overwrite real data with empty placeholder)
  if (chat.decryptionFailed === true) {
    return false
  }

  // Chats with encrypted data that hasn't been decrypted yet
  // should never be uploaded (same risk as above)
  if (chat.encryptedData) {
    return false
  }

  // Chats currently streaming have incomplete data
  if (isStreaming && isStreaming(chat.id)) {
    return false
  }

  return true
}

/**
 * Determines if a chat is a candidate for decryption retry.
 *
 * A chat should be retried if:
 * - decryptionFailed === true (previous decryption attempt failed)
 * - encryptedData is present (has encrypted blob waiting to be decrypted)
 *
 * @param chat The chat to check
 * @returns true if the chat should be retried for decryption
 */
export function isRetryDecryptCandidate(chat: StoredChat): boolean {
  return chat.decryptionFailed === true || !!chat.encryptedData
}

/**
 * Determines if a remote chat should be downloaded and stored locally.
 *
 * A remote chat should be ingested if:
 * - No local version exists
 * - Local version failed decryption (retry with potentially new key)
 * - Remote version is newer than local version
 *
 * @param remote The remote chat metadata
 * @param local The local chat (if exists)
 * @returns true if the remote chat should be downloaded
 */
export function shouldIngestRemoteChat(
  remote: { id: string; updatedAt?: string | null },
  local: StoredChat | null | undefined,
): boolean {
  // If no local chat exists, always ingest
  if (!local) {
    return true
  }

  // If local chat failed decryption, retry with remote data
  // (user may have added a new decryption key)
  if (local.decryptionFailed || local.encryptedData) {
    return true
  }

  // Compare timestamps - ingest if remote is newer
  if (remote.updatedAt) {
    const remoteTimestamp = new Date(remote.updatedAt).getTime()
    const localTimestamp = local.syncedAt || 0

    if (!isNaN(remoteTimestamp) && remoteTimestamp > localTimestamp) {
      return true
    }
  }

  return false
}

/**
 * Filters a list of chats to only those eligible for upload.
 *
 * @param chats List of chats to filter
 * @param isStreaming Optional function to check if a chat is streaming
 * @returns Filtered list of uploadable chats
 */
export function filterUploadableChats(
  chats: StoredChat[],
  isStreaming?: (chatId: string) => boolean,
): StoredChat[] {
  return chats.filter((chat) => isUploadableChat(chat, isStreaming))
}

/**
 * Filters a list of chats to only those that are candidates for decryption retry.
 *
 * @param chats List of chats to filter
 * @returns Filtered list of retry candidates
 */
export function filterRetryDecryptCandidates(
  chats: StoredChat[],
): StoredChat[] {
  return chats.filter(isRetryDecryptCandidate)
}
