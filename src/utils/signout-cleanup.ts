import { resetRendererRegistry } from '@/components/chat/renderers'
import { ACCOUNT_RESET_FAILED_EVENT } from '@/constants/auth-events'
import {
  AUTH_ACCOUNT_RESET_FAILED,
  AUTH_ACCOUNT_RESET_SIGNAL,
  AUTH_ACTIVE_USER_ID,
  AUTH_ANONYMOUS_RESTORE_PENDING_CLEANUP,
  SECRET_PASSKEY_BACKED_UP,
  SETTINGS_HAS_SEEN_ONBOARDING,
  USER_ENCRYPTION_KEY,
} from '@/constants/storage-keys'
import { authTokenManager } from '@/services/auth'
import { cloudSync } from '@/services/cloud/cloud-sync'
import { resetEditClockCache } from '@/services/cloud/edit-clock'
import { profileSync } from '@/services/cloud/profile-sync'
import { invalidateProfileSyncGeneration } from '@/services/cloud/profile-sync-coordinator'
import { streamingTracker } from '@/services/cloud/streaming-tracker'
import { resetSyncHealth } from '@/services/cloud/sync-health'
import { encryptionService } from '@/services/encryption/encryption-service'
import { resetChatRecoveryState } from '@/services/inference/chat-recovery'
import { resetTinfoilClient } from '@/services/inference/tinfoil-client'
import { projectEvents } from '@/services/project/project-events'
import { deletedChatsTracker } from '@/services/storage/deleted-chats-tracker'
import { indexedDBStorage } from '@/services/storage/indexed-db'
import { projectCache } from '@/services/storage/project-cache'
import { resetSyncEnclaveClient } from '@/services/sync-enclave'
import { logError, logInfo } from '@/utils/error-handling'
import {
  completeSignoutStep,
  reportSignoutStep,
  SIGNOUT_STEPS,
} from '@/utils/signout-progress'

interface ClearUserDataOptions {
  /**
   * If true, don't surface progress in the signout overlay. Used for
   * user-switch cleanup, which is not a signout.
   */
  skipProgressReporting?: boolean
  /** Logging context label */
  context: string
  notifyOtherTabs?: boolean
}

let accountCleanupPromise: Promise<void> | null = null

async function clearAllUserData(options: ClearUserDataOptions): Promise<void> {
  const {
    context,
    notifyOtherTabs = true,
    skipProgressReporting = false,
  } = options

  const reportStep = (step: number) => {
    if (!skipProgressReporting) reportSignoutStep(step)
  }
  const completeStep = (step: number) => {
    if (!skipProgressReporting) completeSignoutStep(step)
  }

  invalidateProfileSyncGeneration(true)
  projectCache.invalidate()
  cloudSync.resetForAccountChange()
  streamingTracker.reset()
  authTokenManager.reset()

  // Clear encryption key immediately (in-memory + localStorage) before any
  // async work, so concurrent code cannot re-persist a stale key.
  reportStep(SIGNOUT_STEPS.CLEAR_KEY)
  encryptionService.clearKey({ persist: true })
  completeStep(SIGNOUT_STEPS.CLEAR_KEY)

  // Reset renderer registry to clear any cached renderers
  reportStep(SIGNOUT_STEPS.RESET_CACHES)
  resetRendererRegistry()

  // Reset tinfoil client to clear cached API key
  resetTinfoilClient()
  resetChatRecoveryState()

  // Drop the verified sync-enclave SecureClient so the next signed-in
  // user re-runs attestation from scratch.
  resetSyncEnclaveClient()

  // Clear profile sync cache
  profileSync.clearCache()

  deletedChatsTracker.clear()
  resetSyncHealth()

  // Drop the in-memory edit-clock counter/device-id so the next user
  // re-reads from cleared storage instead of inheriting this session's.
  resetEditClockCache()

  // Clear project event handlers
  projectEvents.clear()

  logInfo('Cleared in-memory caches', {
    component: context,
    action: 'clearAllUserData',
  })
  completeStep(SIGNOUT_STEPS.RESET_CACHES)

  // Clear localStorage, preserving only non-user-specific keys
  reportStep(SIGNOUT_STEPS.CLEAR_STORAGE)
  try {
    const preservedKeys = new Set([
      AUTH_ACTIVE_USER_ID,
      SETTINGS_HAS_SEEN_ONBOARDING,
    ])
    if (
      localStorage.getItem(AUTH_ANONYMOUS_RESTORE_PENDING_CLEANUP) === 'true'
    ) {
      preservedKeys.add(AUTH_ANONYMOUS_RESTORE_PENDING_CLEANUP)
    }
    const keys = Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index),
    )
    for (const key of keys) {
      if (key && !preservedKeys.has(key)) {
        localStorage.removeItem(key)
      }
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
  completeStep(SIGNOUT_STEPS.CLEAR_STORAGE)

  // Clear IndexedDB
  reportStep(SIGNOUT_STEPS.CLEAR_BROWSING_DATA)
  projectCache.invalidate()
  try {
    await indexedDBStorage.resetForAccountChange(notifyOtherTabs)
  } catch (error) {
    logError('Failed to clear IndexedDB', error, {
      component: context,
      action: 'clearAllUserData',
    })
    throw error
  }

  // Clear service worker caches
  if ('caches' in window) {
    try {
      const cacheNames = await caches.keys()
      await Promise.all(cacheNames.map((name) => caches.delete(name)))
    } catch (error) {
      logError('Failed to clear browser caches', error, {
        component: context,
        action: 'clearAllUserData',
      })
      throw error
    }
  }
  completeStep(SIGNOUT_STEPS.CLEAR_BROWSING_DATA)

  localStorage.removeItem(AUTH_ACTIVE_USER_ID)
  localStorage.removeItem(AUTH_ANONYMOUS_RESTORE_PENDING_CLEANUP)
}

