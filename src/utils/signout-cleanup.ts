import { resetRendererRegistry } from '@/components/chat/renderers'
import { profileSync } from '@/services/cloud/profile-sync'
import { encryptionService } from '@/services/encryption/encryption-service'
import { resetTinfoilClient } from '@/services/inference/tinfoil-client'
import { projectEvents } from '@/services/project/project-events'
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
  'isUsingCustomPrompt',
  'customSystemPrompt',
  'encryptionKey',
  'encryptionKeySet',
  'hasUnlockedCloud',
  'clerk-db-jwt',
  '__clerk_db_jwt',
  'tinfoil-encryption-key',
  'tinfoil-encryption-key-history',
  'tinfoil-chat-sync-status',
  'tinfoil-profile-sync-status',
  'cloudSyncEnabled',
  'cloudSyncExplicitlyDisabled',
] as const

export async function performSignoutCleanup(): Promise<void> {
  try {
    logInfo('Starting signout cleanup', {
      component: 'signoutCleanup',
      action: 'performSignoutCleanup',
    })

    // Reset renderer registry to clear any cached renderers
    resetRendererRegistry()
    logInfo('Reset renderer registry', {
      component: 'signoutCleanup',
      action: 'resetRendererRegistry',
    })

    // Reset tinfoil client to clear cached API key
    resetTinfoilClient()
    logInfo('Reset tinfoil client', {
      component: 'signoutCleanup',
      action: 'resetTinfoilClient',
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

    // Clear project event handlers
    projectEvents.clear()
    logInfo('Cleared project event handlers', {
      component: 'signoutCleanup',
      action: 'clearProjectEvents',
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

    // Then clear all remaining localStorage items, preserving certain keys
    try {
      // Preserve keys that should persist across signout
      const hasSeenWebSearchIntro = localStorage.getItem(
        'has_seen_web_search_intro',
      )

      localStorage.clear()

      // Restore preserved keys
      if (hasSeenWebSearchIntro) {
        localStorage.setItem('has_seen_web_search_intro', hasSeenWebSearchIntro)
      }
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

    // Clear encryption key state without touching storage again
    encryptionService.clearKey({ persist: false })

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

export function getEncryptionKey(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('tinfoil-encryption-key')
}
