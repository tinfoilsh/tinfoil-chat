import { SignoutConfirmationModal } from '@/components/modals/signout-confirmation-modal'
import { AUTH_ACTIVE_USER_ID } from '@/constants/storage-keys'
import {
  getEncryptionKey,
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

      // Check theme from data-theme attribute (source of truth)
      const dataTheme = document.documentElement.getAttribute('data-theme')
      setIsDarkMode(dataTheme === 'dark')

      setShowModal(true)
    }

    // Reset the check flag when user signs in
    if (isSignedIn) {
      hasCheckedRef.current = false
    }
  }, [isSignedIn, isLoaded, user?.id])

  const handleKeepData = () => {
    localStorage.removeItem(AUTH_ACTIVE_USER_ID)
    setShowModal(false)
    // Force reload to clear all React state
    window.location.reload()
  }

  const handleDeleteData = async () => {
    await performSignoutCleanup()
    setShowModal(false)
    // Force reload to clear all React state
    window.location.reload()
  }

  if (!showModal) {
    return null
  }

  return (
    <SignoutConfirmationModal
      isOpen={showModal}
      onClose={handleKeepData}
      onConfirm={handleDeleteData}
      encryptionKey={getEncryptionKey()}
      isDarkMode={isDarkMode}
    />
  )
}
