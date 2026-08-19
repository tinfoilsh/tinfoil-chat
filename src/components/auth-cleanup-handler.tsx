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
    recovery?: boolean
  } | null>(null)
  const [cleanupRetrying, setCleanupRetrying] = useState(false)
  const hasCheckedRef = useRef(false)
  const pendingSignoutCleanupRef = useRef<number | null>(null)
  const pendingUserSwitchCleanupRef = useRef<Promise<void> | null>(null)
  const pendingFreshSignInRef = useRef<{
    userId: string
    authGeneration: number
    reloadAfterRestore: boolean
  } | null>(null)
  const cleanupErrorRef = useRef(cleanupError)
  cleanupErrorRef.current = cleanupError
  const authGenerationRef = useRef(0)
  const previousAuthStateRef = useRef({
    isLoaded,
    isSignedIn,
    userId: user?.id,
  })
  const previousAuthState = previousAuthStateRef.current
  if (
    previousAuthState.isLoaded !== isLoaded ||
    previousAuthState.isSignedIn !== isSignedIn ||
    previousAuthState.userId !== user?.id
  ) {
    authGenerationRef.current += 1
    previousAuthStateRef.current = {
      isLoaded,
      isSignedIn,
      userId: user?.id,
    }
  }
  const latestAuthStateRef = useRef({
    isLoaded,
    isSignedIn,
    userId: user?.id,
    authGeneration: authGenerationRef.current,
  })
  latestAuthStateRef.current = {
    isLoaded,
    isSignedIn,
    userId: user?.id,
    authGeneration: authGenerationRef.current,
  }

  const refreshSignedOutRecovery = useCallback(() => {
    setRecoveryKey(null)
    setShowModal(false)

    const latestAuthState = latestAuthStateRef.current
    if (!latestAuthState.isLoaded || latestAuthState.isSignedIn !== false)
      return

    if (cleanupErrorRef.current?.recovery && !hasCheckedRef.current) return
    setCleanupError((current) => (current?.recovery ? null : current))
    const pending = getPendingKeyRecovery()
    const departingUserId = localStorage.getItem(AUTH_ACTIVE_USER_ID)
    if (departingUserId && pending?.ownerUserId !== departingUserId) return
    setRecoveryKey(pending?.encryptionKey ?? null)
    setShowModal(pending !== null)
  }, [])

  const restorePendingRecoveryForFreshSignIn = useCallback(async () => {
    setRecoveryKey(null)
    setShowModal(false)

    const latestAuthState = latestAuthStateRef.current
    let pendingSignIn = pendingFreshSignInRef.current
    if (
      !latestAuthState.isLoaded ||
      !latestAuthState.isSignedIn ||
      !latestAuthState.userId
    ) {
      return
    }

    if (
      !pendingSignIn ||
      pendingSignIn.userId !== latestAuthState.userId ||
      pendingSignIn.authGeneration !== latestAuthState.authGeneration
    ) {
      pendingSignIn = {
        userId: latestAuthState.userId,
        authGeneration: latestAuthState.authGeneration,
        reloadAfterRestore: pendingSignIn?.reloadAfterRestore ?? false,
      }
      pendingFreshSignInRef.current = pendingSignIn
      setCleanupError((current) => (current?.recovery ? null : current))
    }

    if (localStorage.getItem(AUTH_ACTIVE_USER_ID) === pendingSignIn.userId) {
      pendingFreshSignInRef.current = null
      setCleanupError((current) => (current?.recovery ? null : current))
      return
    }

    try {
      await restorePendingKeyForOwner(pendingSignIn.userId)
    } catch (error) {
      const currentAuthState = latestAuthStateRef.current
      if (
        !currentAuthState.isLoaded ||
        !currentAuthState.isSignedIn ||
        currentAuthState.userId !== pendingSignIn.userId ||
        currentAuthState.authGeneration !== pendingSignIn.authGeneration
      ) {
        return
      }
      logError('Failed to restore pending encryption key', error, {
        component: 'AuthCleanupHandler',
        action: 'restorePendingRecoveryForFreshSignIn',
      })
      setCleanupError({
        message:
          'Your encryption key could not be restored. Your recovery remains available.',
        retryStorage: false,
        recovery: true,
      })
      return
    }

    const currentAuthState = latestAuthStateRef.current
    if (
      !currentAuthState.isLoaded ||
      !currentAuthState.isSignedIn ||
      currentAuthState.userId !== pendingSignIn.userId ||
      currentAuthState.authGeneration !== pendingSignIn.authGeneration
    ) {
      return
    }

    localStorage.setItem(AUTH_ACTIVE_USER_ID, pendingSignIn.userId)
    window.dispatchEvent(new Event(AUTH_ACTIVE_USER_CHANGED_EVENT))
    pendingFreshSignInRef.current = null
    setCleanupError((current) => (current?.recovery ? null : current))
    if (pendingSignIn.reloadAfterRestore) window.location.reload()
  }, [])

  useEffect(() => {
    const handlePendingRecoveryChange = (event: StorageEvent) => {
      if (event.key !== PENDING_ENCRYPTION_KEY_RECOVERY) return
      refreshSignedOutRecovery()
    }
    window.addEventListener('storage', handlePendingRecoveryChange)
    return () =>
      window.removeEventListener('storage', handlePendingRecoveryChange)
  }, [refreshSignedOutRecovery])

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

  const runUserSwitchCleanup = useCallback(
    (initialUserId: string, initialAuthGeneration: number) => {
      if (pendingUserSwitchCleanupRef.current) return

      const cleanup = (async () => {
        let targetUserId = initialUserId
        let targetAuthGeneration = initialAuthGeneration

        while (true) {
          try {
            await performUserSwitchCleanup(targetUserId)
          } catch {
            const latestAuthState = latestAuthStateRef.current
            if (
              latestAuthState.isLoaded &&
              latestAuthState.isSignedIn &&
              latestAuthState.userId &&
              (latestAuthState.userId !== targetUserId ||
                latestAuthState.authGeneration !== targetAuthGeneration)
            ) {
              targetUserId = latestAuthState.userId
              targetAuthGeneration = latestAuthState.authGeneration
              continue
            }

            setCleanupError({
              message:
                'Local data from the previous account could not be cleared.',
              retryStorage: false,
            })
            return
          }

          const latestAuthState = latestAuthStateRef.current
          if (
            !latestAuthState.isLoaded ||
            !latestAuthState.isSignedIn ||
            !latestAuthState.userId
          ) {
            return
          }
          if (
            latestAuthState.userId !== targetUserId ||
            latestAuthState.authGeneration !== targetAuthGeneration
          ) {
            targetUserId = latestAuthState.userId
            targetAuthGeneration = latestAuthState.authGeneration
            continue
          }

          pendingFreshSignInRef.current = {
            userId: targetUserId,
            authGeneration: targetAuthGeneration,
            reloadAfterRestore: true,
          }
          await restorePendingRecoveryForFreshSignIn()

          const currentAuthState = latestAuthStateRef.current
          if (
            currentAuthState.isLoaded &&
            currentAuthState.isSignedIn &&
            currentAuthState.userId &&
            (currentAuthState.userId !== targetUserId ||
              currentAuthState.authGeneration !== targetAuthGeneration)
          ) {
            targetUserId = currentAuthState.userId
            targetAuthGeneration = currentAuthState.authGeneration
            continue
          }
          return
        }
      })()

      pendingUserSwitchCleanupRef.current = cleanup
      void cleanup.finally(() => {
        if (pendingUserSwitchCleanupRef.current === cleanup) {
          pendingUserSwitchCleanupRef.current = null
        }
      })
    },
    [restorePendingRecoveryForFreshSignIn],
  )

  const runSignoutCleanup = useCallback(() => {
    completeSignoutStep(SIGNOUT_STEPS.SIGN_OUT)
    const ownerUserId = localStorage.getItem(AUTH_ACTIVE_USER_ID)
    const pendingRecovery = getPendingKeyRecovery()
    if (pendingRecovery?.ownerUserId === ownerUserId) {
      logInfo('Preserving pending encryption key recovery after signout', {
        component: 'AuthCleanupHandler',
        action: 'resumePendingRecovery',
      })
      hideSignoutProgress()
      refreshSignedOutRecovery()
      return
    }
    const encryptionKey = getEncryptionKey()

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
        refreshSignedOutRecovery()
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
  }, [refreshSignedOutRecovery])

  useEffect(() => {
    if (!isLoaded) {
      refreshSignedOutRecovery()
      return
    }
    if (cleanupError && !cleanupError.recovery) {
      clearPendingSignoutCleanup()
      return
    }

    if (isSignedIn && user?.id) {
      clearPendingSignoutCleanup()
      setRecoveryKey(null)
      setShowModal(false)
      hasCheckedRef.current = false
      const storedUserId = localStorage.getItem(AUTH_ACTIVE_USER_ID)
      const hasAnonymousRestore =
        localStorage.getItem(AUTH_ANONYMOUS_RESTORE_PENDING_CLEANUP) === 'true'

      if (hasAnonymousRestore || (storedUserId && storedUserId !== user.id)) {
        // Different user signed in — clear all previous user data before recovery.
        if (!cleanupError || cleanupError.recovery) {
          setCleanupError((current) => (current?.recovery ? null : current))
          runUserSwitchCleanup(
            user.id,
            latestAuthStateRef.current.authGeneration,
          )
        }
        return
      }

      if (storedUserId === user.id) {
        pendingFreshSignInRef.current = null
        setCleanupError((current) => (current?.recovery ? null : current))
        return
      }

      if (pendingUserSwitchCleanupRef.current) return

      const pendingFreshSignIn = pendingFreshSignInRef.current
      if (
        !pendingFreshSignIn ||
        pendingFreshSignIn.userId !== user.id ||
        pendingFreshSignIn.authGeneration !==
          latestAuthStateRef.current.authGeneration
      ) {
        pendingFreshSignInRef.current = {
          userId: user.id,
          authGeneration: latestAuthStateRef.current.authGeneration,
          reloadAfterRestore: false,
        }
        setCleanupError((current) => (current?.recovery ? null : current))
        void restorePendingRecoveryForFreshSignIn()
      }
      return
    }

    refreshSignedOutRecovery()

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
  }, [
    isSignedIn,
    isLoaded,
    user?.id,
    clearPendingSignoutCleanup,
    cleanupError,
    refreshSignedOutRecovery,
    restorePendingRecoveryForFreshSignIn,
    runUserSwitchCleanup,
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
            {cleanupError.recovery
              ? 'Unable to restore encryption key'
              : 'Unable to clear local data'}
          </h2>
          <p className="mt-3 text-sm text-content-secondary">
            {cleanupError.message}{' '}
            {cleanupError.recovery
              ? 'Retry before continuing.'
              : 'Close any other Tinfoil tabs, then retry before continuing.'}
          </p>
          <button
            type="button"
            onClick={() => {
              if (cleanupError.recovery) {
                setCleanupRetrying(true)
                void restorePendingRecoveryForFreshSignIn().finally(() =>
                  setCleanupRetrying(false),
                )
                return
              }
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
            {cleanupRetrying
              ? cleanupError.recovery
                ? 'Retrying key restore...'
                : 'Retrying cleanup...'
              : cleanupError.recovery
                ? 'Retry key restore'
                : 'Retry cleanup'}
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
