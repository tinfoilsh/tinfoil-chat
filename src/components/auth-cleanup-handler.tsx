import { resetRendererRegistry } from '@/components/chat/renderers'
import { SignoutConfirmationModal } from '@/components/modals/signout-confirmation-modal'
import { encryptionService } from '@/services/encryption/encryption-service'
import { indexedDBStorage } from '@/services/storage/indexed-db'
import { logError, logInfo } from '@/utils/error-handling'
import {
  ACTIVE_USER_ID_KEY,
  getEncryptionKey,
  performSignoutCleanup,
} from '@/utils/signout-cleanup'
import { useAuth, useUser } from '@clerk/nextjs'
import { useEffect, useRef, useState } from 'react'

function performUserSwitchCleanup(newUserId: string): void {
  logInfo('User switch detected, clearing all data', {
    component: 'AuthCleanupHandler',
    action: 'performUserSwitchCleanup',
    metadata: { newUserId },
  })

  // Persist the new user ID first so it survives the reload
  localStorage.setItem(ACTIVE_USER_ID_KEY, newUserId)

  // Nuke the encryption key in-memory immediately
  encryptionService.clearKey({ persist: true })

  // Reset in-memory caches
  resetRendererRegistry()

  // Clear localStorage, preserving only the new active user ID and intro flag
  const hasSeenWebSearchIntro = localStorage.getItem(
    'has_seen_web_search_intro',
  )
  localStorage.clear()
  localStorage.setItem(ACTIVE_USER_ID_KEY, newUserId)
  if (hasSeenWebSearchIntro) {
    localStorage.setItem('has_seen_web_search_intro', hasSeenWebSearchIntro)
  }

  // Clear sessionStorage
  try {
    sessionStorage.clear()
  } catch {
    // best-effort
  }

  // Clear IndexedDB async, then reload regardless of outcome
  indexedDBStorage
    .clearAll()
    .catch((error) => {
      logError('Failed to clear IndexedDB during user switch', error, {
        component: 'AuthCleanupHandler',
        action: 'performUserSwitchCleanup',
      })
    })
    .finally(() => {
      window.location.reload()
    })
}

export function AuthCleanupHandler() {
  const { isSignedIn, isLoaded } = useAuth()
  const { user } = useUser()
  const [showModal, setShowModal] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const hasCheckedRef = useRef(false)

  useEffect(() => {
    if (!isLoaded) return

    if (isSignedIn && user?.id) {
      const storedUserId = localStorage.getItem(ACTIVE_USER_ID_KEY)

      if (storedUserId && storedUserId !== user.id) {
        // Different user signed in — clear all previous user data + reload
        performUserSwitchCleanup(user.id)
        return
      }

      // Same user or fresh sign-in — persist the active user ID
      localStorage.setItem(ACTIVE_USER_ID_KEY, user.id)
    }

    // Check if user just signed out (stored user ID exists but no longer signed in)
    const storedUserId = localStorage.getItem(ACTIVE_USER_ID_KEY)
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
