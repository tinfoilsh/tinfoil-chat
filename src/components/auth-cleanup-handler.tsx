import {
  ACCOUNT_RESET_FAILED_EVENT,
  AUTH_ACTIVE_USER_CHANGED_EVENT,
} from '@/constants/auth-events'
import {
  AUTH_ACCOUNT_RESET_FAILED,
  AUTH_ACTIVE_USER_ID,
  AUTH_ANONYMOUS_RESTORE_PENDING_CLEANUP,
} from '@/constants/storage-keys'
import { logError, logInfo } from '@/utils/error-handling'
import {
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
const LEGACY_PENDING_ENCRYPTION_KEY_RECOVERY_STORAGE_KEY =
  'tinfoil-pending-encryption-key-recovery'

export function AuthCleanupHandler() {
  const { isSignedIn, isLoaded } = useAuth()
  const { user } = useUser()
  const [cleanupError, setCleanupError] = useState<{
    message: string
    retryStorage: boolean
  } | null>(null)
  const [cleanupRetrying, setCleanupRetrying] = useState(false)
  const hasCheckedRef = useRef(false)
  const hadSignedInSessionRef = useRef(false)
  const pendingSignoutCleanupRef = useRef<number | null>(null)
  const pendingUserSwitchCleanupRef = useRef<Promise<void> | null>(null)
  const authGenerationRef = useRef(0)
  const previousAuthStateRef = useRef({
    isLoaded,
    isSignedIn,
    userId: user?.id,
  })
  const latestAuthStateRef = useRef({
    isLoaded,
    isSignedIn,
    userId: user?.id,
    authGeneration: authGenerationRef.current,
  })

  useEffect(() => {
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
    latestAuthStateRef.current = {
      isLoaded,
      isSignedIn,
      userId: user?.id,
      authGeneration: authGenerationRef.current,
    }
  }, [isLoaded, isSignedIn, user?.id])

  useEffect(() => {
    try {
      localStorage.removeItem(
        LEGACY_PENDING_ENCRYPTION_KEY_RECOVERY_STORAGE_KEY,
      )
    } catch {
      // Best-effort migration cleanup when browser storage is unavailable.
    }
  }, [])

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

  const activateUser = useCallback((userId: string) => {
    localStorage.setItem(AUTH_ACTIVE_USER_ID, userId)
    window.dispatchEvent(new Event(AUTH_ACTIVE_USER_CHANGED_EVENT))
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
            hadSignedInSessionRef.current = false
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

          activateUser(targetUserId)
          window.location.reload()
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
    [activateUser],
  )

  const runSignoutCleanup = useCallback(() => {
    completeSignoutStep(SIGNOUT_STEPS.SIGN_OUT)
    logInfo('Clearing all data after signout', {
      component: 'AuthCleanupHandler',
      action: 'signout',
    })
    void performSignoutCleanup()
      .then(() => {
        hadSignedInSessionRef.current = false
        reportSignoutStep(SIGNOUT_STEPS.RELOAD)
        window.location.reload()
      })
      .catch((error) => {
        logError('Failed to cleanup on signout', error, {
          component: 'AuthCleanupHandler',
          action: 'signout',
        })
        hideSignoutProgress()
        setCleanupError({
          message: 'Local data could not be cleared after signing out.',
          retryStorage: false,
        })
      })
  }, [])

  useEffect(() => {
    if (!isLoaded) return
    if (cleanupError) {
      clearPendingSignoutCleanup()
      return
    }

    if (isSignedIn && user?.id) {
      hadSignedInSessionRef.current = true
      hasCheckedRef.current = false
      clearPendingSignoutCleanup()
      const storedUserId = localStorage.getItem(AUTH_ACTIVE_USER_ID)
      const hasAnonymousRestore =
        localStorage.getItem(AUTH_ANONYMOUS_RESTORE_PENDING_CLEANUP) === 'true'

      if (hasAnonymousRestore || (storedUserId && storedUserId !== user.id)) {
        runUserSwitchCleanup(user.id, authGenerationRef.current)
        return
      }

      if (!storedUserId) activateUser(user.id)
      return
    }

    const storedUserId = localStorage.getItem(AUTH_ACTIVE_USER_ID)
    const shouldCleanup =
      isSignedIn === false &&
      (storedUserId !== null || hadSignedInSessionRef.current)

    if (shouldCleanup && !hasCheckedRef.current) {
      if (pendingSignoutCleanupRef.current === null) {
        pendingSignoutCleanupRef.current = window.setTimeout(() => {
          pendingSignoutCleanupRef.current = null
          const latestAuthState = latestAuthStateRef.current
          const stillHasAccountData =
            localStorage.getItem(AUTH_ACTIVE_USER_ID) !== null ||
            hadSignedInSessionRef.current

          if (
            !latestAuthState.isLoaded ||
            latestAuthState.isSignedIn ||
            !stillHasAccountData
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
  }, [
    activateUser,
    clearPendingSignoutCleanup,
    cleanupError,
    isLoaded,
    isSignedIn,
    runSignoutCleanup,
    runUserSwitchCleanup,
    user?.id,
  ])

  useEffect(() => clearPendingSignoutCleanup, [clearPendingSignoutCleanup])

  if (!cleanupError) return null

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
          {cleanupError.message} Close any other Tinfoil tabs, then retry before
          continuing.
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
