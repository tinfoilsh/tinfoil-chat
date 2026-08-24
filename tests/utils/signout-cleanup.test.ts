import { resetRendererRegistry } from '@/components/chat/renderers'
import { PINNED_CHAT_IDS_CHANGED_EVENT } from '@/constants/settings-events'
import {
  AUTH_ACCOUNT_RESET_FAILED,
  AUTH_ACTIVE_USER_ID,
  SETTINGS_HAS_SEEN_ONBOARDING,
  USER_PREFS_PINNED_CHAT_IDS,
} from '@/constants/storage-keys'
import { cloudSync } from '@/services/cloud/cloud-sync'
import { resetEditClockCache } from '@/services/cloud/edit-clock'
import { profileSync } from '@/services/cloud/profile-sync'
import { invalidateProfileSyncGeneration } from '@/services/cloud/profile-sync-coordinator'
import { resetSyncHealth } from '@/services/cloud/sync-health'
import { encryptionService } from '@/services/encryption/encryption-service'
import { resetTinfoilClient } from '@/services/inference/tinfoil-client'
import { projectEvents } from '@/services/project/project-events'
import { deletedChatsTracker } from '@/services/storage/deleted-chats-tracker'
import { indexedDBStorage } from '@/services/storage/indexed-db'
import { resetSyncEnclaveClient } from '@/services/sync-enclave'
import {
  performSignoutCleanup,
  performUserSwitchCleanup,
  retryFailedStorageCleanup,
} from '@/utils/signout-cleanup'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/chat/renderers', () => ({
  resetRendererRegistry: vi.fn(),
}))

vi.mock('@/services/cloud/cloud-sync', () => ({
  cloudSync: { resetForAccountChange: vi.fn() },
}))

vi.mock('@/services/cloud/edit-clock', () => ({
  resetEditClockCache: vi.fn(),
}))

vi.mock('@/services/cloud/profile-sync', () => ({
  profileSync: { clearCache: vi.fn() },
}))

vi.mock('@/services/cloud/profile-sync-coordinator', () => ({
  invalidateProfileSyncGeneration: vi.fn(),
}))

vi.mock('@/services/cloud/sync-health', () => ({
  resetSyncHealth: vi.fn(),
}))

vi.mock('@/services/encryption/encryption-service', () => ({
  encryptionService: { clearKey: vi.fn() },
}))

vi.mock('@/services/inference/tinfoil-client', () => ({
  resetTinfoilClient: vi.fn(),
}))

vi.mock('@/services/project/project-events', () => ({
  projectEvents: { clear: vi.fn() },
}))

vi.mock('@/services/storage/deleted-chats-tracker', () => ({
  deletedChatsTracker: { clear: vi.fn() },
}))

vi.mock('@/services/storage/indexed-db', () => ({
  indexedDBStorage: {
    resetForAccountChange: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/services/sync-enclave', () => ({
  resetSyncEnclaveClient: vi.fn(),
}))

vi.mock('@/utils/error-handling', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}))

