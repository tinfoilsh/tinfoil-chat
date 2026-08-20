import { AuthCleanupHandler } from '@/components/auth-cleanup-handler'
import { ACCOUNT_RESET_FAILED_EVENT } from '@/constants/auth-events'
import {
  AUTH_ACCOUNT_RESET_FAILED,
  AUTH_ACTIVE_USER_ID,
  AUTH_ANONYMOUS_RESTORE_PENDING_CLEANUP,
  AUTH_SIGNOUT_PENDING_CLEANUP,
  SETTINGS_CLOUD_SYNC_ENABLED,
  USER_ENCRYPTION_KEY,
} from '@/constants/storage-keys'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockPerformSignoutCleanup = vi.fn()
const mockPerformUserSwitchCleanup = vi.fn()
const mockRetryFailedStorageCleanup = vi.fn()

let authState: { isSignedIn: boolean; isLoaded: boolean } = {
  isSignedIn: false,
  isLoaded: true,
}
let userState: { user: { id: string } | null } = { user: null }

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => authState,
  useUser: () => userState,
}))

vi.mock('@/utils/error-handling', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}))

vi.mock('@/utils/signout-cleanup', () => ({
  performSignoutCleanup: (...args: unknown[]) =>
    mockPerformSignoutCleanup(...args),
  performUserSwitchCleanup: (...args: unknown[]) =>
    mockPerformUserSwitchCleanup(...args),
  retryFailedStorageCleanup: (...args: unknown[]) =>
    mockRetryFailedStorageCleanup(...args),
}))

