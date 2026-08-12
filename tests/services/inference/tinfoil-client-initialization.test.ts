import {
  getVerificationDocument,
  resetTinfoilClient,
  TinfoilClientInitializationTimeoutError,
} from '@/services/inference/tinfoil-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  ready: vi.fn<() => Promise<void>>(),
  getVerificationDocument: vi.fn(() => ({ securityVerified: true })),
  secureClientConstructed: vi.fn(),
}))

vi.mock('@/config', () => ({
  API_BASE_URL: 'https://api.example.com',
  DEV_API_KEY: '',
  IS_DEV: false,
}))

vi.mock('@/services/auth', () => ({
  authTokenManager: {
    isInitialized: () => false,
    waitForInit: vi.fn(),
    getValidToken: vi.fn(),
  },
}))

vi.mock('@/utils/error-handling', () => ({
  logError: vi.fn(),
}))

vi.mock('openai', () => ({
  default: class OpenAI {},
  AuthenticationError: class AuthenticationError extends Error {},
}))

vi.mock('tinfoil', () => ({
  AuthenticationError: class AuthenticationError extends Error {},
  SecureClient: class SecureClient {
    constructor() {
      mocks.secureClientConstructed()
    }

    ready = mocks.ready
    getVerificationDocument = mocks.getVerificationDocument
    getBaseURL = () => 'https://enclave.example.com'
    fetch = vi.fn()
  },
}))

const chatKeyResponse = () =>
  new Response(JSON.stringify({ key: 'session-key' }), { status: 200 })

describe('tinfoil client initialization', () => {
  beforeEach(() => {
    resetTinfoilClient()
    mocks.ready.mockReset()
    mocks.ready.mockResolvedValue()
    mocks.getVerificationDocument.mockClear()
    mocks.secureClientConstructed.mockClear()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => chatKeyResponse()),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shares one attestation across concurrent callers', async () => {
    const first = getVerificationDocument()
    const second = getVerificationDocument()

    await expect(Promise.all([first, second])).resolves.toEqual([
      { securityVerified: true },
      { securityVerified: true },
    ])
    expect(mocks.secureClientConstructed).toHaveBeenCalledTimes(1)
    expect(mocks.ready).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('prevents a reset initialization from publishing its client', async () => {
    let resolveReady: () => void = () => {}
    mocks.ready.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveReady = resolve
      }),
    )

    const staleInitialization = getVerificationDocument()
    const staleRejection = expect(staleInitialization).rejects.toMatchObject({
      name: 'AbortError',
    })
    await vi.waitFor(() => expect(mocks.ready).toHaveBeenCalledTimes(1))

    resetTinfoilClient()
    resolveReady()
    await staleRejection

    await expect(getVerificationDocument()).resolves.toEqual({
      securityVerified: true,
    })
    expect(mocks.secureClientConstructed).toHaveBeenCalledTimes(2)
  })

  it('settles when attestation never completes', async () => {
    vi.useFakeTimers()
    mocks.ready.mockReturnValueOnce(new Promise<void>(() => {}))

    const initialization = getVerificationDocument()
    const timeoutRejection = expect(initialization).rejects.toBeInstanceOf(
      TinfoilClientInitializationTimeoutError,
    )
    await vi.advanceTimersByTimeAsync(20_000)

    await timeoutRejection
  })
})
