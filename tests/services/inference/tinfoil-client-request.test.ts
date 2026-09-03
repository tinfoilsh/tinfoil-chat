import {
  inferenceRequest,
  resetTinfoilClient,
} from '@/services/inference/tinfoil-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  enclaveFetch: vi.fn<typeof fetch>(),
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

vi.mock('tinfoil', () => ({
  SecureClient: class SecureClient {
    constructor() {
      mocks.secureClientConstructed()
    }

    ready = async () => undefined
    getVerificationDocument = () => ({ securityVerified: true })
    getBaseURL = () => 'https://enclave.example.com/v1'
    fetch = mocks.enclaveFetch
  },
}))

/** Each call mints a distinct key so a replay's key is visibly fresher. */
function sessionKeys() {
  let issued = 0
  return vi.fn().mockImplementation(
    async () =>
      new Response(JSON.stringify({ key: `session-key-${++issued}` }), {
        status: 200,
      }),
  )
}

function authOf(call: number): string | undefined {
  const init = mocks.enclaveFetch.mock.calls[call]?.[1]
  return (init?.headers as Record<string, string>)?.Authorization
}

describe('inferenceRequest', () => {
  beforeEach(() => {
    resetTinfoilClient()
    mocks.enclaveFetch.mockReset()
    mocks.secureClientConstructed.mockClear()
    vi.stubGlobal('fetch', sessionKeys())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts to the attested enclave with the session key', async () => {
    mocks.enclaveFetch.mockResolvedValue(new Response('{}', { status: 200 }))

    await inferenceRequest('/chat/completions', '{"model":"m"}', {
      headers: { 'Content-Type': 'application/json' },
    })

    const [url, init] = mocks.enclaveFetch.mock.calls[0]
    expect(url).toBe('https://enclave.example.com/v1/chat/completions')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe('{"model":"m"}')
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer session-key-1',
      'Content-Type': 'application/json',
    })
  })

  it('replays a 401 once with a freshly minted key', async () => {
    mocks.enclaveFetch
      .mockResolvedValueOnce(new Response('nope', { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))

    const response = await inferenceRequest('/chat/completions', '{}')

    expect(response.status).toBe(200)
    expect(mocks.enclaveFetch).toHaveBeenCalledTimes(2)
    expect(authOf(0)).toBe('Bearer session-key-1')
    expect(authOf(1)).toBe('Bearer session-key-2')
    // A stale key says nothing about the enclave, so the replay reuses it
    // rather than paying for a second attestation.
    expect(mocks.secureClientConstructed).toHaveBeenCalledTimes(1)
  })

  it('surfaces a second 401 rather than replaying again', async () => {
    mocks.enclaveFetch.mockResolvedValue(new Response('nope', { status: 401 }))

    const response = await inferenceRequest('/chat/completions', '{}')

    expect(response.status).toBe(401)
    expect(mocks.enclaveFetch).toHaveBeenCalledTimes(2)
  })

  it('hands back every other status untouched, without a replay', async () => {
    mocks.enclaveFetch.mockResolvedValue(new Response('boom', { status: 503 }))

    const response = await inferenceRequest('/chat/completions', '{}')

    expect(response.status).toBe(503)
    expect(await response.text()).toBe('boom')
    expect(mocks.enclaveFetch).toHaveBeenCalledTimes(1)
  })
})
