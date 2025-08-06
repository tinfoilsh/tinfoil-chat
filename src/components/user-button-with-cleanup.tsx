'use client'

import { indexedDBStorage } from '@/services/storage/indexed-db'
import { logInfo } from '@/utils/error-handling'
import { useClerk, UserButton } from '@clerk/nextjs'
import { useEffect, useRef } from 'react'

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
        cleanupPerformed.current = true

        try {
          logInfo('Starting signout cleanup', {
            component: 'UserButtonWithCleanup',
            action: 'handleSignOut',
          })

          // Clear all localStorage
          localStorage.clear()

          // Clear sessionStorage
          sessionStorage.clear()

          // Clear IndexedDB - all chats and stored data
          try {
            await indexedDBStorage.clearAll()
          } catch (error) {
            logInfo('Failed to clear IndexedDB during signout', {
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

          // Sign out without redirect (we'll handle it manually)
          await signOut()

          // Redirect to the main site
          window.location.href = 'https://chat.tinfoil.sh'
        } catch (error) {
          logInfo('Error during signout', {
            component: 'UserButtonWithCleanup',
            action: 'handleSignOut',
          })
          cleanupPerformed.current = false
        }
      }
    }

    // Add listener to document to catch clicks on UserButton menu
    document.addEventListener('click', handleClick, true)

    return () => {
      document.removeEventListener('click', handleClick, true)
    }
  }, [signOut])

  return <UserButton appearance={appearance} />
}