describe('performSignoutCleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('preserves the browser onboarding flag while clearing user data', async () => {
    localStorage.setItem(SETTINGS_HAS_SEEN_ONBOARDING, 'true')
    localStorage.setItem('user-specific-data', 'value')

    await performSignoutCleanup()

    expect(localStorage.getItem(SETTINGS_HAS_SEEN_ONBOARDING)).toBe('true')
    expect(localStorage.getItem('user-specific-data')).toBeNull()
  })

  it('clears sessionStorage', async () => {
    sessionStorage.setItem('session-data', 'value')

    await performSignoutCleanup()

    expect(sessionStorage.getItem('session-data')).toBeNull()
  })

  it('clears pinned chats from storage and active UI state', async () => {
    localStorage.setItem(USER_PREFS_PINNED_CHAT_IDS, '["chat-a"]')
    const handlePinnedChatsChanged = vi.fn()
    window.addEventListener(
      PINNED_CHAT_IDS_CHANGED_EVENT,
      handlePinnedChatsChanged,
    )

    try {
      await performSignoutCleanup()

      expect(localStorage.getItem(USER_PREFS_PINNED_CHAT_IDS)).toBeNull()
      expect(handlePinnedChatsChanged).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener(
        PINNED_CHAT_IDS_CHANGED_EVENT,
        handlePinnedChatsChanged,
      )
    }
  })

  it('does not dispatch pinned-chat changes during an account switch', async () => {
    const handlePinnedChatsChanged = vi.fn()
    window.addEventListener(
      PINNED_CHAT_IDS_CHANGED_EVENT,
      handlePinnedChatsChanged,
    )

    try {
      await performUserSwitchCleanup('user_new')

      expect(handlePinnedChatsChanged).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener(
        PINNED_CHAT_IDS_CHANGED_EVENT,
        handlePinnedChatsChanged,
      )
    }
  })

  it('clears the encryption key and every user data cache', async () => {
    await performSignoutCleanup()

    expect(encryptionService.clearKey).toHaveBeenCalledWith({ persist: true })
    expect(resetRendererRegistry).toHaveBeenCalled()
    expect(resetTinfoilClient).toHaveBeenCalled()
    expect(resetSyncEnclaveClient).toHaveBeenCalled()
    expect(profileSync.clearCache).toHaveBeenCalled()
    expect(invalidateProfileSyncGeneration).toHaveBeenCalledWith(true)
    expect(cloudSync.resetForAccountChange).toHaveBeenCalled()
    expect(deletedChatsTracker.clear).toHaveBeenCalled()
    expect(resetSyncHealth).toHaveBeenCalled()
    expect(resetEditClockCache).toHaveBeenCalled()
    expect(projectEvents.clear).toHaveBeenCalled()
    expect(indexedDBStorage.resetForAccountChange).toHaveBeenCalled()
  })

  it('keeps the encryption key when preserveEncryptionKey is set', async () => {
    await performSignoutCleanup({ preserveEncryptionKey: true })

    expect(encryptionService.clearKey).not.toHaveBeenCalled()
    expect(indexedDBStorage.resetForAccountChange).toHaveBeenCalled()
  })

  it('keeps the active-user marker until browser data is cleared', async () => {
    let finishReset!: () => void
    vi.mocked(indexedDBStorage.resetForAccountChange).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishReset = resolve
      }),
    )
    localStorage.setItem(AUTH_ACTIVE_USER_ID, 'user_123')
    const clearLocalStorage = vi.spyOn(localStorage, 'clear')

    const cleanup = performSignoutCleanup()
    await Promise.resolve()

    expect(localStorage.getItem(AUTH_ACTIVE_USER_ID)).toBe('user_123')
    expect(clearLocalStorage).not.toHaveBeenCalled()

    finishReset()
    await cleanup

    expect(localStorage.getItem(AUTH_ACTIVE_USER_ID)).toBeNull()
  })

  it('keeps the active-user marker when browser data cannot be cleared', async () => {
    vi.mocked(indexedDBStorage.resetForAccountChange).mockRejectedValueOnce(
      new Error('reset failed'),
    )
    localStorage.setItem(AUTH_ACTIVE_USER_ID, 'user_123')

    await expect(performSignoutCleanup()).rejects.toThrow('reset failed')

    expect(localStorage.getItem(AUTH_ACTIVE_USER_ID)).toBe('user_123')
  })

  it('surfaces user-switch cleanup failures without replacing the marker', async () => {
    vi.mocked(indexedDBStorage.resetForAccountChange).mockRejectedValueOnce(
      new Error('reset failed'),
    )
    localStorage.setItem(AUTH_ACTIVE_USER_ID, 'user_old')

    await expect(performUserSwitchCleanup('user_new')).rejects.toThrow(
      'reset failed',
    )

    expect(localStorage.getItem(AUTH_ACTIVE_USER_ID)).toBe('user_old')
  })

  it('retries a failed cross-tab reset without notifying other tabs', async () => {
    sessionStorage.setItem(AUTH_ACCOUNT_RESET_FAILED, 'true')

    await retryFailedStorageCleanup()

    expect(indexedDBStorage.resetForAccountChange).toHaveBeenCalledWith(false)
    expect(deletedChatsTracker.clear).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem(AUTH_ACCOUNT_RESET_FAILED)).toBeNull()
  })
})
