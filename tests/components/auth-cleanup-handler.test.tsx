import { AuthCleanupHandler } from '@/components/auth-cleanup-handler'
import { AUTH_ACTIVE_USER_ID } from '@/constants/storage-keys'
import { act, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockPerformSignoutCleanup = vi.fn()
const mockPerformUserSwitchCleanup = vi.fn()
const mockGetEncryptionKey = vi.fn()
const mockHasPasskeyBackup = vi.fn()

let authState: { isSignedIn: boolean; isLoaded: boolean } = {
  isSignedIn: false,
  isLoaded: true,
}
let userState: { user: { id: string } | null } = {
  user: null,
}

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => authState,
  useUser: () => userState,
}))

vi.mock('@/components/modals/signout-confirmation-modal', () => ({
  SignoutConfirmationModal: () => null,
}))

vi.mock('@/utils/error-handling', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}))

vi.mock('@/utils/signout-cleanup', () => ({
  deleteEncryptionKey: vi.fn(),
  getEncryptionKey: (...args: any[]) => mockGetEncryptionKey(...args),
  hasPasskeyBackup: (...args: any[]) => mockHasPasskeyBackup(...args),
  performSignoutCleanup: (...args: any[]) => mockPerformSignoutCleanup(...args),
  performUserSwitchCleanup: (...args: any[]) =>
    mockPerformUserSwitchCleanup(...args),
}))

describe('AuthCleanupHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    localStorage.clear()

    authState = {
      isSignedIn: false,
      isLoaded: true,
    }
    userState = {
      user: null,
    }

    mockPerformSignoutCleanup.mockResolvedValue(undefined)
    mockPerformUserSwitchCleanup.mockImplementation(() => {})
    mockGetEncryptionKey.mockReturnValue(null)
    mockHasPasskeyBackup.mockReturnValue(true)
    vi.spyOn(window.location, 'reload').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('does not clear data for a transient signed-out state', async () => {
    localStorage.setItem(AUTH_ACTIVE_USER_ID, 'user_123')

    const { rerender } = render(createElement(AuthCleanupHandler))

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    authState = {
      isSignedIn: true,
      isLoaded: true,
    }
    userState = {
      user: { id: 'user_123' },
    }

    rerender(createElement(AuthCleanupHandler))

    await act(async () => {
      vi.advanceTimersByTime(2000)
      await Promise.resolve()
    })

    expect(mockPerformSignoutCleanup).not.toHaveBeenCalled()
    expect(mockPerformUserSwitchCleanup).not.toHaveBeenCalled()
  })

  it('clears data after the grace period when still signed out', async () => {
    localStorage.setItem(AUTH_ACTIVE_USER_ID, 'user_123')

    render(createElement(AuthCleanupHandler))

    await act(async () => {
      vi.advanceTimersByTime(2000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockPerformSignoutCleanup).toHaveBeenCalledTimes(1)
    expect(window.location.reload).toHaveBeenCalledTimes(1)
  })

  it('still clears data immediately on user switch', () => {
    localStorage.setItem(AUTH_ACTIVE_USER_ID, 'user_old')
    authState = {
      isSignedIn: true,
      isLoaded: true,
    }
    userState = {
      user: { id: 'user_new' },
    }

    render(createElement(AuthCleanupHandler))

    expect(mockPerformUserSwitchCleanup).toHaveBeenCalledWith('user_new')
    expect(mockPerformSignoutCleanup).not.toHaveBeenCalled()
  })
})
