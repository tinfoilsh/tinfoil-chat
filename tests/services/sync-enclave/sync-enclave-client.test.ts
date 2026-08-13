import {
  resetSyncEnclaveClient,
  SyncEnclaveError,
} from '@/services/sync-enclave/sync-enclave-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the tinfoil SDK so tests don't try to verify a real enclave.
// vi.hoisted runs before vi.mock factory evaluation, which is the only
// safe place to declare variables that the factory closes over.
const {
  mockSecureClientConstructor,
  mockReady,
  mockFetch,
  mockGetVerificationDocument,
  mockGetValidToken,
  mockRefreshToken,
  mockReportSyncPaused,
} = vi.hoisted(() => ({
  mockSecureClientConstructor: vi.fn(),
  mockReady: vi.fn(),
  mockFetch: vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(),
  mockGetVerificationDocument: vi.fn().mockReturnValue({
    configRepo: 'tinfoilsh/confidential-sync',
    enclaveHost: 'sync.tinfoil.sh',
    securityVerified: true,
  }),
  mockGetValidToken: vi.fn().mockResolvedValue('test-jwt'),
  mockRefreshToken: vi.fn().mockResolvedValue('fresh-jwt'),
  mockReportSyncPaused: vi.fn(),
}))

vi.mock('tinfoil', () => ({
  AttestationError: class extends Error {},
  SecureClient: class {
    constructor(args?: unknown) {
      mockSecureClientConstructor(args)
    }

    ready = mockReady
    fetch = mockFetch
    getVerificationDocument = mockGetVerificationDocument
  },
}))

vi.mock('@/services/auth', () => ({
  authTokenManager: {
    getValidToken: mockGetValidToken,
    refreshToken: mockRefreshToken,
  },
}))

