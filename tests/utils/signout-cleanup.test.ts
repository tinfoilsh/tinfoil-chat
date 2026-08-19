import { resetRendererRegistry } from '@/components/chat/renderers'
import {
  AUTH_ACCOUNT_RESET_FAILED,
  AUTH_ACTIVE_USER_ID,
  PENDING_ENCRYPTION_KEY_RECOVERY,
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
import { writePendingKeyRecovery } from '@/utils/pending-key-recovery'
import {
  performSignoutCleanup,
  performUserSwitchCleanup,
  retryFailedStorageCleanup,
  shouldWarnAboutLocalOnlyChats,
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
    getLocalOnlyChatCount: vi.fn().mockResolvedValue(0),
    resetForAccountChange: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/services/sync-enclave', () => ({
  resetSyncEnclaveClient: vi.fn(),
}))

vi.mock('@/utils/pending-key-recovery', () => ({
  writePendingKeyRecovery: vi.fn(
    (ownerUserId: string, encryptionKey: string) => {
      const record = { version: 1, ownerUserId, encryptionKey }
      localStorage.setItem(
        PENDING_ENCRYPTION_KEY_RECOVERY,
        JSON.stringify(record),
      )
      return record
    },
  ),
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

  it('moves the primary key into recovery before clearing key storage', async () => {
    localStorage.setItem(USER_ENCRYPTION_KEY, 'key_primary')

    await performSignoutCleanup({ recoverEncryptionKeyForOwner: 'user_123' })

    expect(writePendingKeyRecovery).toHaveBeenCalledWith(
      'user_123',
      'key_primary',
    )
    expect(encryptionService.clearKey).toHaveBeenCalledWith({ persist: true })
    expect(
      vi.mocked(writePendingKeyRecovery).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(encryptionService.clearKey).mock.invocationCallOrder[0],
    )
    expect(localStorage.getItem(PENDING_ENCRYPTION_KEY_RECOVERY)).not.toBeNull()
    expect(indexedDBStorage.resetForAccountChange).toHaveBeenCalled()
  })

  it('does not clear the active key when pending recovery cannot be verified', async () => {
    localStorage.setItem(USER_ENCRYPTION_KEY, 'key_primary')
    vi.mocked(writePendingKeyRecovery).mockImplementationOnce(() => {
      throw new Error('verification failed')
    })

    await expect(
      performSignoutCleanup({ recoverEncryptionKeyForOwner: 'user_123' }),
    ).rejects.toThrow('verification failed')

    expect(encryptionService.clearKey).not.toHaveBeenCalled()
  })

  it('does not reset services when a requested recovery key is missing', async () => {
    await expect(
      performSignoutCleanup({ recoverEncryptionKeyForOwner: 'user_123' }),
    ).rejects.toThrow('No encryption key available')

    expect(cloudSync.resetForAccountChange).not.toHaveBeenCalled()
    expect(indexedDBStorage.resetForAccountChange).not.toHaveBeenCalled()
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
})
