import { cloudSync } from '@/services/cloud/cloud-sync'
import { r2Storage } from '@/services/cloud/r2-storage'
import { encryptionService } from '@/services/encryption/encryption-service'
import { logError } from '@/utils/error-handling'
import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useRef, useState } from 'react'

export interface CloudSyncState {
  syncing: boolean
  lastSyncTime: number | null
  encryptionKey: string | null
}

export function useCloudSync() {
  const { getToken, isSignedIn } = useAuth()
  const [state, setState] = useState<CloudSyncState>({
    syncing: false,
    lastSyncTime: null,
    encryptionKey: null,
  })
  const syncingRef = useRef(false)

  // Initialize cloud sync when user is signed in
  useEffect(() => {
    const initializeSync = async () => {
      if (!isSignedIn) return

      try {
        // Set token getter for cloud sync and r2 storage
        // This ensures we get a fresh token for each request
        cloudSync.setTokenGetter(getToken)
        r2Storage.setTokenGetter(getToken)

        // Initialize encryption
        const key = await encryptionService.initialize()

        setState((prev) => ({
          ...prev,
          encryptionKey: key,
        }))

        // Check if there's a pending migration sync
        const pendingSync = sessionStorage.getItem('pendingMigrationSync')
        if (pendingSync === 'true') {
          console.log(
            '[CloudSync] Detected pending migration sync, triggering immediate sync',
          )
          sessionStorage.removeItem('pendingMigrationSync')

          // Trigger sync for migrated chats
          try {
            const result = await cloudSync.syncAllChats()
            console.log('[CloudSync] Migration sync complete:', result)
          } catch (error) {
            logError('Failed to sync migrated chats', error, {
              component: 'useCloudSync',
              action: 'migration-sync',
            })
          }
        }
      } catch (error) {
        logError('Failed to initialize cloud sync', error, {
          component: 'useCloudSync',
          action: 'initializeSync',
        })
      }
    }

    initializeSync()
  }, [isSignedIn, getToken])

  // Sync chats
  const syncChats = useCallback(async () => {
    if (syncingRef.current) {
      return
    }

    syncingRef.current = true
    setState((prev) => ({ ...prev, syncing: true }))

    try {
      const result = await cloudSync.syncAllChats()

      setState((prev) => ({
        ...prev,
        syncing: false,
        lastSyncTime: Date.now(),
      }))

      return result
    } catch (error) {
      setState((prev) => ({ ...prev, syncing: false }))
      throw error
    } finally {
      syncingRef.current = false
    }
  }, [])

  // Backup a single chat
  const backupChat = useCallback(async (chatId: string) => {
    await cloudSync.backupChat(chatId)
  }, [])

  // Set encryption key (for syncing across devices)
  const setEncryptionKey = useCallback(async (key: string) => {
    try {
      await encryptionService.setKey(key)
      setState((prev) => ({ ...prev, encryptionKey: key }))
    } catch (error) {
      throw new Error('Invalid encryption key')
    }
  }, [])

  // Retry decryption for failed chats
  const retryDecryptionWithNewKey = useCallback(async () => {
    return await cloudSync.retryDecryptionWithNewKey()
  }, [])

  return {
    ...state,
    syncChats,
    backupChat,
    setEncryptionKey,
    retryDecryptionWithNewKey,
  }
}
