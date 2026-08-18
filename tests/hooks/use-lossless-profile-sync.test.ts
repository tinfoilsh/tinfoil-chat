import {
  SYNC_PROFILE_DIRTY,
  USER_PREFS_PINNED_CHAT_IDS,
} from '@/constants/storage-keys'
import { useProfileSync } from '@/hooks/use-lossless-profile-sync'
import type { ProfileData } from '@/services/cloud/profile-sync'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  localProfile: {} as ProfileData,
  fetchProfile: vi.fn(),
  saveProfile: vi.fn(),
}))

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isSignedIn: true, userId: 'user-1' }),
}))

vi.mock('@/services/cloud/cloud-key-authorization', () => ({
  getCurrentCloudKeyAuthorizationMode: vi.fn().mockResolvedValue('automatic'),
}))

vi.mock('@/services/cloud/profile-sync', () => ({
  profileSync: {
    fetchProfile: (...args: unknown[]) => mocks.fetchProfile(...args),
    getSyncStatus: vi.fn().mockResolvedValue(null),
    hasFailedRemoteDecryption: vi.fn(() => false),
    saveProfile: (...args: unknown[]) => mocks.saveProfile(...args),
  },
}))

vi.mock('@/services/cloud/profile-sync-coordinator', () => ({
  invalidateProfileSyncGeneration: vi.fn(),
  runSerializedProfileSync: async (
    _userId: string,
    sync: (isCurrent: () => boolean) => Promise<void>,
  ) => sync(() => true),
}))

vi.mock(
  '@/services/cloud/profile-settings-serializer',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/services/cloud/profile-settings-serializer')
      >()
    return {
      ...actual,
      applySettingsToLocal: (profile: ProfileData) => {
        mocks.localProfile = { ...profile }
      },
      loadLocalSettings: () => ({ ...mocks.localProfile }),
    }
  },
)

vi.mock('@/utils/cloud-sync-settings', () => ({
  CLOUD_SYNC_SETTING_CHANGED_EVENT: 'cloudSyncSettingChanged',
  isCloudSyncEnabled: vi.fn(() => true),
}))

vi.mock('@/utils/error-handling', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}))

describe('useProfileSync', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mocks.localProfile = {
      nickname: 'Remote',
      pinnedChatIds: ['chat-a'],
    }
    localStorage.setItem(USER_PREFS_PINNED_CHAT_IDS, '["chat-a"]')
    localStorage.setItem(SYNC_PROFILE_DIRTY, 'true')
    mocks.fetchProfile.mockResolvedValue({
      nickname: 'Remote',
      version: 4,
    })
    mocks.saveProfile.mockResolvedValue({ success: true, version: 5 })
  })

  it('uploads local favorites after establishing a missing baseline', async () => {
    const { unmount } = renderHook(() => useProfileSync())

    await waitFor(() => expect(mocks.saveProfile).toHaveBeenCalledTimes(1))

    expect(mocks.saveProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        nickname: 'Remote',
        pinnedChatIds: ['chat-a'],
        version: 4,
      }),
      expect.objectContaining({ nickname: 'Remote', version: 4 }),
    )
    expect(localStorage.getItem(SYNC_PROFILE_DIRTY)).toBeNull()
    unmount()
  })
})
