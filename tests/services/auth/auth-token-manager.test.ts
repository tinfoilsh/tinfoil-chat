import {
  AuthTokenManager,
  AuthTokenRefreshError,
  AuthTokenUnavailableError,
} from '@/services/auth/auth-token-manager'
import { describe, expect, it, vi } from 'vitest'

describe('AuthTokenManager', () => {
  it('uses an ordinary Clerk token read by default', async () => {
    const getToken = vi.fn().mockResolvedValue('cached-token')
    const manager = new AuthTokenManager()
    manager.initialize(getToken)

    await expect(manager.getValidToken()).resolves.toBe('cached-token')
    expect(getToken).toHaveBeenCalledWith()
  })

  it('single-flights forced refreshes for the rejected token', async () => {
    let resolveRefresh!: (token: string) => void
    const getToken = vi.fn(
      () => new Promise<string>((resolve) => (resolveRefresh = resolve)),
    )
    const manager = new AuthTokenManager()
    manager.initialize(getToken)

    const first = manager.refreshToken('rejected-token')
    const second = manager.refreshToken('rejected-token')
    expect(first).toBe(second)
    expect(getToken).toHaveBeenCalledOnce()
    expect(getToken).toHaveBeenCalledWith({ skipCache: true })

    resolveRefresh('fresh-token')
    await expect(first).resolves.toBe('fresh-token')
  })

  it('throws typed unavailable and refresh errors', async () => {
    const manager = new AuthTokenManager()
    await expect(manager.getValidToken()).rejects.toBeInstanceOf(
      AuthTokenUnavailableError,
    )

    manager.initialize(vi.fn().mockResolvedValue(null))
    await expect(manager.refreshToken('rejected-token')).rejects.toBeInstanceOf(
      AuthTokenRefreshError,
    )
  })

  it('drops the provider and refresh state on reset', async () => {
    const manager = new AuthTokenManager()
    manager.initialize(vi.fn().mockResolvedValue('token'))
    manager.reset()

    expect(manager.isInitialized()).toBe(false)
    await expect(manager.getValidToken()).rejects.toMatchObject({
      reason: 'not-initialized',
    })
  })

  it('rejects an in-flight refresh after the account changes', async () => {
    let resolveOldRefresh!: (token: string) => void
    const manager = new AuthTokenManager()
    manager.initialize(
      vi.fn(
        () =>
          new Promise<string>((resolve) => {
            resolveOldRefresh = resolve
          }),
      ),
    )

    const refresh = manager.refreshToken('old-token')
    manager.reset()
    manager.initialize(vi.fn().mockResolvedValue('new-token'))
    resolveOldRefresh('old-account-token')

    await expect(refresh).rejects.toBeInstanceOf(AuthTokenRefreshError)
  })

  it('rejects an in-flight ordinary read after the account changes', async () => {
    let resolveOldRead!: (token: string) => void
    const manager = new AuthTokenManager()
    manager.initialize(
      vi.fn(
        () =>
          new Promise<string>((resolve) => {
            resolveOldRead = resolve
          }),
      ),
    )

    const read = manager.getValidToken()
    manager.reset()
    resolveOldRead('old-account-token')

    await expect(read).rejects.toBeInstanceOf(AuthTokenUnavailableError)
  })

  it('keeps persistent auth handling single-flight across resets', async () => {
    let resolveHandler!: () => void
    const handler = vi.fn(
      () => new Promise<void>((resolve) => (resolveHandler = resolve)),
    )
    const manager = new AuthTokenManager()
    manager.registerPersistentAuthHandler(handler)

    manager.handlePersistentAuthFailure()
    manager.handlePersistentAuthFailure()
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce())

    manager.reset()
    manager.handlePersistentAuthFailure()
    resolveHandler()
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce())

    await vi.waitFor(() => {
      manager.handlePersistentAuthFailure()
      expect(handler).toHaveBeenCalledTimes(2)
    })
  })
})
