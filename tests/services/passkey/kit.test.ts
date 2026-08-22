import { SECRET_PASSKEY_PRF_OUTPUT } from '@/constants/storage-keys'
import {
  createAndWrapTinfoilKey,
  passkeyKeyManager,
  PasskeyTimeoutError,
  PrfNotSupportedError,
  TINFOIL_PASSKEY_PROFILE,
  tinfoilPasskeyStorage,
  tinfoilWrappedKeyFromEnclaveBundle,
} from '@/services/passkey/kit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const CREDENTIAL_ID = 'AQID'
const PRF_OUTPUT = new Uint8Array(32).map((_, index) => index)
const EXPECTED_KEY = new Uint8Array(32).map((_, index) => 0xff - index)
const EXISTING_KEK_IV_HEX = '0102030405060708090a0b0c'
const EXISTING_WRAPPED_KEY_HEX =
  '53c8f700925c9f94a7cf679d8a892c82f7c443769103a322e477a38d9118f0a014a659136ee1b9f6ed4921877f17aca7'

function installCredentials(create: () => Promise<unknown>): void {
  Object.defineProperty(navigator, 'credentials', {
    value: { create: vi.fn(create), get: vi.fn() },
    configurable: true,
  })
}

describe('Tinfoil passkey manager configuration', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('owns the byte-identical Tinfoil v1 profile', () => {
    expect(TINFOIL_PASSKEY_PROFILE).toMatchObject({
      version: 1,
      relyingPartyId:
        window.location.hostname === 'localhost' ? 'localhost' : 'tinfoil.sh',
      relyingPartyName: 'Tinfoil Chat',
    })
    expect(new TextDecoder().decode(TINFOIL_PASSKEY_PROFILE.prfSalt)).toBe(
      'tinfoil-chat-key-encryption',
    )
    expect(new TextDecoder().decode(TINFOIL_PASSKEY_PROFILE.hkdfInfo)).toBe(
      'tinfoil-chat-kek-v1',
    )
  })

  it('reconstructs the profile for the existing cache and unlocks existing bytes', async () => {
    localStorage.setItem(
      SECRET_PASSKEY_PRF_OUTPUT,
      JSON.stringify({
        credentialId: CREDENTIAL_ID,
        prfOutput: btoa(String.fromCharCode(...PRF_OUTPUT)),
      }),
    )
    const existing = tinfoilWrappedKeyFromEnclaveBundle({
      credentialId: CREDENTIAL_ID,
      kekIvHex: EXISTING_KEK_IV_HEX,
      wrappedKeyHex: EXISTING_WRAPPED_KEY_HEX,
    })

    const recovered = await passkeyKeyManager.recoverKeyFromCache({
      wrappedKeys: [existing],
    })

    expect(recovered?.key).toEqual(EXPECTED_KEY)
    expect(tinfoilPasskeyStorage.loadCachedPRFResult()?.profile).toEqual(
      TINFOIL_PASSKEY_PROFILE,
    )
  })

  it('preserves existing cache and local credential storage keys', () => {
    tinfoilPasskeyStorage.saveCachedPRFResult({
      profile: TINFOIL_PASSKEY_PROFILE,
      credentialId: CREDENTIAL_ID,
      prfOutput: PRF_OUTPUT,
    })
    tinfoilPasskeyStorage.saveLocalCredentialId(CREDENTIAL_ID)

    expect(
      JSON.parse(localStorage.getItem(SECRET_PASSKEY_PRF_OUTPUT)!),
    ).toEqual({
      credentialId: CREDENTIAL_ID,
      prfOutput: btoa(String.fromCharCode(...PRF_OUTPUT)),
    })
    expect(tinfoilPasskeyStorage.loadLocalCredentialId()).toBe(CREDENTIAL_ID)
  })

  it('maps cancellation without inspecting messages', async () => {
    installCredentials(async () => {
      throw new DOMException('localized text', 'NotAllowedError')
    })

    await expect(
      createAndWrapTinfoilKey({
        user: { id: new Uint8Array([1]), name: 'person@example.com' },
        key: EXPECTED_KEY,
      }),
    ).resolves.toBeNull()
  })

  it('maps unsupported and timeout categories to existing UI errors', async () => {
    installCredentials(async () => ({
      rawId: new Uint8Array([1, 2, 3]).buffer,
      authenticatorAttachment: 'platform',
      getClientExtensionResults: () => ({}),
    }))
    await expect(
      createAndWrapTinfoilKey({
        user: { id: new Uint8Array([1]), name: 'person@example.com' },
        key: EXPECTED_KEY,
      }),
    ).rejects.toBeInstanceOf(PrfNotSupportedError)

    vi.useFakeTimers()
    installCredentials(() => new Promise(() => {}))
    const pending = createAndWrapTinfoilKey({
      user: { id: new Uint8Array([1]), name: 'person@example.com' },
      key: EXPECTED_KEY,
    })
    pending.catch(() => {})
    await vi.advanceTimersByTimeAsync(60_000)
    await expect(pending).rejects.toBeInstanceOf(PasskeyTimeoutError)
  })
})
