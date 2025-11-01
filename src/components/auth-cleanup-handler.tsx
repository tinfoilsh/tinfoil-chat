'use client'

import { resetRendererRegistry } from '@/components/chat/renderers'
import { SignoutConfirmationModal } from '@/components/modals/signout-confirmation-modal'
import { encryptionService } from '@/services/encryption/encryption-service'
import { logInfo } from '@/utils/error-handling'
import {
  getEncryptionKey,
  performSignoutCleanup,
} from '@/utils/signout-cleanup'
import { useAuth, useUser } from '@clerk/nextjs'
import { useEffect, useRef, useState } from 'react'

export function AuthCleanupHandler() {
  const { isSignedIn, isLoaded } = useAuth()
  const { user } = useUser()
  const [showModal, setShowModal] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const hasCheckedRef = useRef(false)
  const previousUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isLoaded) return

    // Check if user switched (different user logged in)
    if (
      isSignedIn &&
      user?.id &&
      previousUserIdRef.current &&
      previousUserIdRef.current !== user.id
    ) {
      // User switched - reset renderer registry to prevent state leakage
      resetRendererRegistry()
      encryptionService.clearKey()
      logInfo('Reset renderer registry due to user switch', {
        component: 'AuthCleanupHandler',
        action: 'userSwitch',
        metadata: {
          previousUserId: previousUserIdRef.current,
          newUserId: user.id,
        },
      })
    }

    // Update the previous user ID BEFORE checking signout
    const wasSignedIn = previousUserIdRef.current !== null
    previousUserIdRef.current = user?.id || null

    // Check if user just signed out (was signed in before, now not signed in)
    if (!isSignedIn && wasSignedIn && !hasCheckedRef.current) {
      hasCheckedRef.current = true

      // Check theme - follow browser preference if no saved theme
      const theme = localStorage.getItem('theme')
      if (theme !== null) {
        setIsDarkMode(theme === 'dark')
      } else {
        // Use browser's color scheme preference
        setIsDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches)
      }

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
