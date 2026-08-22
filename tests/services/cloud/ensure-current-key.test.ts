import {
  AUTH_ACTIVE_USER_ID,
  SECRET_CLOUD_KEY_AUTHORIZATION_PREFIX,
  USER_ENCRYPTION_KEY,
  USER_ENCRYPTION_KEY_HISTORY,
} from '@/constants/storage-keys'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockRegisterKey = vi.fn()
const mockEmit = vi.fn()
const mockLoadPasskeyCredentials = vi.fn()
const mockRewrapKeyFromCache = vi.fn()
const mockWrapTinfoilKeyBundle = vi.fn()
const mockBundleToEnclave = vi.fn()
const mockGetAlternativeKeyBytes = vi.fn()

const TEST_KEY_B64 = vi.hoisted(() => {
  let bin = ''
  for (let i = 0; i < 32; i++) bin += String.fromCharCode(i + 1)
  return btoa(bin)
})

vi.mock('@/utils/error-handling', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarning: vi.fn(),
}))

const mockRequirePrimaryKeyB64 = vi.fn<() => string>()

vi.mock('@/services/cloud/cek-encoding', () => ({
  requirePrimaryKeyB64: () => mockRequirePrimaryKeyB64(),
  requirePrimaryKeyBytes: () => new Uint8Array(32),
}))

vi.mock('@/services/sync-enclave/sync-api', async () => {
  const real = await vi.importActual<
    typeof import('@/services/sync-enclave/sync-api')
  >('@/services/sync-enclave/sync-api')
  return {
    ...real,
    registerKey: (...args: unknown[]) => mockRegisterKey(...args),
    newIdempotencyKey: () => 'idem-test',
  }
})

vi.mock('@/services/passkey/kit', () => ({
  passkeyKeyManager: {
    rewrapKeyFromCache: (...args: unknown[]) => mockRewrapKeyFromCache(...args),
  },
}))

vi.mock('@/services/passkey/passkey-key-storage', () => ({
  loadPasskeyCredentials: (...args: unknown[]) =>
    mockLoadPasskeyCredentials(...args),
  wrapTinfoilKeyBundle: (...args: unknown[]) =>
    mockWrapTinfoilKeyBundle(...args),
  tinfoilWrappedKeyBundleToEnclave: (...args: unknown[]) =>
    mockBundleToEnclave(...args),
}))

vi.mock('@/services/encryption/encryption-service', () => ({
  encryptionService: {
    getAlternativeKeyBytes: (...args: unknown[]) =>
      mockGetAlternativeKeyBytes(...args),
  },
}))

vi.mock('@/services/sync-enclave/passkey-events', () => ({
  passkeyEvents: { emit: (...args: unknown[]) => mockEmit(...args) },
}))

import { adoptLocalKeyForMigration } from '@/services/cloud/ensure-current-key'

