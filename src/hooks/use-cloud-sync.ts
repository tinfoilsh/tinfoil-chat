import {
  SETTINGS_CLOUD_SYNC_EXPLICITLY_DISABLED,
  USER_ENCRYPTION_KEY,
} from '@/constants/storage-keys'
import { authTokenManager } from '@/services/auth'
import { cloudSync } from '@/services/cloud/cloud-sync'
import { encryptionService } from '@/services/encryption/encryption-service'
import {
  authenticatePrfPasskey,
  createPrfPasskey,
  deriveKeyEncryptionKey,
  hasPasskeyCredentials,
  loadPasskeyCredentials,
  retrieveEncryptedKeys,
  storeEncryptedKeys,
} from '@/services/passkey'
import { isPrfSupported } from '@/services/passkey/prf-support'
import {
  isCloudSyncEnabled,
  setCloudSyncEnabled,
} from '@/utils/cloud-sync-settings'
import { logError, logInfo } from '@/utils/error-handling'
import {
  hasPasskeyBackup,
  PASSKEY_BACKED_UP_KEY,
} from '@/utils/signout-cleanup'
import { useAuth, useUser } from '@clerk/nextjs'
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
  /** Passkey backup exists on the backend or was used/stored this session */
  passkeyActive: boolean
  /** Backend has passkey credentials but auth failed on this device */
  passkeyRecoveryNeeded: boolean
  /** PRF supported + keys exist locally; user can register a passkey backup from settings */
  passkeySetupAvailable: boolean
  /** True when the intro modal should be shown before the first passkey prompt */
  passkeyIntroNeeded: boolean
}