describe('AuthCleanupHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    localStorage.clear()
    sessionStorage.clear()
    authState = { isSignedIn: false, isLoaded: true }
    userState = { user: null }
    mockPerformSignoutCleanup.mockResolvedValue(undefined)
    mockPerformUserSwitchCleanup.mockResolvedValue(undefined)
    mockRetryFailedStorageCleanup.mockResolvedValue(undefined)
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
    authState = { isSignedIn: true, isLoaded: true }
    userState = { user: { id: 'user_123' } }
    rerender(createElement(AuthCleanupHandler))
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    expect(mockPerformSignoutCleanup).not.toHaveBeenCalled()
  })

  it('preserves local account data during slow auth hydration', async () => {
    localStorage.setItem(AUTH_ACTIVE_USER_ID, 'user_123')
    localStorage.setItem(USER_ENCRYPTION_KEY, 'key_cek')
    localStorage.setItem(SETTINGS_CLOUD_SYNC_ENABLED, 'true')
    const { rerender } = render(createElement(AuthCleanupHandler))

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    authState = { isSignedIn: true, isLoaded: true }
    userState = { user: { id: 'user_123' } }
    rerender(createElement(AuthCleanupHandler))

    expect(mockPerformSignoutCleanup).not.toHaveBeenCalled()
    expect(localStorage.getItem(USER_ENCRYPTION_KEY)).toBe('key_cek')
    expect(localStorage.getItem(SETTINGS_CLOUD_SYNC_ENABLED)).toBe('true')
  })

  it('clears everything after an observed session signs out', async () => {
    authState = { isSignedIn: true, isLoaded: true }
    userState = { user: { id: 'user_123' } }
    const { rerender } = render(createElement(AuthCleanupHandler))

    authState = { isSignedIn: false, isLoaded: true }
    userState = { user: null }
    rerender(createElement(AuthCleanupHandler))
    await act(async () => {
      vi.advanceTimersByTime(2000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockPerformSignoutCleanup).toHaveBeenCalledTimes(1)
    expect(window.location.reload).toHaveBeenCalledTimes(1)
  })

  it('clears this tab after cross-tab sign-out removed the account marker', async () => {
    authState = { isSignedIn: true, isLoaded: true }
    userState = { user: { id: 'user_123' } }
    const { rerender } = render(createElement(AuthCleanupHandler))
    localStorage.removeItem(AUTH_ACTIVE_USER_ID)

    authState = { isSignedIn: false, isLoaded: true }
    userState = { user: null }
    rerender(createElement(AuthCleanupHandler))
    await act(async () => {
      vi.advanceTimersByTime(2000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockPerformSignoutCleanup).toHaveBeenCalledTimes(1)
  })

  it('serializes cleanup for rapid account changes', async () => {
    const firstCleanup = createDeferred<void>()
    const secondCleanup = createDeferred<void>()
    mockPerformUserSwitchCleanup
      .mockReturnValueOnce(firstCleanup.promise)
      .mockReturnValueOnce(secondCleanup.promise)
    localStorage.setItem(AUTH_ACTIVE_USER_ID, 'user_old')
    authState = { isSignedIn: true, isLoaded: true }
    userState = { user: { id: 'user_new' } }
    const { rerender } = render(createElement(AuthCleanupHandler))

    authState = { isSignedIn: true, isLoaded: true }
    userState = { user: { id: 'user_latest' } }
    rerender(createElement(AuthCleanupHandler))
    await act(async () => {
      firstCleanup.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockPerformUserSwitchCleanup).toHaveBeenNthCalledWith(1, 'user_new')
    expect(mockPerformUserSwitchCleanup).toHaveBeenNthCalledWith(
      2,
      'user_latest',
    )
    expect(window.location.reload).not.toHaveBeenCalled()

    await act(async () => {
      secondCleanup.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(localStorage.getItem(AUTH_ACTIVE_USER_ID)).toBe('user_latest')
    expect(window.location.reload).toHaveBeenCalledTimes(1)
  })

  it('isolates an anonymous restore before activating an account', async () => {
    localStorage.setItem(AUTH_ANONYMOUS_RESTORE_PENDING_CLEANUP, 'true')
    authState = { isSignedIn: true, isLoaded: true }
    userState = { user: { id: 'user_new' } }
    render(createElement(AuthCleanupHandler))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockPerformUserSwitchCleanup).toHaveBeenCalledWith('user_new')
    expect(localStorage.getItem(AUTH_ACTIVE_USER_ID)).toBe('user_new')
    expect(window.location.reload).toHaveBeenCalledTimes(1)
  })

  it('deletes legacy pending recovery without reading its key', () => {
    const legacyKey = 'tinfoil-pending-encryption-key-recovery'
    localStorage.setItem(
      legacyKey,
      JSON.stringify({ encryptionKey: 'key_must_not_be_restored' }),
    )
    const getItem = vi.spyOn(localStorage, 'getItem')

    render(createElement(AuthCleanupHandler))

    expect(getItem.mock.calls.some(([key]) => key === legacyKey)).toBe(false)
    expect(localStorage.getItem(legacyKey)).toBeNull()
  })

  it('retries a failed reset signaled by another tab', async () => {
    render(createElement(AuthCleanupHandler))
    act(() => {
      window.dispatchEvent(new CustomEvent(ACCOUNT_RESET_FAILED_EVENT))
    })
    fireEvent.click(screen.getByRole('button', { name: 'Retry cleanup' }))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockRetryFailedStorageCleanup).toHaveBeenCalledTimes(1)
    expect(window.location.reload).toHaveBeenCalledTimes(1)
  })

  it('restores a cross-tab reset failure reported before mount', () => {
    sessionStorage.setItem(AUTH_ACCOUNT_RESET_FAILED, 'true')
    render(createElement(AuthCleanupHandler))

    expect(
      screen.getByRole('alertdialog', { name: 'Unable to clear local data' }),
    ).toBeTruthy()
  })

  it('blocks a signed-out remount until pending cleanup is retried', async () => {
    localStorage.setItem(AUTH_SIGNOUT_PENDING_CLEANUP, 'true')
    render(createElement(AuthCleanupHandler))
    await act(async () => {})

    expect(
      screen.getByRole('alertdialog', {
        name: 'Unable to clear local data',
      }),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Retry cleanup' }))
    await act(async () => {
      await Promise.resolve()
    })

    expect(mockPerformSignoutCleanup).toHaveBeenCalledTimes(1)
  })

  it('does not retry signout cleanup after a session signs in', async () => {
    localStorage.setItem(AUTH_SIGNOUT_PENDING_CLEANUP, 'true')
    const { rerender } = render(createElement(AuthCleanupHandler))
    await act(async () => {})

    authState = { isSignedIn: true, isLoaded: true }
    userState = { user: { id: 'user_123' } }
    rerender(createElement(AuthCleanupHandler))
    fireEvent.click(screen.getByRole('button', { name: 'Retry cleanup' }))

    expect(mockPerformSignoutCleanup).not.toHaveBeenCalled()
    expect(window.location.reload).toHaveBeenCalledTimes(1)
  })

  it('prioritizes a cross-tab reset when both cleanup markers exist', async () => {
    sessionStorage.setItem(AUTH_ACCOUNT_RESET_FAILED, 'true')
    localStorage.setItem(AUTH_SIGNOUT_PENDING_CLEANUP, 'true')
    render(createElement(AuthCleanupHandler))
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Retry cleanup' }))
    await act(async () => {
      await Promise.resolve()
    })

    expect(mockRetryFailedStorageCleanup).toHaveBeenCalledTimes(1)
    expect(mockPerformSignoutCleanup).not.toHaveBeenCalled()
  })
})
