import { profileSync } from '@/services/cloud/profile-sync'
import { deletedChatsTracker } from '@/services/storage/deleted-chats-tracker'
import { indexedDBStorage } from '@/services/storage/indexed-db'
import { logError, logInfo } from '@/utils/error-handling'

const LOCAL_STORAGE_KEYS = [
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
  'tinfoil-encryption-key',
] as const

export async function performSignoutCleanup(): Promise<void> {
  try {
    logInfo('Starting signout cleanup', {
      component: 'signoutCleanup',
      action: 'performSignoutCleanup',
    })

    // Clear profile sync cache
    profileSync.clearCache()
    logInfo('Cleared profile sync cache', {
      component: 'signoutCleanup',
      action: 'clearProfileCache',
    })

    // Clear deleted chats tracker
    deletedChatsTracker.clear()
    logInfo('Cleared deleted chats tracker', {
      component: 'signoutCleanup',
      action: 'clearDeletedChatsTracker',
    })

    // Clear specific localStorage items first
    LOCAL_STORAGE_KEYS.forEach((key) => {
      try {
        localStorage.removeItem(key)
      } catch (error) {
        logInfo(`Failed to remove localStorage item: ${key}`, {
          component: 'signoutCleanup',
          action: 'clearLocalStorage',
          metadata: { key },
        })
      }
    })

    // Then clear all remaining localStorage items
    try {
      localStorage.clear()
    } catch (error) {
      logInfo('Failed to clear all localStorage', {
        component: 'signoutCleanup',
        action: 'clearLocalStorage',
      })
    }

    // Clear sessionStorage
    try {
      sessionStorage.clear()
    } catch (error) {
      logInfo('Failed to clear sessionStorage', {
        component: 'signoutCleanup',
        action: 'clearSessionStorage',
      })
    }

    // Clear IndexedDB
    try {
      await indexedDBStorage.clearAll()
      logInfo('Cleared IndexedDB', {
        component: 'signoutCleanup',
        action: 'clearIndexedDB',
      })
    } catch (error) {
      logError('Failed to clear IndexedDB during signout', error, {
        component: 'signoutCleanup',
        action: 'clearIndexedDB',
      })
    }

    // Clear service worker caches
    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map((name) => caches.delete(name)))
        logInfo('Cleared service worker caches', {
          component: 'signoutCleanup',
          action: 'clearCaches',
        })
      } catch (error) {
        logInfo('Failed to clear caches during signout', {
          component: 'signoutCleanup',
          action: 'clearCaches',
        })
      }
    }

    logInfo('Signout cleanup completed', {
      component: 'signoutCleanup',
      action: 'performSignoutCleanup',
    })
  } catch (error) {
    logError('Error during signout cleanup', error, {
      component: 'signoutCleanup',
      action: 'performSignoutCleanup',
    })
    throw error
  }
}

export function hasEncryptionKey(): boolean {
  if (typeof window === 'undefined') return false
  return !!localStorage.getItem('tinfoil-encryption-key')
}

export function getEncryptionKey(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('tinfoil-encryption-key')
}

export function redirectToHome(): void {
  window.location.href = '/'
}
