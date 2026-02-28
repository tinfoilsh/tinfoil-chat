import { encryptionService } from '@/services/encryption/encryption-service'
import {
  authenticatePrfPasskey,
  createPrfPasskey,
  deriveKeyEncryptionKey,
  getCachedPrfResult,
  hasPasskeyCredentials,
  loadPasskeyCredentials,
  retrieveEncryptedKeys,
  storeEncryptedKeys,
} from '@/services/passkey'
import { isPrfSupported } from '@/services/passkey/prf-support'
import { setCloudSyncEnabled } from '@/utils/cloud-sync-settings'
import { logError, logInfo } from '@/utils/error-handling'
import { PASSKEY_BACKED_UP_KEY } from '@/utils/signout-cleanup'
import type { UserResource } from '@clerk/types'
import { useCallback, useEffect, useRef, useState } from 'react'

export interface PasskeyBackupState {
  /** Passkey backup exists on the backend or was used/stored this session */
  passkeyActive: boolean
  /** Backend has passkey credentials but auth failed on this device */
  passkeyRecoveryNeeded: boolean
  /** PRF supported + keys exist locally; user can register a passkey backup from settings */
  passkeySetupAvailable: boolean
  /** True when the intro modal should be shown before the first passkey prompt */
  passkeyIntroNeeded: boolean
}

export interface UsePasskeyBackupOptions {
  /** Current encryption key from useCloudSync (null if not yet set) */
  encryptionKey: string | null
  /** Whether the cloud sync init has completed */
  initialized: boolean
  isSignedIn: boolean | undefined
  user: UserResource | null | undefined
  /**
   * Called when the passkey init effect auto-recovers or auto-generates a key.
   * The consumer should feed this into setEncryptionKey so that useCloudSync
   * state stays in sync with what encryptionService now holds.
   */
  onEncryptionKeyRecovered?: (key: string) => void
}

const PASSKEY_INTRO_DELAY_MS = 2000

