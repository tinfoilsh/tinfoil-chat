import { SignoutConfirmationModal } from '@/components/modals/signout-confirmation-modal'
import {
  ACCOUNT_RESET_FAILED_EVENT,
  AUTH_ACTIVE_USER_CHANGED_EVENT,
} from '@/constants/auth-events'
import {
  AUTH_ACCOUNT_RESET_FAILED,
  AUTH_ACTIVE_USER_ID,
  AUTH_ANONYMOUS_RESTORE_PENDING_CLEANUP,
  PENDING_ENCRYPTION_KEY_RECOVERY,
} from '@/constants/storage-keys'
import { logError, logInfo } from '@/utils/error-handling'
import {
  deletePendingKeyRecovery,
  getPendingKeyRecovery,
  restorePendingKeyForOwner,
} from '@/utils/pending-key-recovery'
import {
  getEncryptionKey,
  hasPasskeyBackup,
  performSignoutCleanup,
  performUserSwitchCleanup,
  retryFailedStorageCleanup,
} from '@/utils/signout-cleanup'
import {
  completeSignoutStep,
  hideSignoutProgress,
  reportSignoutStep,
  SIGNOUT_STEPS,
} from '@/utils/signout-progress'
import { useAuth, useUser } from '@clerk/nextjs'
import { useCallback, useEffect, useRef, useState } from 'react'

const SIGNOUT_CLEANUP_GRACE_MS = 2000