export function useCloudSync() {
  const { getToken, isSignedIn } = useAuth()
  const { user } = useUser()
  const [state, setState] = useState<CloudSyncState>({
    syncing: false,
    lastSyncTime: null,
    encryptionKey: null,
    isFirstTimeUser: false,
    decryptionProgress: null,
    passkeyActive: false,
    passkeyRecoveryNeeded: false,
    passkeySetupAvailable: false,
    passkeyIntroNeeded: false,
  })
  const syncingRef = useRef(false)
  const initializingRef = useRef(false)
  const passkeyFlowInProgressRef = useRef(false)
  const isMountedRef = useRef(true)
  const userRef = useRef(user)
  userRef.current = user

  /**
   * Build the (userId, userName, displayName) tuple for createPrfPasskey
   * from the current Clerk user, or return null if no user is available.
   */
  const getPasskeyUserInfo = (): {
    userId: string
    userName: string
    displayName: string
  } | null => {
    const u = userRef.current
    if (!u) return null
    return {
      userId: u.id,
      userName: u.primaryEmailAddress?.emailAddress ?? u.id,
      displayName: u.fullName ?? u.primaryEmailAddress?.emailAddress ?? u.id,
    }
  }

  /**
   * Create a PRF passkey and encrypt the given key bundle to the backend.
   * Returns true if the passkey was created and keys stored, false if the user
   * cancelled or PRF wasn't supported, throws on unexpected errors.
   */
  const createAndStorePasskeyBackup = async (
    userInfo: { userId: string; userName: string; displayName: string },
    keys: { primary: string; alternatives: string[] },
  ): Promise<boolean> => {
    const passkeyResult = await createPrfPasskey(
      userInfo.userId,
      userInfo.userName,
      userInfo.displayName,
    )
    if (!passkeyResult) return false

    const kek = await deriveKeyEncryptionKey(passkeyResult.prfOutput)
    await storeEncryptedKeys(passkeyResult.credentialId, kek, keys)
    localStorage.setItem(PASSKEY_BACKED_UP_KEY, 'true')
    return true
  }

  /**
   * Re-encrypt the passkey backup with the current key bundle.
   * Called after key changes to keep the backup in sync.
   */
  const updatePasskeyBackup = async (): Promise<void> => {
    try {
      const entries = await loadPasskeyCredentials()
      if (entries.length === 0) return

      const credentialIds = entries.map((e) => e.id)
      const result = await authenticatePrfPasskey(credentialIds)
      if (!result) return

      const kek = await deriveKeyEncryptionKey(result.prfOutput)
      const keys = encryptionService.getAllKeys()
      if (!keys.primary) return

      await storeEncryptedKeys(result.credentialId, kek, {
        primary: keys.primary,
        alternatives: keys.alternatives,
      })

      logInfo('Updated passkey backup after key change', {
        component: 'useCloudSync',
        action: 'updatePasskeyBackup',
      })
    } catch (error) {
      logError('Failed to update passkey backup after key change', error, {
        component: 'useCloudSync',
        action: 'updatePasskeyBackup',
      })
    }
  }

  const passkeyIntroTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false
      if (passkeyIntroTimerRef.current) {
        clearTimeout(passkeyIntroTimerRef.current)
      }
    }
  }, [])

  // Listen for fallback key additions and trigger retry decryption
  useEffect(() => {
    const unsubscribe = encryptionService.onFallbackKeyAdded(() => {
      logInfo('Fallback key added, triggering decryption retry', {
        component: 'useCloudSync',
        action: 'onFallbackKeyAdded',
      })

      // Run decryption retry in background
      cloudSync
        .retryDecryptionWithNewKey()
        .then((decryptedCount) => {
          if (decryptedCount > 0) {
            logInfo(`Decrypted ${decryptedCount} chats with new fallback key`, {
              component: 'useCloudSync',
              action: 'onFallbackKeyAdded',
              metadata: { decryptedCount },
            })
          }
        })
        .catch((error) => {
          logError(
            'Failed to retry decryption after fallback key added',
            error,
            {
              component: 'useCloudSync',
              action: 'onFallbackKeyAdded',
            },
          )
        })
    })

    return unsubscribe
  }, [])

  /**
   * Core passkey recovery: load credentials, authenticate, derive KEK, decrypt bundle.
   * Returns the recovered KeyBundle on success, null on failure/cancellation.
   * Throws on unexpected errors (callers decide how to handle).
   */
  const performPasskeyRecovery = async (): Promise<{
    primary: string
    alternatives: string[]
  } | null> => {
    const entries = await loadPasskeyCredentials()
    if (entries.length === 0) return null

    const credentialIds = entries.map((e) => e.id)
    const result = await authenticatePrfPasskey(credentialIds)
    if (!result) return null

    const kek = await deriveKeyEncryptionKey(result.prfOutput)
    const keyBundle = await retrieveEncryptedKeys(result.credentialId, kek)
    if (!keyBundle) return null

    await encryptionService.setAllKeys(
      keyBundle.primary,
      keyBundle.alternatives,
    )

    setCloudSyncEnabled(true)
    localStorage.setItem(PASSKEY_BACKED_UP_KEY, 'true')
    return keyBundle
  }

  // Initialize cloud sync when user is signed in
  useEffect(() => {
    const initializeSync = async () => {
      if (!isSignedIn || initializingRef.current) return

      initializingRef.current = true

      try {
        // Initialize centralized auth token manager
        authTokenManager.initialize(getToken)

        // Check if user already has a key before initializing
        const existingKey = localStorage.getItem(USER_ENCRYPTION_KEY)
        const isFirstTime = !existingKey

        // Backwards compatibility: if an encryption key exists but cloud sync is not enabled,
        // automatically enable it (existing users should have sync enabled by default)
        // BUT respect if user explicitly disabled it
        let cloudSyncEnabled = isCloudSyncEnabled()
        const explicitlyDisabled =
          localStorage.getItem(SETTINGS_CLOUD_SYNC_EXPLICITLY_DISABLED) ===
          'true'

        if (existingKey && !cloudSyncEnabled && !explicitlyDisabled) {
          setCloudSyncEnabled(true)
          cloudSyncEnabled = true
          logInfo('Automatically enabled cloud sync for existing user', {
            component: 'useCloudSync',
            action: 'initializeSync',
          })
        }

        // Initialize encryption (does not auto-generate keys)
        const key = await encryptionService.initialize()

        if (isMountedRef.current) {
          setState((prev) => ({
            ...prev,
            encryptionKey: key,
            isFirstTimeUser: isFirstTime,
          }))
        }

        // --- Passkey PRF flow ---
        const prfSupported = await isPrfSupported()

        if (key) {
          if (prfSupported) {
            const credentialsExist = await hasPasskeyCredentials()

            if (credentialsExist) {
              // Already backed up — show green badge, hide setup button
              localStorage.setItem(PASSKEY_BACKED_UP_KEY, 'true')
              if (isMountedRef.current) {
                setState((prev) => ({
                  ...prev,
                  passkeyActive: true,
                }))
              }
            } else if (!passkeyFlowInProgressRef.current) {
              const hasSeen =
                userRef.current?.unsafeMetadata?.has_seen_passkey_intro === true
              if (!hasSeen) {
                // Existing user with no passkey backup — show intro modal
                promptExistingUserPasskeySetup()
              } else if (isMountedRef.current) {
                // Already seen intro but hasn't set up — show option in settings
                setState((prev) => ({
                  ...prev,
                  passkeySetupAvailable: true,
                }))
              }
            }
          }
        } else if (prfSupported) {
          // No localStorage keys — try passkey recovery
          const credentialsExist = await hasPasskeyCredentials()

          if (credentialsExist) {
            // Backend has passkey credentials — try to recover keys
            const recovered = await tryPasskeyRecovery()
            if (!recovered && isMountedRef.current) {
              // Auth failed or user cancelled — mark for recovery UI
              setState((prev) => ({
                ...prev,
                passkeyRecoveryNeeded: true,
              }))
            }
          } else {
            // First-time user with PRF support: auto-generate key + create passkey
            await setupFirstTimePasskeyUser()
          }
        }
        // If PRF not supported and no localStorage key: current flow unchanged
        // (isFirstTimeUser=true, cloud sync disabled, setup modal when user opts in)

        // Only perform sync operations if cloud sync is enabled
        if (!isCloudSyncEnabled()) {
          logInfo('Cloud sync is disabled, skipping sync operations', {
            component: 'useCloudSync',
            action: 'initializeSync',
          })
          return
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

    /**
     * Attempt to recover keys from backend using passkey authentication.
     * Returns true if recovery succeeded, false otherwise.
     */
    const tryPasskeyRecovery = async (): Promise<boolean> => {
      try {
        const keyBundle = await performPasskeyRecovery()
        if (!keyBundle) return false

        if (isMountedRef.current) {
          setState((prev) => ({
            ...prev,
            encryptionKey: keyBundle.primary,
            isFirstTimeUser: false,
            passkeyActive: true,
            passkeyRecoveryNeeded: false,
          }))
        }

        logInfo('Recovered encryption keys via passkey', {
          component: 'useCloudSync',
          action: 'tryPasskeyRecovery',
          metadata: {
            alternativeKeys: keyBundle.alternatives.length,
          },
        })
        return true
      } catch (error) {
        logError('Passkey recovery failed', error, {
          component: 'useCloudSync',
          action: 'tryPasskeyRecovery',
        })
        return false
      }
    }

    /**
     * Existing user with local keys but no passkey backup — show the intro modal.
     */
    const PASSKEY_INTRO_DELAY_MS = 2000

    const promptExistingUserPasskeySetup = (): void => {
      passkeyIntroTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          setState((prev) => ({
            ...prev,
            passkeyIntroNeeded: true,
          }))
        }
      }, PASSKEY_INTRO_DELAY_MS)
    }

    /**
     * First-time user with PRF support: generate key, create passkey, store encrypted bundle.
     */
    const setupFirstTimePasskeyUser = async (): Promise<void> => {
      const userInfo = getPasskeyUserInfo()
      if (!userInfo) return

      let newKey: string | null = null
      try {
        newKey = await encryptionService.generateKey()
        await encryptionService.setKey(newKey)

        const keys = encryptionService.getAllKeys()
        const created = await createAndStorePasskeyBackup(userInfo, {
          primary: keys.primary!,
          alternatives: keys.alternatives,
        })

        if (created) {
          // Auto-enable cloud sync
          setCloudSyncEnabled(true)

          if (isMountedRef.current) {
            setState((prev) => ({
              ...prev,
              encryptionKey: newKey,
              isFirstTimeUser: false,
              passkeyActive: true,
            }))
          }

          logInfo('First-time passkey setup complete', {
            component: 'useCloudSync',
            action: 'setupFirstTimePasskeyUser',
          })
        } else {
          // User cancelled or PRF not actually supported — key is generated
          // but no passkey backup. Fall through to normal flow.
          setCloudSyncEnabled(true)

          if (isMountedRef.current) {
            setState((prev) => ({
              ...prev,
              encryptionKey: newKey,
              isFirstTimeUser: false,
              passkeySetupAvailable: true,
            }))
          }

          logInfo(
            'Passkey creation cancelled by user, key generated without passkey backup',
            {
              component: 'useCloudSync',
              action: 'setupFirstTimePasskeyUser',
            },
          )
        }
      } catch (error) {
        logError('First-time passkey user setup failed', error, {
          component: 'useCloudSync',
          action: 'setupFirstTimePasskeyUser',
        })

        // Key may already be persisted to localStorage before the error.
        // Update state so the UI isn't stuck showing first-time-user flow.
        if (newKey && isMountedRef.current) {
          setCloudSyncEnabled(true)
          setState((prev) => ({
            ...prev,
            encryptionKey: newKey,
            isFirstTimeUser: false,
            passkeySetupAvailable: true,
          }))
        }
      }
    }

    initializeSync()
  }, [isSignedIn, getToken])

  // Full sync chats (always fetches first page)
  const syncChats = useCallback(async () => {
    // Check if cloud sync is enabled
    if (!isCloudSyncEnabled()) {
      logInfo('Cloud sync is disabled, skipping sync', {
        component: 'useCloudSync',
        action: 'syncChats',
      })
      return false
    }

    if (syncingRef.current) {
      logInfo('Sync request blocked - sync already in progress', {
        component: 'useCloudSync',
        action: 'syncChats',
      })
      return false
    }

    syncingRef.current = true
    if (isMountedRef.current) {
      setState((prev) => ({ ...prev, syncing: true }))
    }

    try {
      const result = await cloudSync.syncAllChats()

      if (isMountedRef.current) {
        setState((prev) => ({
          ...prev,
          syncing: false,
          lastSyncTime: Date.now(),
        }))
      }

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
      if (isMountedRef.current) {
        setState((prev) => ({ ...prev, syncing: false }))
      }
      throw error
    } finally {
      syncingRef.current = false
    }
  }, [])

  /**
   * Smart sync: checks sync status first and only syncs if changes detected.
   * @param projectId - Optional project ID. If provided, syncs project chats.
   */
  const smartSyncChats = useCallback(async (projectId?: string) => {
    if (!isCloudSyncEnabled()) {
      logInfo('Cloud sync is disabled, skipping smart sync', {
        component: 'useCloudSync',
        action: 'smartSyncChats',
        metadata: { projectId },
      })
      return { uploaded: 0, downloaded: 0, errors: [] }
    }

    if (syncingRef.current) {
      logInfo('Smart sync request blocked - sync already in progress', {
        component: 'useCloudSync',
        action: 'smartSyncChats',
        metadata: { projectId },
      })
      return { uploaded: 0, downloaded: 0, errors: [] }
    }

    syncingRef.current = true
    if (isMountedRef.current) {
      setState((prev) => ({ ...prev, syncing: true }))
    }

    try {
      const result = await cloudSync.smartSync(projectId)

      if (isMountedRef.current) {
        setState((prev) => ({
          ...prev,
          syncing: false,
          lastSyncTime: Date.now(),
        }))
      }

      if (result.uploaded > 0 || result.downloaded > 0) {
        logInfo(
          `Smart sync completed: uploaded=${result.uploaded}, downloaded=${result.downloaded}`,
          {
            component: 'useCloudSync',
            action: 'smartSyncChats',
            metadata: { projectId, result },
          },
        )
      }

      return result
    } catch (error) {
      if (isMountedRef.current) {
        setState((prev) => ({ ...prev, syncing: false }))
      }
      throw error
    } finally {
      syncingRef.current = false
    }
  }, [])

  // Backup a single chat
  const backupChat = useCallback(async (chatId: string) => {
    await cloudSync.backupChat(chatId)
  }, [])

  // Sync chats for a specific project (full sync)
  const syncProjectChats = useCallback(async (projectId: string) => {
    if (!isCloudSyncEnabled()) {
      logInfo('Cloud sync is disabled, skipping project chat sync', {
        component: 'useCloudSync',
        action: 'syncProjectChats',
      })
      return { uploaded: 0, downloaded: 0, errors: [] }
    }

    if (syncingRef.current) {
      logInfo('Sync request blocked - sync already in progress', {
        component: 'useCloudSync',
        action: 'syncProjectChats',
      })
      return { uploaded: 0, downloaded: 0, errors: [] }
    }

    syncingRef.current = true
    if (isMountedRef.current) {
      setState((prev) => ({ ...prev, syncing: true }))
    }

    try {
      const result = await cloudSync.syncProjectChats(projectId)

      if (isMountedRef.current) {
        setState((prev) => ({
          ...prev,
          syncing: false,
          lastSyncTime: Date.now(),
        }))
      }

      if (result.downloaded > 0) {
        logInfo(
          `Project chat sync completed: downloaded=${result.downloaded}`,
          {
            component: 'useCloudSync',
            action: 'syncProjectChats',
            metadata: { projectId, result },
          },
        )
      }

      return result
    } catch (error) {
      if (isMountedRef.current) {
        setState((prev) => ({ ...prev, syncing: false }))
      }
      throw error
    } finally {
      syncingRef.current = false
    }
  }, [])

  // Retry decryption for failed chats
  const retryDecryptionWithNewKey = useCallback(
    (options?: { runInBackground?: boolean }) => {
      const { runInBackground = false } = options || {}

      if (runInBackground) {
        if (isMountedRef.current) {
          setState((prev) => ({
            ...prev,
            decryptionProgress: { isDecrypting: true, current: 0, total: 0 },
          }))
        }

        const promise = cloudSync.retryDecryptionWithNewKey({
          onProgress: (current, total) => {
            if (isMountedRef.current) {
              setState((prev) => ({
                ...prev,
                decryptionProgress: { isDecrypting: true, current, total },
              }))
            }
          },
        })

        promise.finally(() => {
          if (isMountedRef.current) {
            setState((prev) => ({ ...prev, decryptionProgress: null }))
          }
        })

        promise.catch((error) => {
          logError('Background decryption failed', error, {
            component: 'useCloudSync',
            action: 'retryDecryptionWithNewKey',
          })
        })

        return promise
      }

      return cloudSync.retryDecryptionWithNewKey()
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
        if (isMountedRef.current) {
          setState((prev) => ({ ...prev, encryptionKey: key }))
        }

        // If the key changed OR this is the first time setting a key, retry decryption and sync
        if (!oldKey || oldKey !== key) {
          // Sync immediately to fetch encrypted chats from cloud
          // Don't let sync failures block key updates
          try {
            await syncChats()
          } catch (syncError) {
            logError('Failed to sync after setting encryption key', syncError, {
              component: 'useCloudSync',
              action: 'setEncryptionKey.initialSync',
            })
          }

          // Run decryption in background to avoid UI hang
          void retryDecryptionWithNewKey({
            runInBackground: true,
          })

          // If passkey backup exists, re-encrypt it with the updated key bundle
          if (hasPasskeyBackup()) {
            void updatePasskeyBackup()
          }

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
    if (isMountedRef.current) {
      setState((prev) => ({ ...prev, isFirstTimeUser: false }))
    }
  }, [])

  /**
   * Create a passkey and encrypt existing localStorage keys to the backend.
   * Called from UI when passkeySetupAvailable=true (user has keys but no passkey backup).
   * Returns true on success.
   */
  const setupPasskey = useCallback(async (): Promise<boolean> => {
    const userInfo = getPasskeyUserInfo()
    if (!userInfo) return false

    try {
      const keys = encryptionService.getAllKeys()
      if (!keys.primary) return false

      const created = await createAndStorePasskeyBackup(userInfo, {
        primary: keys.primary,
        alternatives: keys.alternatives,
      })
      if (!created) return false

      if (isMountedRef.current) {
        setState((prev) => ({
          ...prev,
          passkeyActive: true,
          passkeySetupAvailable: false,
        }))
      }

      logInfo('Passkey setup completed for existing keys', {
        component: 'useCloudSync',
        action: 'setupPasskey',
      })
      return true
    } catch (error) {
      logError('Passkey setup failed', error, {
        component: 'useCloudSync',
        action: 'setupPasskey',
      })
      return false
    }
  }, [])

  /**
   * Retry passkey authentication to recover keys from the backend.
   * Called from UI when passkeyRecoveryNeeded=true (e.g. passkey-recovery modal step).
   * Returns the recovered primary key on success, null on failure.
   */
  const recoverWithPasskey = useCallback(async (): Promise<string | null> => {
    try {
      const keyBundle = await performPasskeyRecovery()
      if (!keyBundle) return null

      if (isMountedRef.current) {
        setState((prev) => ({
          ...prev,
          encryptionKey: keyBundle.primary,
          isFirstTimeUser: false,
          passkeyActive: true,
          passkeyRecoveryNeeded: false,
        }))
      }

      logInfo('Recovered encryption keys via passkey retry', {
        component: 'useCloudSync',
        action: 'recoverWithPasskey',
        metadata: { alternativeKeys: keyBundle.alternatives.length },
      })
      return keyBundle.primary
    } catch (error) {
      logError('Passkey recovery retry failed', error, {
        component: 'useCloudSync',
        action: 'recoverWithPasskey',
      })
      return null
    }
  }, [])

  /**
   * User accepted the passkey intro modal — trigger the actual WebAuthn passkey flow.
   * Writes Clerk metadata after the WebAuthn flow completes (success or cancel)
   * to avoid triggering a Clerk state change that re-runs the init effect mid-flow.
   */
  const acceptPasskeyIntro = useCallback(async (): Promise<void> => {
    passkeyFlowInProgressRef.current = true

    if (isMountedRef.current) {
      setState((prev) => ({ ...prev, passkeyIntroNeeded: false }))
    }

    try {
      const success = await setupPasskey()
      if (!success && isMountedRef.current) {
        // User cancelled the browser WebAuthn prompt — show option in settings
        setState((prev) => ({ ...prev, passkeySetupAvailable: true }))
      }

      // Mark the intro as seen regardless of outcome — the user clicked
      // "Let's go!" so they've seen the explanation. Done after setupPasskey
      // to avoid Clerk state changes re-triggering the init effect mid-flow.
      try {
        const u = userRef.current
        if (u) {
          await u.update({
            unsafeMetadata: {
              ...u.unsafeMetadata,
              has_seen_passkey_intro: true,
            },
          })
        }
      } catch (error) {
        logError('Failed to persist passkey intro seen flag', error, {
          component: 'useCloudSync',
          action: 'acceptPasskeyIntro',
        })
      }
    } finally {
      passkeyFlowInProgressRef.current = false
    }
  }, [setupPasskey])

  return {
    ...state,
    syncChats,
    smartSyncChats,
    syncProjectChats,
    backupChat,
    setEncryptionKey,
    retryDecryptionWithNewKey,
    clearFirstTimeUser,
    setupPasskey,
    recoverWithPasskey,
    acceptPasskeyIntro,
  }
}
