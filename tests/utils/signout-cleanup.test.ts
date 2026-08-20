import { resetRendererRegistry } from '@/components/chat/renderers'
import { ACCOUNT_RESET_FAILED_EVENT } from '@/constants/auth-events'
import {
  AUTH_ACCOUNT_RESET_FAILED,
  AUTH_ACCOUNT_RESET_SIGNAL,
  AUTH_ACTIVE_USER_ID,
  AUTH_ANONYMOUS_RESTORE_PENDING_CLEANUP,
  AUTH_SIGNOUT_PENDING_CLEANUP,
  SECRET_PASSKEY_BACKED_UP,
  SETTINGS_HAS_SEEN_ONBOARDING,
  USER_ENCRYPTION_KEY,
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
import { logError } from '@/utils/error-handling'
import {
  getUserInitiatedSignoutWarnings,
  handleAccountResetStorageEvent,
  performSignoutCleanup,
  performUserInitiatedSignout,
  performUserSwitchCleanup,
  retryFailedStorageCleanup,
  shouldWarnAboutLocalOnlyChats,
} from '@/utils/signout-cleanup'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  encryptionService: {
    clearKey: vi.fn(),
    getKey: vi.fn(() => localStorage.getItem(USER_ENCRYPTION_KEY)),
  },
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
    getLocalOnlyChatCount: vi.fn().mockResolvedValue(0),
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
    vi.mocked(indexedDBStorage.resetForAccountChange).mockReset()
    vi.mocked(indexedDBStorage.resetForAccountChange).mockResolvedValue(
      undefined,
    )
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
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

  it('clears the encryption key and every user data cache', async () => {
    localStorage.setItem(USER_ENCRYPTION_KEY, 'key_primary')

    await performSignoutCleanup()

    expect(encryptionService.clearKey).toHaveBeenCalledWith({ persist: true })
    expect(localStorage.getItem(USER_ENCRYPTION_KEY)).toBeNull()
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

  it('cleans up immediately after user-initiated sign-out succeeds', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined)
    const reload = vi
      .spyOn(window.location, 'reload')
      .mockImplementation(() => {})

    await performUserInitiatedSignout(signOut)

    expect(signOut).toHaveBeenCalledTimes(1)
    expect(encryptionService.clearKey).toHaveBeenCalledTimes(1)
    expect(indexedDBStorage.resetForAccountChange).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('keeps local data when sign-out fails and allows a retry', async () => {
    const signOut = vi
      .fn()
      .mockRejectedValueOnce(new Error('sign out failed'))
      .mockResolvedValueOnce(undefined)
    const reload = vi
      .spyOn(window.location, 'reload')
      .mockImplementation(() => {})

    await expect(performUserInitiatedSignout(signOut)).rejects.toThrow(
      'sign out failed',
    )
    expect(encryptionService.clearKey).not.toHaveBeenCalled()
    expect(indexedDBStorage.resetForAccountChange).not.toHaveBeenCalled()

    await performUserInitiatedSignout(signOut)

    expect(signOut).toHaveBeenCalledTimes(2)
    expect(encryptionService.clearKey).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('coalesces concurrent user and auth-handler cleanup', async () => {
    let finishReset!: () => void
    vi.mocked(indexedDBStorage.resetForAccountChange).mockReturnValue(
      new Promise<void>((resolve) => {
        finishReset = resolve
      }),
    )
    vi.spyOn(window.location, 'reload').mockImplementation(() => {})

    const userCleanup = performUserInitiatedSignout(() => Promise.resolve())
    await Promise.resolve()
    const authCleanup = performSignoutCleanup()

    expect(encryptionService.clearKey).toHaveBeenCalledTimes(1)
    expect(indexedDBStorage.resetForAccountChange).toHaveBeenCalledTimes(1)

    finishReset()
    await Promise.all([userCleanup, authCleanup])
  })

  it('deletes legacy pending recovery without preserving its key', async () => {
    localStorage.setItem(
      'tinfoil-pending-encryption-key-recovery',
      JSON.stringify({ encryptionKey: 'key_legacy' }),
    )

    await performSignoutCleanup()

    expect(
      localStorage.getItem('tinfoil-pending-encryption-key-recovery'),
    ).toBeNull()
    expect(localStorage.getItem(USER_ENCRYPTION_KEY)).toBeNull()
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
    expect(localStorage.getItem(AUTH_SIGNOUT_PENDING_CLEANUP)).toBe('true')
  })

  it('clears a pending signout marker after cleanup succeeds', async () => {
    localStorage.setItem(AUTH_SIGNOUT_PENDING_CLEANUP, 'true')

    await performSignoutCleanup()

    expect(localStorage.getItem(AUTH_SIGNOUT_PENDING_CLEANUP)).toBeNull()
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

  it('keeps anonymous restore cleanup pending until all async work succeeds', async () => {
    localStorage.setItem(AUTH_ANONYMOUS_RESTORE_PENDING_CLEANUP, 'true')
    vi.stubGlobal('caches', {
      keys: vi
        .fn()
        .mockRejectedValueOnce(new Error('cache reset failed'))
        .mockResolvedValueOnce([]),
      delete: vi.fn(),
    })

    await expect(performUserSwitchCleanup('user_new')).rejects.toThrow(
      'cache reset failed',
    )
    expect(localStorage.getItem(AUTH_ANONYMOUS_RESTORE_PENDING_CLEANUP)).toBe(
      'true',
    )

    await performUserSwitchCleanup('user_new')
    expect(
      localStorage.getItem(AUTH_ANONYMOUS_RESTORE_PENDING_CLEANUP),
    ).toBeNull()
  })

  it('retries full cross-tab cleanup without notifying other tabs', async () => {
    sessionStorage.setItem(AUTH_ACCOUNT_RESET_FAILED, 'true')
    localStorage.setItem(USER_ENCRYPTION_KEY, 'key_primary')

    await retryFailedStorageCleanup()

    expect(indexedDBStorage.resetForAccountChange).toHaveBeenCalledWith(false)
    expect(encryptionService.clearKey).toHaveBeenCalledWith({ persist: true })
    expect(localStorage.getItem(USER_ENCRYPTION_KEY)).toBeNull()
    expect(deletedChatsTracker.clear).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem(AUTH_ACCOUNT_RESET_FAILED)).toBeNull()
  })

  it('clears in-memory and persisted data on a cross-tab reset signal', async () => {
    localStorage.setItem(USER_ENCRYPTION_KEY, 'key_primary')
    localStorage.setItem('account-data', 'value')
    sessionStorage.setItem('session-data', 'value')
    const reload = vi
      .spyOn(window.location, 'reload')
      .mockImplementation(() => {})

    handleAccountResetStorageEvent(
      new StorageEvent('storage', {
        key: AUTH_ACCOUNT_RESET_SIGNAL,
        newValue: 'reset_123',
      }),
    )

    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    expect(encryptionService.clearKey).toHaveBeenCalledWith({ persist: true })
    expect(localStorage.getItem(USER_ENCRYPTION_KEY)).toBeNull()
    expect(localStorage.getItem('account-data')).toBeNull()
    expect(sessionStorage.getItem('session-data')).toBeNull()
    expect(indexedDBStorage.resetForAccountChange).toHaveBeenCalledWith(false)
  })

  it('keeps a full cleanup retry path after a cross-tab failure', async () => {
    vi.mocked(indexedDBStorage.resetForAccountChange)
      .mockRejectedValueOnce(new Error('reset failed'))
      .mockResolvedValueOnce(undefined)
    const handleFailure = vi.fn()
    window.addEventListener(ACCOUNT_RESET_FAILED_EVENT, handleFailure)

    handleAccountResetStorageEvent(
      new StorageEvent('storage', {
        key: AUTH_ACCOUNT_RESET_SIGNAL,
        newValue: 'reset_123',
      }),
    )
    await vi.waitFor(() => expect(handleFailure).toHaveBeenCalledTimes(1))

    expect(sessionStorage.getItem(AUTH_ACCOUNT_RESET_FAILED)).toBe('true')
    await retryFailedStorageCleanup()
    expect(encryptionService.clearKey).toHaveBeenCalledTimes(2)
    expect(indexedDBStorage.resetForAccountChange).toHaveBeenNthCalledWith(
      2,
      false,
    )
    expect(sessionStorage.getItem(AUTH_ACCOUNT_RESET_FAILED)).toBeNull()
    window.removeEventListener(ACCOUNT_RESET_FAILED_EVENT, handleFailure)
  })

  it('warns only when actual local-only rows exist', async () => {
    vi.mocked(indexedDBStorage.getLocalOnlyChatCount).mockResolvedValueOnce(2)
    await expect(shouldWarnAboutLocalOnlyChats()).resolves.toBe(true)

    vi.mocked(indexedDBStorage.getLocalOnlyChatCount).mockResolvedValueOnce(0)
    await expect(shouldWarnAboutLocalOnlyChats()).resolves.toBe(false)
  })

  it('warns conservatively when local-only rows cannot be queried', async () => {
    vi.mocked(indexedDBStorage.getLocalOnlyChatCount).mockRejectedValueOnce(
      new Error('read failed'),
    )

    await expect(shouldWarnAboutLocalOnlyChats()).resolves.toBe(true)
    expect(logError).toHaveBeenCalledWith(
      'Failed to count local-only chats',
      expect.any(Error),
      expect.objectContaining({ action: 'shouldWarnAboutLocalOnlyChats' }),
    )
  })

  it('warns before user sign-out when a key has no verified passkey backup', async () => {
    const refreshPasskeyBackup = vi.fn().mockResolvedValue(false)

    await expect(
      getUserInitiatedSignoutWarnings('key_primary', refreshPasskeyBackup),
    ).resolves.toEqual({
      localOnlyChats: false,
      missingPasskeyBackup: true,
    })
    expect(refreshPasskeyBackup).toHaveBeenCalledWith({ clearOnUnknown: true })
  })

  it('warns for a persisted key before the key prop initializes', async () => {
    localStorage.setItem(USER_ENCRYPTION_KEY, 'key_persisted')
    const refreshPasskeyBackup = vi.fn().mockResolvedValue(false)

    await expect(
      getUserInitiatedSignoutWarnings(null, refreshPasskeyBackup),
    ).resolves.toEqual({
      localOnlyChats: false,
      missingPasskeyBackup: true,
    })
  })

  it('does not warn for a key with an authoritatively verified backup', async () => {
    const refreshPasskeyBackup = vi.fn().mockResolvedValue(true)

    await expect(
      getUserInitiatedSignoutWarnings('key_primary', refreshPasskeyBackup),
    ).resolves.toEqual({
      localOnlyChats: false,
      missingPasskeyBackup: false,
    })
  })

  it('does not warn about backup when no key is present', async () => {
    localStorage.setItem(SECRET_PASSKEY_BACKED_UP, 'true')
    const refreshPasskeyBackup = vi.fn().mockResolvedValue(null)

    await expect(
      getUserInitiatedSignoutWarnings(null, refreshPasskeyBackup),
    ).resolves.toEqual({
      localOnlyChats: false,
      missingPasskeyBackup: false,
    })
    expect(localStorage.getItem(SECRET_PASSKEY_BACKED_UP)).toBeNull()
  })
})