export function AuthCleanupHandler() {
  const { isSignedIn, isLoaded } = useAuth()
  const { user } = useUser()
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [cleanupError, setCleanupError] = useState<{
    message: string
    retryStorage: boolean
  } | null>(null)
  const [cleanupRetrying, setCleanupRetrying] = useState(false)
  const hasCheckedRef = useRef(false)
  const pendingSignoutCleanupRef = useRef<number | null>(null)
  const pendingUserSwitchCleanupRef = useRef<Promise<void> | null>(null)
  const latestAuthStateRef = useRef({
    isLoaded,
    isSignedIn,
    userId: user?.id,
  })
  latestAuthStateRef.current = {
    isLoaded,
    isSignedIn,
    userId: user?.id,
  }

  const refreshPendingRecovery = useCallback(async () => {
    setRecoveryKey(null)
    setShowModal(false)

    const latestAuthState = latestAuthStateRef.current
    if (!latestAuthState.isLoaded) return
    if (latestAuthState.isSignedIn) {
      if (latestAuthState.userId) {
        try {
          await restorePendingKeyForOwner(latestAuthState.userId)
        } catch (error) {
          logError('Failed to restore pending encryption key', error, {
            component: 'AuthCleanupHandler',
            action: 'refreshPendingRecovery',
          })
        }
      }
      return
    }
    if (latestAuthState.isSignedIn !== false) return

    const pending = getPendingKeyRecovery()
    setRecoveryKey(pending?.encryptionKey ?? null)
    setShowModal(pending !== null)
  }, [])

  useEffect(() => {
    void refreshPendingRecovery()
  }, [isLoaded, isSignedIn, user?.id, refreshPendingRecovery])

  useEffect(() => {
    const handlePendingRecoveryChange = (event: StorageEvent) => {
      if (event.key !== PENDING_ENCRYPTION_KEY_RECOVERY) return
      void refreshPendingRecovery()
    }
    window.addEventListener('storage', handlePendingRecoveryChange)
    return () =>
      window.removeEventListener('storage', handlePendingRecoveryChange)
  }, [refreshPendingRecovery])

  useEffect(() => {
    const handleCrossTabResetFailure = () => {
      setCleanupError({
        message:
          'Local data could not be cleared after another tab changed accounts.',
        retryStorage: true,
      })
    }
    if (sessionStorage.getItem(AUTH_ACCOUNT_RESET_FAILED) === 'true') {
      handleCrossTabResetFailure()
    }
    window.addEventListener(
      ACCOUNT_RESET_FAILED_EVENT,
      handleCrossTabResetFailure,
    )
    return () =>
      window.removeEventListener(
        ACCOUNT_RESET_FAILED_EVENT,
        handleCrossTabResetFailure,
      )
  }, [])

  const clearPendingSignoutCleanup = useCallback(() => {
    if (pendingSignoutCleanupRef.current !== null) {
      clearTimeout(pendingSignoutCleanupRef.current)
      pendingSignoutCleanupRef.current = null
    }
  }, [])

  const runSignoutCleanup = useCallback(() => {
    completeSignoutStep(SIGNOUT_STEPS.SIGN_OUT)
    const pendingRecovery = getPendingKeyRecovery()
    if (pendingRecovery) {
      logInfo('Preserving pending encryption key recovery after signout', {
        component: 'AuthCleanupHandler',
        action: 'resumePendingRecovery',
      })
      hideSignoutProgress()
      void refreshPendingRecovery()
      return
    }
    const encryptionKey = getEncryptionKey()
    const ownerUserId = localStorage.getItem(AUTH_ACTIVE_USER_ID)

    if (hasPasskeyBackup() || !encryptionKey) {
      const action = hasPasskeyBackup()
        ? 'signoutWithPasskey'
        : 'signoutWithoutKey'
      logInfo('Auto-clearing all data on signout', {
        component: 'AuthCleanupHandler',
        action,
      })
      performSignoutCleanup()
        .then(() => {
          reportSignoutStep(SIGNOUT_STEPS.RELOAD)
          window.location.reload()
        })
        .catch((error) => {
          logError('Failed to cleanup on signout', error, {
            component: 'AuthCleanupHandler',
            action,
          })
          hideSignoutProgress()
          setCleanupError({
            message: 'Local data could not be cleared after signing out.',
            retryStorage: false,
          })
        })
      return
    }

    logInfo('No passkey backup, preserving key for download prompt', {
      component: 'AuthCleanupHandler',
      action: 'signoutWithoutPasskey',
    })
    if (!ownerUserId) {
      hideSignoutProgress()
      setCleanupError({
        message: 'The encryption key owner could not be verified.',
        retryStorage: false,
      })
      return
    }

    performSignoutCleanup({ recoverEncryptionKeyForOwner: ownerUserId })
      .then(() => {
        hideSignoutProgress()
        // Check theme from data-theme attribute (source of truth)
        const dataTheme = document.documentElement.getAttribute('data-theme')
        setIsDarkMode(dataTheme === 'dark')
        void refreshPendingRecovery()
      })
      .catch((error) => {
        logError('Failed to cleanup on signout (preserving key)', error, {
          component: 'AuthCleanupHandler',
          action: 'signoutWithoutPasskey',
        })
        hideSignoutProgress()
        setCleanupError({
          message: 'Local data could not be cleared after signing out.',
          retryStorage: false,
        })
      })
  }, [refreshPendingRecovery])

  useEffect(() => {
    if (!isLoaded) return
    if (cleanupError) {
      clearPendingSignoutCleanup()
      return
    }

    if (isSignedIn && user?.id) {
      clearPendingSignoutCleanup()
      const storedUserId = localStorage.getItem(AUTH_ACTIVE_USER_ID)
      const hasAnonymousRestore =
        localStorage.getItem(AUTH_ANONYMOUS_RESTORE_PENDING_CLEANUP) === 'true'

      if (hasAnonymousRestore || (storedUserId && storedUserId !== user.id)) {
        // Different user signed in — clear all previous user data + reload
        if (!pendingUserSwitchCleanupRef.current && !cleanupError) {
          const cleanup = performUserSwitchCleanup(user.id)
          pendingUserSwitchCleanupRef.current = cleanup
          void cleanup
            .then(() => {
              window.location.reload()
            })
            .catch(() => {
              setCleanupError({
                message:
                  'Local data from the previous account could not be cleared.',
                retryStorage: false,
              })
            })
            .finally(() => {
              if (pendingUserSwitchCleanupRef.current === cleanup) {
                pendingUserSwitchCleanupRef.current = null
              }
            })
        }
        return
      }

      // Same user or fresh sign-in — persist the active user ID
      localStorage.setItem(AUTH_ACTIVE_USER_ID, user.id)
      window.dispatchEvent(new Event(AUTH_ACTIVE_USER_CHANGED_EVENT))
    }

    // Check if user just signed out (stored user ID exists but no longer signed in)
    const storedUserId = localStorage.getItem(AUTH_ACTIVE_USER_ID)
    if (!isSignedIn && storedUserId && !hasCheckedRef.current) {
      if (pendingSignoutCleanupRef.current === null) {
        pendingSignoutCleanupRef.current = window.setTimeout(() => {
          pendingSignoutCleanupRef.current = null

          const latestStoredUserId = localStorage.getItem(AUTH_ACTIVE_USER_ID)
          const latestAuthState = latestAuthStateRef.current

          if (
            !latestAuthState.isLoaded ||
            latestAuthState.isSignedIn ||
            !latestStoredUserId
          ) {
            return
          }

          hasCheckedRef.current = true
          runSignoutCleanup()
        }, SIGNOUT_CLEANUP_GRACE_MS)
      }
    } else {
      clearPendingSignoutCleanup()
    }

    if (!storedUserId) {
      clearPendingSignoutCleanup()
    }

    // Reset the check flag when user signs in
    if (isSignedIn) {
      hasCheckedRef.current = false
    }
  }, [
    isSignedIn,
    isLoaded,
    user?.id,
    clearPendingSignoutCleanup,
    cleanupError,
    runSignoutCleanup,
  ])

  useEffect(() => clearPendingSignoutCleanup, [clearPendingSignoutCleanup])

  const handleDone = () => {
    deletePendingKeyRecovery()
    setRecoveryKey(null)
    setShowModal(false)
    window.location.reload()
  }

  if (cleanupError) {
    return (
      <div
        className="fixed inset-0 z-[110] flex items-center justify-center bg-surface-chat-background px-4"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cleanup-error-title"
      >
        <div className="w-full max-w-md rounded-site-lg border border-border-subtle bg-surface-card p-6 text-center shadow-xl">
          <h2
            id="cleanup-error-title"
            className="text-lg font-semibold text-content-primary"
          >
            Unable to clear local data
          </h2>
          <p className="mt-3 text-sm text-content-secondary">
            {cleanupError.message} Close any other Tinfoil tabs, then retry
            before continuing.
          </p>
          <button
            type="button"
            onClick={() => {
              if (!cleanupError.retryStorage) {
                window.location.reload()
                return
              }

              setCleanupRetrying(true)
              void retryFailedStorageCleanup()
                .then(() => window.location.reload())
                .catch(() => {
                  setCleanupRetrying(false)
                  setCleanupError({
                    message:
                      'Local data still could not be cleared after another tab changed accounts.',
                    retryStorage: true,
                  })
                })
            }}
            disabled={cleanupRetrying}
            className="mt-6 rounded-lg bg-brand-accent-dark px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-accent-dark/90"
          >
            {cleanupRetrying ? 'Retrying cleanup...' : 'Retry cleanup'}
          </button>
        </div>
      </div>
    )
  }

  if (!isLoaded || isSignedIn !== false || !showModal) {
    return null
  }

  return (
    <SignoutConfirmationModal
      isOpen={showModal}
      onDone={handleDone}
      encryptionKey={recoveryKey}
      isDarkMode={isDarkMode}
    />
  )
}
