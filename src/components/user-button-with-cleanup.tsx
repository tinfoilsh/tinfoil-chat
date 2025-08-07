'use client'

import { SignoutConfirmationModal } from '@/components/modals/signout-confirmation-modal'
import { profileSync } from '@/services/cloud/profile-sync'
import { indexedDBStorage } from '@/services/storage/indexed-db'
import { logError, logInfo } from '@/utils/error-handling'
import { useClerk, UserButton } from '@clerk/nextjs'
import { useEffect, useRef, useState } from 'react'

interface UserButtonWithCleanupProps {
  appearance?: {
    elements?: {
      avatarBox?: string
    }
  }
}

export function UserButtonWithCleanup({
  appearance,
}: UserButtonWithCleanupProps) {
  const { signOut } = useClerk()
  const cleanupPerformed = useRef(false)
  const [showSignoutModal, setShowSignoutModal] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)

  // Check for dark mode
  useEffect(() => {
    const checkDarkMode = () => {
      const theme = localStorage.getItem('theme')
      setIsDarkMode(
        theme === 'dark' ||
          (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches),
      )
    }

    checkDarkMode()
    window.addEventListener('themeChanged', checkDarkMode)
    return () => window.removeEventListener('themeChanged', checkDarkMode)
  }, [])

  // Intercept signout clicks
  useEffect(() => {
    const handleClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement

      // Check if the clicked element or its parent is the sign-out button
      const isSignOutButton =
        target.closest('[aria-label="Sign out"]') ||
        target
          .closest('button')
          ?.textContent?.toLowerCase()
          .includes('sign out')

      if (isSignOutButton && !cleanupPerformed.current) {
        e.preventDefault()
        e.stopPropagation()

        // Show confirmation modal instead of immediately signing out
        setShowSignoutModal(true)
      }
    }

    // Add listener to document to catch clicks on UserButton menu
    document.addEventListener('click', handleClick, true)

    return () => {
      document.removeEventListener('click', handleClick, true)
    }
  }, [signOut])

  const performSignout = async () => {
    if (!cleanupPerformed.current) {
      cleanupPerformed.current = true

      try {
        logInfo('Starting signout cleanup', {
          component: 'UserButtonWithCleanup',
          action: 'handleSignOut',
        })

        // Clear profile sync cache
        profileSync.clearCache()
        logInfo('Cleared profile sync cache', {
          component: 'UserButtonWithCleanup',
          action: 'clearProfileCache',
        })

        // Clear all localStorage items
        // We specifically list important items to ensure they're cleared
        const itemsToClear = [
          'theme',
          'maxPromptMessages',
          'userLanguage',
          'userNickname',
          'userProfession',
          'userTraits',
          'userAdditionalContext',
          'isUsingPersonalization',
          'encryptionKey',
          'encryptionKeySet',
          'hasUnlockedCloud',
          'clerk-db-jwt',
          '__clerk_db_jwt',
        ]

        itemsToClear.forEach((item) => {
          try {
            localStorage.removeItem(item)
          } catch (e) {
            logInfo(`Failed to remove localStorage item: ${item}`, {
              component: 'UserButtonWithCleanup',
              action: 'clearLocalStorage',
            })
          }
        })

        // Clear all remaining localStorage items
        try {
          localStorage.clear()
        } catch (error) {
          logInfo('Failed to clear all localStorage', {
            component: 'UserButtonWithCleanup',
            action: 'clearLocalStorage',
          })
        }

        // Clear sessionStorage
        try {
          sessionStorage.clear()
        } catch (error) {
          logInfo('Failed to clear sessionStorage', {
            component: 'UserButtonWithCleanup',
            action: 'clearSessionStorage',
          })
        }

        // Clear IndexedDB - all chats and stored data
        try {
          await indexedDBStorage.clearAll()
          logInfo('Cleared IndexedDB', {
            component: 'UserButtonWithCleanup',
            action: 'clearIndexedDB',
          })
        } catch (error) {
          logError('Failed to clear IndexedDB during signout', error, {
            component: 'UserButtonWithCleanup',
            action: 'clearIndexedDB',
          })
        }

        // Clear any service worker caches
        if ('caches' in window) {
          try {
            const cacheNames = await caches.keys()
            await Promise.all(
              cacheNames.map((cacheName) => caches.delete(cacheName)),
            )
            logInfo('Cleared service worker caches', {
              component: 'UserButtonWithCleanup',
              action: 'clearCaches',
            })
          } catch (error) {
            logInfo('Failed to clear caches during signout', {
              component: 'UserButtonWithCleanup',
              action: 'clearCaches',
            })
          }
        }

        logInfo('Signout cleanup completed, signing out', {
          component: 'UserButtonWithCleanup',
          action: 'handleSignOut',
        })

        // Sign out and reload the page
        try {
          await signOut()
          // Force reload from server (bypass cache)
          window.location.reload()
        } catch (signOutError) {
          // If Clerk signOut fails, force reload anyway
          logError('Clerk signOut failed, forcing reload', signOutError, {
            component: 'UserButtonWithCleanup',
            action: 'handleSignOut',
          })
          window.location.reload()
        }
      } catch (error) {
        logError('Error during signout cleanup', error, {
          component: 'UserButtonWithCleanup',
          action: 'handleSignOut',
        })
        cleanupPerformed.current = false
        // Force reload even if cleanup fails
        window.location.reload()
      }
    }
  }

  const encryptionKey = localStorage.getItem('tinfoil-encryption-key')

  return (
    <>
      <UserButton appearance={appearance} />
      <SignoutConfirmationModal
        isOpen={showSignoutModal}
        onClose={() => {
          setShowSignoutModal(false)
          cleanupPerformed.current = false
        }}
        onConfirm={() => {
          setShowSignoutModal(false)
          performSignout()
        }}
        encryptionKey={encryptionKey}
        isDarkMode={isDarkMode}
      />
    </>
  )
}
