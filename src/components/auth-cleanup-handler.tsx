import { SignoutConfirmationModal } from '@/components/modals/signout-confirmation-modal'
import { AUTH_ACTIVE_USER_ID } from '@/constants/storage-keys'
import { logError, logInfo } from '@/utils/error-handling'
import {
  deleteEncryptionKey,
  getEncryptionKey,
  hasPasskeyBackup,
  performSignoutCleanup,
  performUserSwitchCleanup,
} from '@/utils/signout-cleanup'
import { useAuth, useUser } from '@clerk/nextjs'
import { useEffect, useRef, useState } from 'react'

export function AuthCleanupHandler() {
  const { isSignedIn, isLoaded } = useAuth()
  const { user } = useUser()
  const [showModal, setShowModal] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const hasCheckedRef = useRef(false)

  useEffect(() => {
    if (!isLoaded) return

    if (isSignedIn && user?.id) {
      const storedUserId = localStorage.getItem(AUTH_ACTIVE_USER_ID)

      if (storedUserId && storedUserId !== user.id) {
        // Different user signed in — clear all previous user data + reload
        performUserSwitchCleanup(user.id)
        return
      }

      // Same user or fresh sign-in — persist the active user ID
      localStorage.setItem(AUTH_ACTIVE_USER_ID, user.id)
    }

    // Check if user just signed out (stored user ID exists but no longer signed in)
    const storedUserId = localStorage.getItem(AUTH_ACTIVE_USER_ID)
    if (!isSignedIn && storedUserId && !hasCheckedRef.current) {
      hasCheckedRef.current = true

      const encryptionKey = getEncryptionKey()

      if (hasPasskeyBackup() || !encryptionKey) {
        // Keys are safely backed up via passkey, or no key exists — clear everything
        const action = hasPasskeyBackup()
          ? 'signoutWithPasskey'
          : 'signoutWithoutKey'
        logInfo('Auto-clearing all data on signout', {
          component: 'AuthCleanupHandler',
          action,
        })
        // Remove the active user ID first so that if cleanup throws before
        // localStorage.clear(), the reload won't re-enter this branch and loop.
        localStorage.removeItem(ACTIVE_USER_ID_KEY)
        performSignoutCleanup()
          .catch((error) => {
            logError('Failed to cleanup on signout', error, {
              component: 'AuthCleanupHandler',
              action,
            })
          })
          .finally(() => {
            window.location.reload()
          })
        return
      }

      // Key exists but no passkey backup — preserve key and show download modal
      logInfo('No passkey backup, preserving key for download prompt', {
        component: 'AuthCleanupHandler',
        action: 'signoutWithoutPasskey',
      })
      performSignoutCleanup({ preserveEncryptionKey: true })
        .catch((error) => {
          logError('Failed to cleanup on signout (preserving key)', error, {
            component: 'AuthCleanupHandler',
            action: 'signoutWithoutPasskey',
          })
        })
        .finally(() => {
          // Check theme from data-theme attribute (source of truth)
          const dataTheme = document.documentElement.getAttribute('data-theme')
          setIsDarkMode(dataTheme === 'dark')
          setShowModal(true)
        })
    }

    // Reset the check flag when user signs in
    if (isSignedIn) {
      hasCheckedRef.current = false
    }
  }, [isSignedIn, isLoaded, user?.id])

  const handleDone = () => {
    deleteEncryptionKey()
    setShowModal(false)
    window.location.reload()
  }

  if (!showModal) {
    return null
  }

  return (
    <SignoutConfirmationModal
      isOpen={showModal}
      onDone={handleDone}
      encryptionKey={getEncryptionKey()}
      isDarkMode={isDarkMode}
    />
  )
}
