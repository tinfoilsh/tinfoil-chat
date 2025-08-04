'use client'

import { indexedDBStorage } from '@/services/storage/indexed-db'
import { logInfo } from '@/utils/error-handling'
import { useAuth, UserButton } from '@clerk/nextjs'
import { useEffect } from 'react'

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
  const { isSignedIn } = useAuth()

  // Watch for sign out by monitoring isSignedIn state
  useEffect(() => {
    // Store the previous signed-in state
    const wasSignedIn = localStorage.getItem('wasSignedIn') === 'true'

    if (wasSignedIn && !isSignedIn) {
      // User just signed out, perform cleanup
      performCleanup()
    }

    // Update the signed-in state
    localStorage.setItem('wasSignedIn', isSignedIn ? 'true' : 'false')
  }, [isSignedIn])

  const performCleanup = async () => {
    try {
      logInfo('Starting signout cleanup', {
        component: 'UserButtonWithCleanup',
        action: 'performCleanup',
      })

      // Clear all localStorage items except the one we need to track sign-out
      const keysToKeep = ['wasSignedIn']
      const allKeys = Object.keys(localStorage)

      allKeys.forEach((key) => {
        if (!keysToKeep.includes(key)) {
          localStorage.removeItem(key)
        }
      })

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

      logInfo('Signout cleanup completed', {
        component: 'UserButtonWithCleanup',
        action: 'performCleanup',
      })
    } catch (error) {
      logInfo('Error during signout cleanup', {
        component: 'UserButtonWithCleanup',
        action: 'performCleanup',
      })
    }
  }

  return <UserButton appearance={appearance} />
}
