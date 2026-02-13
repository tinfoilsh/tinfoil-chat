import { resetRendererRegistry } from '@/components/chat/renderers'
import { cloudSync } from '@/services/cloud/cloud-sync'
import { profileSync } from '@/services/cloud/profile-sync'
import { encryptionService } from '@/services/encryption/encryption-service'
import { resetTinfoilClient } from '@/services/inference/tinfoil-client'
import { projectEvents } from '@/services/project/project-events'
import { deletedChatsTracker } from '@/services/storage/deleted-chats-tracker'
import { indexedDBStorage } from '@/services/storage/indexed-db'
import { logError, logInfo } from '@/utils/error-handling'

export const ACTIVE_USER_ID_KEY = 'tinfoil-active-user-id'

interface ClearUserDataOptions {
  /** If set, preserve this user ID in localStorage after clearing */
  preserveUserId?: string
  /** Logging context label */
  context: string
}

async function clearAllUserData(options: ClearUserDataOptions): Promise<void> {
  const { context, preserveUserId } = options

  // Clear encryption key immediately (in-memory + localStorage) before any
  // async work, so concurrent code cannot re-persist a stale key.
  encryptionService.clearKey({ persist: true })

  // Reset renderer registry to clear any cached renderers
  resetRendererRegistry()

  // Reset tinfoil client to clear cached API key
  resetTinfoilClient()

  // Clear profile sync cache
  profileSync.clearCache()

  // Clear sync caches so stale state doesn't leak into the next session
  cloudSync.clearSyncStatus()
  deletedChatsTracker.clear()

  // Clear project event handlers
  projectEvents.clear()

  logInfo('Cleared in-memory caches', {
    component: context,
    action: 'clearAllUserData',
  })

  // Clear localStorage, preserving only non-user-specific keys
  try {
    const hasSeenWebSearchIntro = localStorage.getItem(
      'has_seen_web_search_intro',
    )
    localStorage.clear()
    if (hasSeenWebSearchIntro) {
      localStorage.setItem('has_seen_web_search_intro', hasSeenWebSearchIntro)
    }
    if (preserveUserId) {
      localStorage.setItem(ACTIVE_USER_ID_KEY, preserveUserId)
    }
  } catch {
    // best-effort — don't let localStorage failures skip remaining cleanup
  }

  // Clear sessionStorage
  try {
    sessionStorage.clear()
  } catch {
    // best-effort
  }

  // Clear IndexedDB
  try {
    await indexedDBStorage.clearAll()
  } catch (error) {
    logError('Failed to clear IndexedDB', error, {
      component: context,
      action: 'clearAllUserData',
    })
  }

  // Clear service worker caches
  if ('caches' in window) {
    try {
      const cacheNames = await caches.keys()
      await Promise.all(cacheNames.map((name) => caches.delete(name)))
    } catch {
      // best-effort
    }
  }
}

export async function performSignoutCleanup(): Promise<void> {
  try {
    logInfo('Starting signout cleanup', {
      component: 'signoutCleanup',
      action: 'performSignoutCleanup',
    })

    await clearAllUserData({ context: 'signoutCleanup' })

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

export function performUserSwitchCleanup(newUserId: string): void {
  logInfo('User switch detected, clearing all data', {
    component: 'AuthCleanupHandler',
    action: 'performUserSwitchCleanup',
    metadata: { newUserId },
  })

  clearAllUserData({
    context: 'AuthCleanupHandler',
    preserveUserId: newUserId,
  })
    .catch((error) => {
      logError('Failed to clear user data during switch', error, {
        component: 'AuthCleanupHandler',
        action: 'performUserSwitchCleanup',
      })
    })
    .finally(() => {
      window.location.reload()
    })
}

export function getEncryptionKey(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('tinfoil-encryption-key')
}
