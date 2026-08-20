import {
  LegacyPasskeyCredentialsTimeoutError,
  fetchLegacyPasskeyCredentials,
} from '@/services/passkey/legacy-passkey-credentials'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(),
  getAuthHeaders: vi.fn(),
  logError: vi.fn(),
}))

vi.mock('@/services/auth', () => ({
  authTokenManager: {
    isAuthenticated: mocks.isAuthenticated,
    getAuthHeaders: mocks.getAuthHeaders,
  },
}))

vi.mock('@/utils/error-handling', () => ({
  logError: mocks.logError,
}))

describe('fetchLegacyPasskeyCredentials', () => {
  beforeEach(() => {
    mocks.isAuthenticated.mockResolvedValue(true)
    mocks.getAuthHeaders.mockResolvedValue({ Authorization: 'Bearer token' })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener(
              'abort',
              () => reject(init.signal?.reason),
              { once: true },
            )
          }),
      ),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('aborts a hanging request after the named timeout', async () => {
    vi.useFakeTimers()
    const credentialsPromise = fetchLegacyPasskeyCredentials({ timeoutMs: 50 })
    await Promise.resolve()
    await Promise.resolve()

    vi.advanceTimersByTime(50)

    await expect(credentialsPromise).rejects.toBeInstanceOf(
      LegacyPasskeyCredentialsTimeoutError,
    )
  })

  it('propagates caller cancellation to the request', async () => {
    const controller = new AbortController()
    const credentialsPromise = fetchLegacyPasskeyCredentials({
      signal: controller.signal,
      timeoutMs: 5_000,
    })
    await Promise.resolve()
    await Promise.resolve()

    controller.abort()

    await expect(credentialsPromise).rejects.toMatchObject({
      name: 'AbortError',
    })
  })
})