vi.mock('@/services/cloud/sync-health', () => ({
  reportSyncPaused: mockReportSyncPaused,
}))

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('SyncEnclaveClient', () => {
  beforeEach(() => {
    resetSyncEnclaveClient()
    mockSecureClientConstructor.mockReset()
    mockReady.mockReset().mockResolvedValue(undefined)
    mockFetch.mockReset()
    mockGetValidToken.mockReset().mockResolvedValue('test-jwt')
    mockRefreshToken.mockReset().mockResolvedValue('fresh-jwt')
    mockReportSyncPaused.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    vi.doUnmock('@/config')
    vi.resetModules()
  })

  it('verifies attestation before issuing the first request', async () => {
    const { getSyncEnclaveClient } =
      await import('@/services/sync-enclave/sync-enclave-client')
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))
    const client = await getSyncEnclaveClient()
    await client.get('/api/keys/current')
    expect(mockReady).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('constructs SecureClient with the HTTPS sync enclave config', async () => {
    const { getSyncEnclaveClient } =
      await import('@/services/sync-enclave/sync-enclave-client')
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))
    const client = await getSyncEnclaveClient()
    await client.get('/api/keys/current')
    expect(mockSecureClientConstructor).toHaveBeenCalledWith({
      enclaveURL: 'https://sync.tinfoil.sh',
      configRepo: 'tinfoilsh/confidential-sync',
    })
  })

  it('rejects non-HTTPS sync enclave URLs before attestation', async () => {
    vi.resetModules()
    vi.doMock('@/config', () => ({
      SYNC_ENCLAVE_URL: 'http://sync.tinfoil.sh',
      SYNC_ENCLAVE_REPO: 'tinfoilsh/confidential-sync',
      SYNC_ENCLAVE_TIMEOUTS: { READY_MS: 30000, REQUEST_MS: 30000 },
    }))
    const { getSyncEnclaveClient } =
      await import('@/services/sync-enclave/sync-enclave-client')
    await expect(getSyncEnclaveClient()).rejects.toMatchObject({
      name: 'SyncEnclaveError',
      code: 'INVALID_SYNC_ENCLAVE_URL',
    })
    expect(mockReady).not.toHaveBeenCalled()
  })

  it('rejects absolute request URLs so calls stay on the verified enclave', async () => {
    const { getSyncEnclaveClient } =
      await import('@/services/sync-enclave/sync-enclave-client')
    const client = await getSyncEnclaveClient()
    await expect(
      client.get('https://example.com/v1/health'),
    ).rejects.toMatchObject({
      name: 'SyncEnclaveError',
      code: 'INVALID_SYNC_ENCLAVE_PATH',
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('injects the Clerk JWT into outgoing requests', async () => {
    const { getSyncEnclaveClient } =
      await import('@/services/sync-enclave/sync-enclave-client')
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))
    const client = await getSyncEnclaveClient()
    await client.get('/api/keys/current')
    const headers = mockFetch.mock.calls[0][1]?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer test-jwt')
    expect(headers.get('Accept')).toBe('application/json')
  })

  it('can issue public enclave requests without a JWT', async () => {
    const { getSyncEnclaveClient } =
      await import('@/services/sync-enclave/sync-enclave-client')
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))
    const client = await getSyncEnclaveClient()
    await client.postPublic('/v1/share/open', { ciphertext: 'abc' })
    const headers = mockFetch.mock.calls[0][1]?.headers as Headers
    expect(headers.has('Authorization')).toBe(false)
    expect(headers.get('Accept')).toBe('application/json')
    expect(mockRefreshToken).not.toHaveBeenCalled()
  })

  it('does not refresh authentication for public 401 responses', async () => {
    const { getSyncEnclaveClient } =
      await import('@/services/sync-enclave/sync-enclave-client')
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ code: 'AUTH' }, { status: 401 }),
    )
    const client = await getSyncEnclaveClient()

    await expect(
      client.postPublic('/v1/share/open', { ciphertext: 'abc' }),
    ).rejects.toMatchObject({ status: 401 })
    expect(mockRefreshToken).not.toHaveBeenCalled()
    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('force-refreshes after one 401 and replays the identical request once', async () => {
    const { getSyncEnclaveClient } =
      await import('@/services/sync-enclave/sync-enclave-client')
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ code: 'AUTH' }, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
    const client = await getSyncEnclaveClient()
    const body = JSON.stringify({ ciphertext: 'same-body' })
    await client.request('/v1/blobs/push', {
      method: 'POST',
      body,
      headers: { 'Idempotency-Key': 'same-key' },
    })

    expect(mockRefreshToken).toHaveBeenCalledWith('test-jwt')
    expect(mockFetch).toHaveBeenCalledTimes(2)
    const firstInit = mockFetch.mock.calls[0][1]
    const secondInit = mockFetch.mock.calls[1][1]
    expect(secondInit?.body).toBe(firstInit?.body)
    expect((secondInit?.headers as Headers).get('Idempotency-Key')).toBe(
      'same-key',
    )
    expect((secondInit?.headers as Headers).get('Authorization')).toBe(
      'Bearer fresh-jwt',
    )
  })

  it('pauses sync instead of signing out after a replayed 401', async () => {
    const { getSyncEnclaveClient } =
      await import('@/services/sync-enclave/sync-enclave-client')
    mockFetch.mockResolvedValue(jsonResponse({ code: 'AUTH' }, { status: 401 }))
    const client = await getSyncEnclaveClient()

    await expect(client.get('/api/keys/current')).rejects.toMatchObject({
      name: 'SyncPersistentAuthError',
      code: 'AUTH_PERSISTENT',
      status: 401,
    })
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockReportSyncPaused).toHaveBeenCalledWith('auth')
  })

  it('does not pause sync when forced refresh fails before replay', async () => {
    const { getSyncEnclaveClient } =
      await import('@/services/sync-enclave/sync-enclave-client')
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ code: 'AUTH' }, { status: 401 }),
    )
    mockRefreshToken.mockRejectedValueOnce(new Error('refresh failed'))
    const client = await getSyncEnclaveClient()

    await expect(client.get('/api/keys/current')).rejects.toThrow(
      'refresh failed',
    )
    expect(mockFetch).toHaveBeenCalledOnce()
    expect(mockReportSyncPaused).not.toHaveBeenCalled()
  })

  it('parses non-2xx responses into SyncEnclaveError with code + details', async () => {
    const { getSyncEnclaveClient } =
      await import('@/services/sync-enclave/sync-enclave-client')
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        {
          error: 'STALE_BLOB',
          code: 'PRECONDITION_FAILED',
          current_etag: '7',
        },
        { status: 412 },
      ),
    )
    const client = await getSyncEnclaveClient()
    await expect(
      client.put('/api/profile/', { data: 'x' }),
    ).rejects.toMatchObject({
      name: 'SyncEnclaveError',
      status: 412,
      code: 'PRECONDITION_FAILED',
      details: { current_etag: '7' },
    })
  })

  it('reuses the verified client across calls', async () => {
    const { getSyncEnclaveClient } =
      await import('@/services/sync-enclave/sync-enclave-client')
    mockFetch.mockResolvedValue(jsonResponse({ ok: true }))
    const c1 = await getSyncEnclaveClient()
    const c2 = await getSyncEnclaveClient()
    expect(c1).toBe(c2)
    expect(mockReady).toHaveBeenCalledTimes(1)
  })

  it('drops the cache when verification fails so the next call can retry', async () => {
    const { getSyncEnclaveClient } =
      await import('@/services/sync-enclave/sync-enclave-client')
    mockReady.mockRejectedValueOnce(new Error('attestation failed'))
    await expect(getSyncEnclaveClient()).rejects.toThrow('attestation failed')
    mockReady.mockResolvedValueOnce(undefined)
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))
    const client = await getSyncEnclaveClient()
    expect(client).toBeDefined()
  })

  it('bounds hung attestation and allows a fresh client retry', async () => {
    vi.useFakeTimers()
    vi.resetModules()
    vi.doMock('@/config', () => ({
      SYNC_ENCLAVE_URL: 'https://sync.tinfoil.sh',
      SYNC_ENCLAVE_REPO: 'tinfoilsh/confidential-sync',
      SYNC_ENCLAVE_TIMEOUTS: { READY_MS: 25, REQUEST_MS: 25 },
    }))
    mockReady.mockReturnValueOnce(new Promise(() => {}))
    const { getSyncEnclaveClient } =
      await import('@/services/sync-enclave/sync-enclave-client')

    const timedOut = getSyncEnclaveClient()
    const assertion = expect(timedOut).rejects.toMatchObject({
      name: 'SyncAttestationTimeoutError',
      code: 'NETWORK',
    })
    await vi.advanceTimersByTimeAsync(25)
    await assertion

    mockReady.mockResolvedValueOnce(undefined)
    await expect(getSyncEnclaveClient()).resolves.toBeDefined()
    expect(mockSecureClientConstructor).toHaveBeenCalledTimes(2)
  })

  it('aborts a hung fetch when the overall request budget expires', async () => {
    vi.useFakeTimers()
    vi.resetModules()
    vi.doMock('@/config', () => ({
      SYNC_ENCLAVE_URL: 'https://sync.tinfoil.sh',
      SYNC_ENCLAVE_REPO: 'tinfoilsh/confidential-sync',
      SYNC_ENCLAVE_TIMEOUTS: { READY_MS: 25, REQUEST_MS: 25 },
    }))
    let requestSignal: AbortSignal | null | undefined
    mockFetch.mockImplementationOnce((_input, init) => {
      requestSignal = init?.signal
      return new Promise(() => {})
    })
    const { getSyncEnclaveClient } =
      await import('@/services/sync-enclave/sync-enclave-client')
    const client = await getSyncEnclaveClient()

    const request = client.get('/api/keys/current')
    const assertion = expect(request).rejects.toMatchObject({
      name: 'SyncRequestTimeoutError',
      code: 'NETWORK',
    })
    await vi.advanceTimersByTimeAsync(25)
    await assertion
    expect(requestSignal?.aborted).toBe(true)
    expect(requestSignal?.reason).toMatchObject({
      name: 'SyncRequestTimeoutError',
    })
  })

  it('uses one overall budget for authentication refresh and replay', async () => {
    vi.useFakeTimers()
    vi.resetModules()
    vi.doMock('@/config', () => ({
      SYNC_ENCLAVE_URL: 'https://sync.tinfoil.sh',
      SYNC_ENCLAVE_REPO: 'tinfoilsh/confidential-sync',
      SYNC_ENCLAVE_TIMEOUTS: { READY_MS: 25, REQUEST_MS: 25 },
    }))
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ code: 'AUTH' }, { status: 401 }),
    )
    mockRefreshToken.mockReturnValueOnce(new Promise(() => {}))
    const { getSyncEnclaveClient } =
      await import('@/services/sync-enclave/sync-enclave-client')
    const client = await getSyncEnclaveClient()

    const request = client.get('/api/keys/current')
    const assertion = expect(request).rejects.toMatchObject({
      name: 'SyncRequestTimeoutError',
    })
    await vi.advanceTimersByTimeAsync(25)
    await assertion
    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('cleans up request timers after a successful response', async () => {
    vi.useFakeTimers()
    const { getSyncEnclaveClient } =
      await import('@/services/sync-enclave/sync-enclave-client')
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))
    const client = await getSyncEnclaveClient()

    await client.get('/api/keys/current')

    expect(vi.getTimerCount()).toBe(0)
  })

  it('exposes SyncEnclaveError as a real Error subclass', () => {
    const err = new SyncEnclaveError('boom', 409, 'CONFLICT', { foo: 'bar' })
    expect(err).toBeInstanceOf(Error)
    expect(err.status).toBe(409)
    expect(err.code).toBe('CONFLICT')
    expect(err.details).toEqual({ foo: 'bar' })
  })
})