function performAccountCleanup(options: ClearUserDataOptions): Promise<void> {
  if (accountCleanupPromise) return accountCleanupPromise

  const cleanup = clearAllUserData(options)
  accountCleanupPromise = cleanup
  void cleanup.then(
    () => {
      if (accountCleanupPromise === cleanup) accountCleanupPromise = null
    },
    () => {
      if (accountCleanupPromise === cleanup) accountCleanupPromise = null
    },
  )
  return cleanup
}

export async function performSignoutCleanup(): Promise<void> {
  try {
    logInfo('Starting signout cleanup', {
      component: 'signoutCleanup',
      action: 'performSignoutCleanup',
    })

    await performAccountCleanup({
      context: 'signoutCleanup',
    })

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

export async function performUserSwitchCleanup(
  newUserId: string,
): Promise<void> {
  logInfo('User switch detected, clearing all data', {
    component: 'AuthCleanupHandler',
    action: 'performUserSwitchCleanup',
    metadata: { newUserId },
  })

  try {
    await performAccountCleanup({
      context: 'AuthCleanupHandler',
      skipProgressReporting: true,
    })
  } catch (error) {
    logError('Failed to clear user data during switch', error, {
      component: 'AuthCleanupHandler',
      action: 'performUserSwitchCleanup',
    })
    throw error
  }
}

export function getEncryptionKey(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(USER_ENCRYPTION_KEY)
}

export function hasPasskeyBackup(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(SECRET_PASSKEY_BACKED_UP) === 'true'
}

export async function shouldWarnAboutLocalOnlyChats(): Promise<boolean> {
  try {
    return (await indexedDBStorage.getLocalOnlyChatCount()) > 0
  } catch (error) {
    logError('Failed to count local-only chats', error, {
      component: 'signoutCleanup',
      action: 'shouldWarnAboutLocalOnlyChats',
    })
    return true
  }
}

export interface UserInitiatedSignoutWarnings {
  localOnlyChats: boolean
  missingPasskeyBackup: boolean
}

export async function getUserInitiatedSignoutWarnings(
  encryptionKey: string | null,
  refreshPasskeyBackup?: (options: {
    clearOnUnknown: boolean
  }) => Promise<boolean | null>,
): Promise<UserInitiatedSignoutWarnings> {
  const refreshBackup = refreshPasskeyBackup
    ? refreshPasskeyBackup({ clearOnUnknown: true }).catch((error) => {
        logError('Failed to verify passkey backup before sign out', error, {
          component: 'signoutCleanup',
          action: 'getUserInitiatedSignoutWarnings',
        })
        return null
      })
    : Promise.resolve(null)
  const [localOnlyChats, backupVerified] = await Promise.all([
    shouldWarnAboutLocalOnlyChats(),
    refreshBackup,
  ])

  if (backupVerified !== true) {
    try {
      localStorage.removeItem(SECRET_PASSKEY_BACKED_UP)
    } catch {
      // Best-effort cleanup when browser storage is unavailable.
    }
  }

  return {
    localOnlyChats,
    missingPasskeyBackup: encryptionKey !== null && backupVerified !== true,
  }
}

export async function retryFailedStorageCleanup(): Promise<void> {
  try {
    await performAccountCleanup({
      context: 'crossTabAccountReset',
      notifyOtherTabs: false,
      skipProgressReporting: true,
    })
    sessionStorage.removeItem(AUTH_ACCOUNT_RESET_FAILED)
  } catch (error) {
    sessionStorage.setItem(AUTH_ACCOUNT_RESET_FAILED, 'true')
    throw error
  }
}

export async function performUserInitiatedSignout(
  signOut: () => Promise<unknown>,
): Promise<void> {
  await signOut()
  completeSignoutStep(SIGNOUT_STEPS.SIGN_OUT)
  await performSignoutCleanup()
  reportSignoutStep(SIGNOUT_STEPS.RELOAD)
  window.location.reload()
}

export function handleAccountResetStorageEvent(event: StorageEvent): void {
  if (event.key !== AUTH_ACCOUNT_RESET_SIGNAL || !event.newValue) return

  void retryFailedStorageCleanup()
    .then(() => window.location.reload())
    .catch((error) => {
      logError(
        'Failed to clear local data after cross-tab account change',
        error,
        {
          component: 'signoutCleanup',
          action: 'crossTabAccountReset',
        },
      )
      window.dispatchEvent(new CustomEvent(ACCOUNT_RESET_FAILED_EVENT))
    })
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', handleAccountResetStorageEvent)
}
