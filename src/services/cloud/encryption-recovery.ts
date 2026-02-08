/**
 * Encryption Recovery
 *
 * Standalone operations for retrying decryption of chats that failed to decrypt
 * (e.g. after a key rotation) and re-encrypting all local chats with a new key.
 * These don't interact with the sync lock or sync caches.
 */

import { logError, logInfo } from '@/utils/error-handling'
import { encryptionService } from '../encryption/encryption-service'
import { indexedDBStorage, type StoredChat } from '../storage/indexed-db'
import { cloudStorage } from './cloud-storage'
import { isUploadableChat } from './sync-predicates'

// Retry decryption for chats that failed to decrypt
export async function retryDecryptionWithNewKey(
  options: {
    onProgress?: (current: number, total: number) => void
    batchSize?: number
  } = {},
): Promise<number> {
  const { onProgress } = options
  // Ensure batchSize is a positive integer, default to 5 if invalid
  const batchSize = Math.max(1, Math.floor(options.batchSize || 5))
  let decryptedCount = 0
  let chatsWithEncryptedData: any[] = []

  try {
    // Get all chats that have encrypted data
    chatsWithEncryptedData = await indexedDBStorage.getChatsWithEncryptedData()

    const total = chatsWithEncryptedData.length

    // Process chats in batches to avoid blocking the UI
    for (let i = 0; i < chatsWithEncryptedData.length; i += batchSize) {
      const batch = chatsWithEncryptedData.slice(i, i + batchSize)

      // Process batch in parallel
      const batchPromises = batch.map(async (chat) => {
        try {
          // Parse the stored encrypted data
          const encryptedData = JSON.parse(chat.encryptedData)

          // Decrypt the chat data
          const decryptedData = await encryptionService.decrypt(encryptedData)

          logInfo(`Decrypted chat ${chat.id}`, {
            component: 'CloudSync',
            action: 'retryDecryptionWithNewKey',
            metadata: {
              chatId: chat.id,
              decryptedTitle: decryptedData.title,
              messageCount: decryptedData.messages?.length || 0,
            },
          })

          // Create properly decrypted chat with original data
          const updatedChat: StoredChat = {
            ...decryptedData, // Use all decrypted data first
            id: chat.id, // Preserve the original ID
            decryptionFailed: false,
            encryptedData: undefined,
            syncedAt: chat.syncedAt,
            syncVersion: chat.syncVersion,
            locallyModified: false,
          }

          await indexedDBStorage.saveChat(updatedChat)
          return true
        } catch (error) {
          logError(`Failed to decrypt chat ${chat.id}`, error, {
            component: 'CloudSync',
            action: 'retryDecryptionWithNewKey',
            metadata: { chatId: chat.id },
          })
          return false
        }
      })

      const results = await Promise.all(batchPromises)
      decryptedCount += results.filter(Boolean).length

      // Report progress
      if (onProgress) {
        onProgress(Math.min(i + batchSize, total), total)
      }

      // Yield to the event loop between batches
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  } catch (error) {
    logError('Failed to retry decryptions', error, {
      component: 'CloudSync',
      action: 'retryDecryptionWithNewKey',
    })
  }

  return decryptedCount
}

// Re-encrypt all local chats with new key and upload to cloud
export async function reencryptAndUploadChats(): Promise<{
  reencrypted: number
  uploaded: number
  errors: string[]
}> {
  const result = {
    reencrypted: 0,
    uploaded: 0,
    errors: [] as string[],
  }

  try {
    // Get all local chats
    const allChats = await indexedDBStorage.getAllChats()

    logInfo('Starting re-encryption of local chats', {
      component: 'CloudSync',
      action: 'reencryptAndUploadChats',
      metadata: { totalChats: allChats.length },
    })

    for (const chat of allChats) {
      try {
        // Use centralized predicate for upload eligibility
        // Note: No streaming check needed here since we're processing all chats in sequence
        if (!isUploadableChat(chat)) {
          if (chat.isLocalOnly || chat.decryptionFailed || chat.encryptedData) {
            logInfo('Skipping ineligible chat during re-encryption', {
              component: 'CloudSync',
              action: 'reencryptAndUploadChats',
              metadata: {
                chatId: chat.id,
                isLocalOnly: chat.isLocalOnly,
                isBlankChat: chat.isBlankChat,
                decryptionFailed: chat.decryptionFailed,
                hasEncryptedData: !!chat.encryptedData,
                dataCorrupted: chat.dataCorrupted,
              },
            })
          }
          continue
        }

        // For encrypted chats, they need to be decrypted first (handled by isUploadableChat above)
        // For decrypted chats, we can directly work with them
        let chatToReencrypt = chat

        // Re-encrypt the chat with the new key by forcing a sync
        // The sync process will automatically encrypt with the current key
        if (await cloudStorage.isAuthenticated()) {
          // Increment sync version to force upload
          chatToReencrypt.syncVersion = (chatToReencrypt.syncVersion || 0) + 1

          // Save locally with new sync version
          await indexedDBStorage.saveChat(chatToReencrypt)

          // Upload to cloud (will be encrypted with new key)
          await cloudStorage.uploadChat(chatToReencrypt)

          await indexedDBStorage.markAsSynced(
            chatToReencrypt.id,
            chatToReencrypt.syncVersion || 0,
          )
          result.uploaded++
          result.reencrypted++

          logInfo('Chat re-encrypted and uploaded', {
            component: 'CloudSync',
            action: 'reencryptAndUploadChats',
            metadata: {
              chatId: chatToReencrypt.id,
              syncVersion: chatToReencrypt.syncVersion,
            },
          })
        }
      } catch (error) {
        const errorMsg = `Failed to re-encrypt chat ${chat.id}: ${error instanceof Error ? error.message : String(error)}`
        result.errors.push(errorMsg)
        logError('Failed to re-encrypt chat', error, {
          component: 'CloudSync',
          action: 'reencryptAndUploadChats',
          metadata: { chatId: chat.id },
        })
      }
    }

    logInfo('Completed re-encryption of local chats', {
      component: 'CloudSync',
      action: 'reencryptAndUploadChats',
      metadata: result,
    })
  } catch (error) {
    const errorMsg = `Re-encryption failed: ${error instanceof Error ? error.message : String(error)}`
    result.errors.push(errorMsg)
    logError('Failed to re-encrypt chats', error, {
      component: 'CloudSync',
      action: 'reencryptAndUploadChats',
    })
  }

  return result
}
