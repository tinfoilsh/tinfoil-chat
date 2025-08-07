'use client'

import { SignoutConfirmationModal } from '@/components/modals/signout-confirmation-modal'
import {
  getEncryptionKey,
  hasEncryptionKey,
  performSignoutCleanup,
  redirectToHome,
} from '@/utils/signout-cleanup'
import { useCallback, useEffect, useState } from 'react'

export default function SignoutCompletePage() {
  // Initialize state immediately to reduce lag
  const [showModal] = useState(() => hasEncryptionKey())
  const [isDarkMode] = useState(() => {
    if (typeof window === 'undefined') return false
    const theme = localStorage.getItem('theme')
    return (
      theme === 'dark' ||
      (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)
    )
  })

  // If no encryption key, cleanup and redirect immediately
  useEffect(() => {
    if (!showModal) {
      performSignoutCleanup().then(redirectToHome).catch(redirectToHome)
    }
  }, [showModal])

  const handleKeepData = useCallback(() => {
    // User wants to keep data - just redirect
    redirectToHome()
  }, [])

  const handleDeleteData = useCallback(async () => {
    // User wants to delete data - perform cleanup
    await performSignoutCleanup()
    redirectToHome()
  }, [])

  // Show loading state if no modal is needed
  if (!showModal) {
    return (
      <div
        className={`min-h-screen ${
          isDarkMode ? 'bg-gray-900' : 'bg-gray-50'
        } flex items-center justify-center`}
      >
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-gray-600" />
          <p
            className={`mt-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}
          >
            Completing signout...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}
    >
      <SignoutConfirmationModal
        isOpen={true}
        onClose={handleKeepData}
        onConfirm={handleDeleteData}
        encryptionKey={getEncryptionKey()}
        isDarkMode={isDarkMode}
      />
    </div>
  )
}
