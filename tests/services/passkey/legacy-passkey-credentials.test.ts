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
    const rejection = expect(credentialsPromise).rejects.toBeInstanceOf(
      LegacyPasskeyCredentialsTimeoutError,
    )
    await vi.advanceTimersByTimeAsync(50)

    await rejection
  })

  it('propagates caller cancellation to the request', async () => {
    const controller = new AbortController()
    const credentialsPromise = fetchLegacyPasskeyCredentials({
      signal: controller.signal,
      timeoutMs: 5_000,
    })
    const rejection = expect(credentialsPromise).rejects.toMatchObject({
      name: 'AbortError',
    })
    controller.abort()

    await rejection
  })

  it.each(['isAuthenticated', 'getAuthHeaders'] as const)(
    'bounds hanging %s acquisition with the same timeout',
    async (method) => {
      vi.useFakeTimers()
      mocks[method].mockReturnValue(new Promise(() => {}))

      const credentialsPromise = fetchLegacyPasskeyCredentials({
        timeoutMs: 50,
      })
      const rejection = expect(credentialsPromise).rejects.toBeInstanceOf(
        LegacyPasskeyCredentialsTimeoutError,
      )
      await vi.advanceTimersByTimeAsync(50)

      await rejection
    },
  )
})
