import {
  PasskeyCredentialConflictError,
  storeEncryptedKeys,
  type KeyBundle,
  type PasskeyCredentialEntry,
} from '@/services/passkey/passkey-key-storage'
import { deriveKeyEncryptionKey } from '@/services/passkey/passkey-service'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetAuthHeaders = vi.fn()

vi.mock('@/services/auth', () => ({
  authTokenManager: {
    getAuthHeaders: (...args: unknown[]) => mockGetAuthHeaders(...args),
  },
}))

vi.mock('@/utils/error-handling', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}))

function generateTestPrfOutput(): ArrayBuffer {
  return crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer
}

function buildEntry(
  id: string,
  overrides: Partial<PasskeyCredentialEntry> = {},
): PasskeyCredentialEntry {
  return {
    id,
    encrypted_keys: 'ciphertext',
    iv: 'iv',
    created_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    sync_version: 1,
    bundle_version: 1,
    ...overrides,
  }
}

describe('passkey-key-storage storeEncryptedKeys', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let kek: CryptoKey

  const keyBundle: KeyBundle = {
    primary: 'key_primary1234567890abcdef',
    alternatives: ['key_alt1abcdef1234567890'],
    authorizationMode: 'validated',
  }

  beforeEach(async () => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    mockGetAuthHeaders.mockResolvedValue({ Authorization: 'Bearer test-token' })
    const prfOutput = generateTestPrfOutput()
    kek = await deriveKeyEncryptionKey(prfOutput)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('stores incremented sync and bundle versions after verifying the save', async () => {
    const initialEntries = [
      buildEntry('cred-1', { sync_version: 2, bundle_version: 4 }),
      buildEntry('cred-2', { sync_version: 1, bundle_version: 4 }),
    ]
    let savedEntries: PasskeyCredentialEntry[] | null = null

    fetchMock.mockImplementation(
      async (_url: string, options?: RequestInit): Promise<Response> => {
        const method = options?.method ?? 'GET'

        if (method === 'GET') {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => savedEntries ?? initialEntries,
          } as Response
        }

        savedEntries = JSON.parse(
          String(options?.body),
        ) as PasskeyCredentialEntry[]
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({}),
        } as Response
      },
    )

    const result = await storeEncryptedKeys('cred-1', kek, keyBundle, {
      expectedSyncVersion: 2,
      knownBundleVersion: 4,
      incrementBundleVersion: true,
      enforceRemoteBundleVersion: true,
    })

    expect(result).toEqual({ syncVersion: 3, bundleVersion: 5 })
    expect(savedEntries).not.toBeNull()
    expect(savedEntries?.find((entry) => entry.id === 'cred-1')).toMatchObject({
      sync_version: 3,
      bundle_version: 5,
    })
  })

  it('retries when the first post-save verification does not contain the new entry', async () => {
    const initialEntries = [
      buildEntry('cred-1', { sync_version: 1, bundle_version: 1 }),
    ]
    let savedEntries: PasskeyCredentialEntry[] | null = null
    let getCount = 0

    fetchMock.mockImplementation(
      async (_url: string, options?: RequestInit): Promise<Response> => {
        const method = options?.method ?? 'GET'

        if (method === 'GET') {
          getCount += 1
          const payload =
            getCount <= 3 ? initialEntries : (savedEntries ?? initialEntries)

          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => payload,
          } as Response
        }

        savedEntries = JSON.parse(
          String(options?.body),
        ) as PasskeyCredentialEntry[]
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({}),
        } as Response
      },
    )

    const result = await storeEncryptedKeys('cred-1', kek, keyBundle, {
      expectedSyncVersion: 1,
      knownBundleVersion: 1,
      incrementBundleVersion: true,
      enforceRemoteBundleVersion: true,
    })

    expect(result).toEqual({ syncVersion: 2, bundleVersion: 2 })
    expect(
      fetchMock.mock.calls.filter(([, options]) => options?.method === 'PUT'),
    ).toHaveLength(2)
  })

  it('rejects stale sync_version updates for the same credential', async () => {
    const initialEntries = [
      buildEntry('cred-1', { sync_version: 4, bundle_version: 2 }),
    ]

    fetchMock.mockImplementation(async (): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => initialEntries,
      } as Response
    })

    await expect(
      storeEncryptedKeys('cred-1', kek, keyBundle, {
        expectedSyncVersion: 3,
        knownBundleVersion: 2,
        incrementBundleVersion: true,
        enforceRemoteBundleVersion: true,
      }),
    ).rejects.toBeInstanceOf(PasskeyCredentialConflictError)
  })

  it('rejects updates when another credential already advertises a newer bundle version', async () => {
    const initialEntries = [
      buildEntry('cred-1', { sync_version: 2, bundle_version: 4 }),
      buildEntry('cred-2', { sync_version: 1, bundle_version: 5 }),
    ]

    fetchMock.mockImplementation(async (): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => initialEntries,
      } as Response
    })

    await expect(
      storeEncryptedKeys('cred-1', kek, keyBundle, {
        expectedSyncVersion: 2,
        knownBundleVersion: 4,
        incrementBundleVersion: true,
        enforceRemoteBundleVersion: true,
      }),
    ).rejects.toBeInstanceOf(PasskeyCredentialConflictError)
  })
})