describe('ensure-current-key adoptLocalKeyForMigration', () => {
  beforeEach(() => {
    mockRegisterKey.mockReset()
    mockEmit.mockReset()
    mockRequirePrimaryKeyB64.mockReset()
    mockRequirePrimaryKeyB64.mockReturnValue(TEST_KEY_B64)
    mockLoadPasskeyCredentials.mockReset().mockResolvedValue([])
    mockRewrapKeyFromCache.mockReset().mockResolvedValue(null)
    mockWrapTinfoilKeyBundle.mockReset()
    mockBundleToEnclave.mockReset()
    mockGetAlternativeKeyBytes
      .mockReset()
      .mockReturnValue(
        Uint8Array.from(atob(TEST_KEY_B64), (character) =>
          character.charCodeAt(0),
        ),
      )
    localStorage.clear()
    localStorage.setItem(USER_ENCRYPTION_KEY, 'key_persisted')
    localStorage.setItem(USER_ENCRYPTION_KEY_HISTORY, JSON.stringify([]))
    localStorage.setItem(AUTH_ACTIVE_USER_ID, 'user-1')
    localStorage.setItem(
      `${SECRET_CLOUD_KEY_AUTHORIZATION_PREFIX}user-1`,
      JSON.stringify({ mode: 'validated' }),
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('registers the local CEK bundleless with created_via=recovery and if_match=*', async () => {
    mockRegisterKey.mockResolvedValue({ ok: true, key_id: 'kid' })

    const ok = await adoptLocalKeyForMigration()

    expect(ok).toBe(true)
    expect(mockRegisterKey).toHaveBeenCalledTimes(1)
    const arg = mockRegisterKey.mock.calls[0][0]
    expect(arg.createdVia).toBe('recovery')
    expect(arg.ifMatch).toBe('*')
    expect(arg.keyB64).toBe(TEST_KEY_B64)
    expect(arg.initialBundle).toBeUndefined()
  })

  it('returns false when registration is rejected', async () => {
    mockRegisterKey.mockRejectedValue(new Error('conflict'))
    expect(await adoptLocalKeyForMigration()).toBe(false)
  })

  it('defers without registering when no committed key exists', async () => {
    localStorage.removeItem(USER_ENCRYPTION_KEY)
    expect(await adoptLocalKeyForMigration()).toBe(false)
    expect(mockRegisterKey).not.toHaveBeenCalled()
  })

  it('defers without registering when a staged key differs from the committed key', async () => {
    // Mid-ceremony: the active in-memory CEK is a newly staged key that
    // has not been committed yet. Registering the committed key while
    // the upload would encrypt under the staged one must be refused.
    mockRequirePrimaryKeyB64.mockReturnValue('c3RhZ2VkLWtleS1ub3QtY29tbWl0dGVk')
    expect(await adoptLocalKeyForMigration()).toBe(false)
    expect(mockRegisterKey).not.toHaveBeenCalled()
  })

  it('uses persisted history and authorization before service initialization', async () => {
    localStorage.setItem(
      USER_ENCRYPTION_KEY_HISTORY,
      JSON.stringify(['key_previous_a', 'key_previous_b']),
    )
    localStorage.setItem(
      `${SECRET_CLOUD_KEY_AUTHORIZATION_PREFIX}user-1`,
      JSON.stringify({ mode: 'explicit_start_fresh' }),
    )
    const primaryWrapped = { credentialId: 'AQID' }
    const wrappedBundle = { primary: primaryWrapped, alternatives: [] }
    const transport = {
      credentialId: 'AQID',
      kekIvHex: '01'.repeat(12),
      encryptedKeysHex: '02',
    }
    mockLoadPasskeyCredentials.mockResolvedValue([{ id: 'AQID' }])
    mockRewrapKeyFromCache.mockResolvedValue(primaryWrapped)
    mockWrapTinfoilKeyBundle.mockResolvedValue(wrappedBundle)
    mockBundleToEnclave.mockReturnValue(transport)
    mockRegisterKey.mockResolvedValue({ ok: true, key_id: 'kid' })

    await expect(adoptLocalKeyForMigration()).resolves.toBe(true)

    expect(mockWrapTinfoilKeyBundle).toHaveBeenCalledWith(primaryWrapped, {
      primary: 'key_persisted',
      alternatives: ['key_previous_a', 'key_previous_b'],
      authorizationMode: 'explicit_start_fresh',
    })
    expect(mockRegisterKey.mock.calls[0][0].initialBundle).toEqual(transport)
  })

  it.each([
    ['primary', () => localStorage.setItem(USER_ENCRYPTION_KEY, 'key_changed')],
    [
      'history',
      () =>
        localStorage.setItem(
          USER_ENCRYPTION_KEY_HISTORY,
          JSON.stringify(['key_changed_history']),
        ),
    ],
    [
      'authorization',
      () =>
        localStorage.setItem(
          `${SECRET_CLOUD_KEY_AUTHORIZATION_PREFIX}user-1`,
          JSON.stringify({ mode: 'explicit_start_fresh' }),
        ),
    ],
  ])(
    'aborts when persisted %s changes during bundle lookup',
    async (_, mutate) => {
      let resolveCredentials: (entries: unknown[]) => void = () => {}
      mockLoadPasskeyCredentials.mockReturnValue(
        new Promise((resolve) => {
          resolveCredentials = resolve
        }),
      )

      const adoption = adoptLocalKeyForMigration()
      mutate()
      resolveCredentials([])

      await expect(adoption).resolves.toBe(false)
      expect(mockRegisterKey).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['primary', () => localStorage.setItem(USER_ENCRYPTION_KEY, 'key_changed')],
    [
      'history',
      () =>
        localStorage.setItem(
          USER_ENCRYPTION_KEY_HISTORY,
          JSON.stringify(['key_changed_history']),
        ),
    ],
    [
      'authorization',
      () =>
        localStorage.setItem(
          `${SECRET_CLOUD_KEY_AUTHORIZATION_PREFIX}user-1`,
          JSON.stringify({ mode: 'explicit_start_fresh' }),
        ),
    ],
    ['account', () => localStorage.setItem(AUTH_ACTIVE_USER_ID, 'user-2')],
  ])(
    'does not release writes when persisted %s changes during registration',
    async (_, mutate) => {
      let resolveRegistration: (value: {
        ok: boolean
        key_id: string
      }) => void = () => {}
      mockRegisterKey.mockReturnValue(
        new Promise((resolve) => {
          resolveRegistration = resolve
        }),
      )

      const adoption = adoptLocalKeyForMigration()
      await vi.waitFor(() => expect(mockRegisterKey).toHaveBeenCalledOnce())
      mutate()
      resolveRegistration({ ok: true, key_id: 'kid' })

      await expect(adoption).resolves.toBe(false)
      expect(mockRegisterKey).toHaveBeenCalledOnce()
      expect(mockEmit).not.toHaveBeenCalled()
    },
  )

  it.each([
    [
      'history',
      () =>
        localStorage.setItem(
          USER_ENCRYPTION_KEY_HISTORY,
          JSON.stringify(['key_new_history']),
        ),
    ],
    [
      'authorization',
      () =>
        localStorage.setItem(
          `${SECRET_CLOUD_KEY_AUTHORIZATION_PREFIX}user-1`,
          JSON.stringify({ mode: 'explicit_start_fresh' }),
        ),
    ],
    ['account', () => localStorage.setItem(AUTH_ACTIVE_USER_ID, 'user-2')],
  ])('queues a new adoption when snapshot %s changes', async (_, mutate) => {
    let resolveFirstRegistration: (value: {
      ok: boolean
      key_id: string
    }) => void = () => {}
    mockRegisterKey
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirstRegistration = resolve
        }),
      )
      .mockResolvedValueOnce({ ok: true, key_id: 'kid' })

    const staleAdoption = adoptLocalKeyForMigration()
    await vi.waitFor(() => expect(mockRegisterKey).toHaveBeenCalledOnce())
    mutate()
    const currentAdoption = adoptLocalKeyForMigration()

    expect(mockRegisterKey).toHaveBeenCalledOnce()
    resolveFirstRegistration({ ok: true, key_id: 'kid' })
    await expect(staleAdoption).resolves.toBe(false)
    await expect(currentAdoption).resolves.toBe(true)
    expect(mockRegisterKey).toHaveBeenCalledTimes(2)
    expect(mockEmit).toHaveBeenCalledOnce()
  })

  it('deduplicates concurrent adoptions for the exact snapshot', async () => {
    mockRegisterKey.mockResolvedValue({ ok: true, key_id: 'kid' })

    const [ra, rb] = await Promise.all([
      adoptLocalKeyForMigration(),
      adoptLocalKeyForMigration(),
    ])

    expect(ra).toBe(true)
    expect(rb).toBe(true)
    expect(mockRegisterKey).toHaveBeenCalledTimes(1)
  })
})
