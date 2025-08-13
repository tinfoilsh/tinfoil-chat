import { CLOUD_SYNC } from '@/config'
import { cloudSync } from '@/services/cloud/cloud-sync'
import { r2Storage } from '@/services/cloud/r2-storage'
import { encryptionService } from '@/services/encryption/encryption-service'
import { logError, logInfo } from '@/utils/error-handling'
import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useRef, useState } from 'react'

export interface CloudSyncState {
  syncing: boolean
  lastSyncTime: number | null
  encryptionKey: string | null
  isFirstTimeUser: boolean
  decryptionProgress: {
    isDecrypting: boolean
    current: number
    total: number
  } | null
}

export function useCloudSync() {
  const { getToken, isSignedIn } = useAuth()
  const [state, setState] = useState<CloudSyncState>({
    syncing: false,
    lastSyncTime: null,
    encryptionKey: null,
    isFirstTimeUser: false,
    decryptionProgress: null,
  })
  const syncingRef = useRef(false)
  const initializingRef = useRef(false)

  // Initialize cloud sync when user is signed in
  useEffect(() => {
    const initializeSync = async () => {
      if (!isSignedIn || initializingRef.current) return

      initializingRef.current = true

      try {
        // Set token getter for cloud sync and r2 storage
        // This ensures we get a fresh token for each request
        cloudSync.setTokenGetter(getToken)
        r2Storage.setTokenGetter(getToken)

        // Check if user already has a key before initializing
        const existingKey = localStorage.getItem('tinfoil-encryption-key')
        const isFirstTime = !existingKey

        // Initialize encryption
        const key = await encryptionService.initialize()

        setState((prev) => ({
          ...prev,
          encryptionKey: key,
          isFirstTimeUser: isFirstTime,
        }))

        // Check if there's a pending migration sync
        const pendingSync = sessionStorage.getItem('pendingMigrationSync')
        if (pendingSync === 'true') {
          logInfo(
            'Detected pending migration sync, triggering immediate sync',
            {
              component: 'useCloudSync',
              action: 'initializeSync',
            },
          )
          sessionStorage.removeItem('pendingMigrationSync')

          // Wait a bit to ensure cloudSync is fully initialized
          await new Promise((resolve) =>
            setTimeout(resolve, CLOUD_SYNC.RETRY_DELAY),
          )

          // Use the syncChats function instead of calling syncAllChats directly
          // This will properly manage the syncing state
          if (!syncingRef.current) {
            syncingRef.current = true
            setState((prev) => ({ ...prev, syncing: true }))

            try {
              const result = await cloudSync.syncAllChats()

              setState((prev) => ({
                ...prev,
                syncing: false,
                lastSyncTime: Date.now(),
              }))

              logInfo(
                `Migration sync complete: uploaded=${result.uploaded}, downloaded=${result.downloaded}`,
                {
                  component: 'useCloudSync',
                  action: 'migration-sync',
                  metadata: { result },
                },
              )
            } catch (error) {
              setState((prev) => ({ ...prev, syncing: false }))
              if (
                error instanceof Error &&
                error.message.includes('Sync already in progress')
              ) {
                logInfo(
                  'Migration sync skipped - another sync is already in progress',
                  {
                    component: 'useCloudSync',
                    action: 'migration-sync',
                  },
                )
              } else {
                logError('Failed to sync migrated chats', error, {
                  component: 'useCloudSync',
                  action: 'migration-sync',
                })
              }
            } finally {
              syncingRef.current = false
            }
          }
        }
      } catch (error) {
        logError('Failed to initialize cloud sync', error, {
          component: 'useCloudSync',
          action: 'initializeSync',
        })
      } finally {
        initializingRef.current = false
      }
    }

    initializeSync()
  }, [isSignedIn, getToken])

  // Sync chats
  const syncChats = useCallback(async () => {
    if (syncingRef.current) {
      // Log when sync is blocked
      logInfo('Sync request blocked - sync already in progress', {
        component: 'useCloudSync',
        action: 'syncChats',
      })
      return false
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

      logInfo(
        `Sync completed: uploaded=${result.uploaded}, downloaded=${result.downloaded}`,
        {
          component: 'useCloudSync',
          action: 'syncChats',
          metadata: { result },
        },
      )

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

  // Retry decryption for failed chats
  const retryDecryptionWithNewKey = useCallback(
    async (options?: { runInBackground?: boolean }) => {
      const { runInBackground = false } = options || {}

      if (runInBackground) {
        // Set initial progress state
        setState((prev) => ({
          ...prev,
          decryptionProgress: { isDecrypting: true, current: 0, total: 0 },
        }))

        // Run decryption in background
        const promise = cloudSync.retryDecryptionWithNewKey({
          onProgress: (current, total) => {
            setState((prev) => ({
              ...prev,
              decryptionProgress: { isDecrypting: true, current, total },
            }))
          },
        })

        // Clean up progress state when done
        promise.finally(() => {
          setState((prev) => ({ ...prev, decryptionProgress: null }))
        })

        // Return immediately, don't wait
        promise.catch((error) => {
          logError('Background decryption failed', error, {
            component: 'useCloudSync',
            action: 'retryDecryptionWithNewKey',
          })
        })

        return 0 // Return immediately for background mode
      }

      // Run synchronously for non-background mode
      return await cloudSync.retryDecryptionWithNewKey()
    },
    [],
  )

  // Set encryption key (for syncing across devices)
  const setEncryptionKey = useCallback(
    async (key: string) => {
      try {
        // Store the old key to detect if it changed
        const oldKey = encryptionService.getKey()

        await encryptionService.setKey(key)
        setState((prev) => ({ ...prev, encryptionKey: key }))

        // If the key changed OR this is the first time setting a key, retry decryption and sync
        if (!oldKey || oldKey !== key) {
          // Run decryption in background to avoid UI hang
          retryDecryptionWithNewKey({ runInBackground: true })

          // Re-encrypt and sync can also run in background
          Promise.resolve().then(async () => {
            try {
              // Re-encrypt all local chats with the new key and upload them
              const reencryptResult = await cloudSync.reencryptAndUploadChats()

              logInfo('Re-encrypted chats after key change', {
                component: 'useCloudSync',
                action: 'setEncryptionKey',
                metadata: {
                  reencrypted: reencryptResult.reencrypted,
                  uploaded: reencryptResult.uploaded,
                  errors: reencryptResult.errors.length,
                },
              })

              // Then trigger a full sync to ensure everything is up to date
              await syncChats()
            } catch (error) {
              logError('Failed to re-encrypt chats', error, {
                component: 'useCloudSync',
                action: 'setEncryptionKey',
              })
            }
          })

          return true // Always return true to trigger reload
        }

        return false // Key didn't change
      } catch (error) {
        logError('Failed to set encryption key', error, {
          component: 'useCloudSync',
          action: 'setEncryptionKey',
        })
        throw new Error('Invalid encryption key')
      }
    },
    [syncChats, retryDecryptionWithNewKey],
  )

  // Clear first time user flag
  const clearFirstTimeUser = useCallback(() => {
    setState((prev) => ({ ...prev, isFirstTimeUser: false }))
  }, [])

  return {
    ...state,
    syncChats,
    backupChat,
    setEncryptionKey,
    retryDecryptionWithNewKey,
    clearFirstTimeUser,
  }
}