export function usePasskeyBackup({
  encryptionKey,
  initialized,
  isSignedIn,
  user,
  onEncryptionKeyRecovered,
}: UsePasskeyBackupOptions) {
  const [state, setState] = useState<PasskeyBackupState>({
    passkeyActive: false,
    passkeyRecoveryNeeded: false,
    passkeySetupAvailable: false,
    passkeyIntroNeeded: false,
  })

  const isMountedRef = useRef(true)
  const passkeyFlowInProgressRef = useRef(false)
  const passkeyIntroTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const userRef = useRef(user)
  userRef.current = user
  const onEncryptionKeyRecoveredRef = useRef(onEncryptionKeyRecovered)
  onEncryptionKeyRecoveredRef.current = onEncryptionKeyRecovered
  const hasInitializedPasskeyRef = useRef(false)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false
      if (passkeyIntroTimerRef.current) {
        clearTimeout(passkeyIntroTimerRef.current)
      }
    }
  }, [])

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
    const saved = await storeEncryptedKeys(
      passkeyResult.credentialId,
      kek,
      keys,
    )
    if (!saved) return false
    localStorage.setItem(PASSKEY_BACKED_UP_KEY, 'true')
    return true
  }

  /**
   * Generate a new encryption key, back it up with a new passkey, persist it,
   * and enable cloud sync. Returns the new key on success, null on cancel/failure.
   * Shared by first-time setup and "Start Fresh" flows.
   */
  const generateKeyWithPasskeyBackup = useCallback(async (): Promise<
    string | null
  > => {
    const userInfo = getPasskeyUserInfo()
    if (!userInfo) return null

    const newKey = await encryptionService.generateKey()

    const created = await createAndStorePasskeyBackup(userInfo, {
      primary: newKey,
      alternatives: [],
    })
    if (!created) return null

    await encryptionService.setKey(newKey)
    setCloudSyncEnabled(true)
    return newKey
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

  /**
   * Apply recovered keys to component state. Shared by tryPasskeyRecovery
   * (init effect) and recoverWithPasskey (UI-triggered retry).
   */
  const applyRecoveredKeys = (keyBundle: {
    primary: string
    alternatives: string[]
  }): void => {
    if (isMountedRef.current) {
      setState((prev) => ({
        ...prev,
        passkeyActive: true,
        passkeyRecoveryNeeded: false,
      }))
    }
  }

  /**
   * Apply a newly generated key to component state. Shared by
   * setupFirstTimePasskeyUser (init effect) and setupNewKeySplit (UI-triggered).
   */
  const applyNewPasskeyKey = (): void => {
    if (isMountedRef.current) {
      setState((prev) => ({
        ...prev,
        passkeyActive: true,
        passkeyRecoveryNeeded: false,
      }))
    }
  }

  /**
   * Re-encrypt the passkey backup with the current key bundle.
   * Called after key changes to keep the backup in sync.
   */
  const updatePasskeyBackup = useCallback(async (): Promise<void> => {
    try {
      const entries = await loadPasskeyCredentials()
      if (entries.length === 0) return

      // Use the cached PRF result to avoid re-prompting biometrics.
      // Falls back to a full WebAuthn authentication if no cache is available.
      const cached = getCachedPrfResult()
      const result =
        cached ?? (await authenticatePrfPasskey(entries.map((e) => e.id)))
      if (!result) return

      const kek = await deriveKeyEncryptionKey(result.prfOutput)
      const keys = encryptionService.getAllKeys()
      if (!keys.primary) return

      await storeEncryptedKeys(result.credentialId, kek, {
        primary: keys.primary,
        alternatives: keys.alternatives,
      })

      logInfo('Updated passkey backup after key change', {
        component: 'usePasskeyBackup',
        action: 'updatePasskeyBackup',
      })
    } catch (error) {
      logError('Failed to update passkey backup after key change', error, {
        component: 'usePasskeyBackup',
        action: 'updatePasskeyBackup',
      })
    }
  }, [])

  // --- Passkey initialization (runs once after cloud sync init completes) ---
  useEffect(() => {
    if (!initialized || !isSignedIn || hasInitializedPasskeyRef.current) return
    hasInitializedPasskeyRef.current = true

    const initializePasskey = async () => {
      const prfSupported = await isPrfSupported()
      if (!prfSupported) return

      if (encryptionKey) {
        // User has local keys — check for existing backup
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
            // Existing user with no passkey backup — show intro modal after delay
            passkeyIntroTimerRef.current = setTimeout(() => {
              if (isMountedRef.current) {
                setState((prev) => ({
                  ...prev,
                  passkeyIntroNeeded: true,
                }))
              }
            }, PASSKEY_INTRO_DELAY_MS)
          } else if (isMountedRef.current) {
            // Already seen intro but hasn't set up — show option in settings
            setState((prev) => ({
              ...prev,
              passkeySetupAvailable: true,
            }))
          }
        }
      } else {
        // No localStorage keys — try passkey recovery
        const credentialsExist = await hasPasskeyCredentials()

        if (credentialsExist) {
          const recovered = await tryPasskeyRecovery()
          if (!recovered && isMountedRef.current) {
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
    }

    /**
     * Attempt to recover keys from backend using passkey authentication.
     * Returns true if recovery succeeded, false otherwise.
     */
    const tryPasskeyRecovery = async (): Promise<boolean> => {
      try {
        const keyBundle = await performPasskeyRecovery()
        if (!keyBundle) return false

        applyRecoveredKeys(keyBundle)
        onEncryptionKeyRecoveredRef.current?.(keyBundle.primary)

        logInfo('Recovered encryption keys via passkey', {
          component: 'usePasskeyBackup',
          action: 'tryPasskeyRecovery',
          metadata: {
            alternativeKeys: keyBundle.alternatives.length,
          },
        })
        return true
      } catch (error) {
        logError('Passkey recovery failed', error, {
          component: 'usePasskeyBackup',
          action: 'tryPasskeyRecovery',
        })
        return false
      }
    }

    /**
     * First-time user with PRF support: generate key in memory, only persist
     * after passkey creation succeeds. If passkey is cancelled, key is discarded
     * and cloud sync stays OFF.
     */
    const setupFirstTimePasskeyUser = async (): Promise<void> => {
      try {
        const newKey = await generateKeyWithPasskeyBackup()

        if (newKey) {
          applyNewPasskeyKey()
          onEncryptionKeyRecoveredRef.current?.(newKey)

          logInfo('First-time passkey setup complete', {
            component: 'usePasskeyBackup',
            action: 'setupFirstTimePasskeyUser',
          })
        } else {
          // User cancelled — discard key, cloud sync stays OFF
          if (isMountedRef.current) {
            setState((prev) => ({
              ...prev,
              passkeySetupAvailable: true,
            }))
          }

          logInfo('Passkey creation cancelled, key discarded', {
            component: 'usePasskeyBackup',
            action: 'setupFirstTimePasskeyUser',
          })
        }
      } catch (error) {
        logError('First-time passkey user setup failed', error, {
          component: 'usePasskeyBackup',
          action: 'setupFirstTimePasskeyUser',
        })
      }
    }

    initializePasskey()
  }, [initialized, isSignedIn, encryptionKey, generateKeyWithPasskeyBackup])

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
        component: 'usePasskeyBackup',
        action: 'setupPasskey',
      })
      return true
    } catch (error) {
      logError('Passkey setup failed', error, {
        component: 'usePasskeyBackup',
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

      applyRecoveredKeys(keyBundle)

      logInfo('Recovered encryption keys via passkey retry', {
        component: 'usePasskeyBackup',
        action: 'recoverWithPasskey',
        metadata: { alternativeKeys: keyBundle.alternatives.length },
      })
      return keyBundle.primary
    } catch (error) {
      logError('Passkey recovery retry failed', error, {
        component: 'usePasskeyBackup',
        action: 'recoverWithPasskey',
      })
      return null
    }
  }, [])

  /**
   * Generate a new key + create a new passkey (explicit split).
   * Called from the recovery choice screen's "Start Fresh" button.
   * Returns the new primary key on success, null on failure/cancel.
   */
  const setupNewKeySplit = useCallback(async (): Promise<string | null> => {
    try {
      const newKey = await generateKeyWithPasskeyBackup()
      if (!newKey) return null

      applyNewPasskeyKey()

      logInfo('New key split created with passkey', {
        component: 'usePasskeyBackup',
        action: 'setupNewKeySplit',
      })
      return newKey
    } catch (error) {
      logError('Failed to create new key split', error, {
        component: 'usePasskeyBackup',
        action: 'setupNewKeySplit',
      })
      return null
    }
  }, [generateKeyWithPasskeyBackup])

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
          component: 'usePasskeyBackup',
          action: 'acceptPasskeyIntro',
        })
      }
    } finally {
      passkeyFlowInProgressRef.current = false
    }
  }, [setupPasskey])

  return {
    ...state,
    setupPasskey,
    recoverWithPasskey,
    setupNewKeySplit,
    acceptPasskeyIntro,
    updatePasskeyBackup,
  }
}
