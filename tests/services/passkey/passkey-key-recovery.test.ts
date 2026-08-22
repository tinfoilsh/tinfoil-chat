import { SECRET_PASSKEY_PRF_OUTPUT } from '@/constants/storage-keys'
import { TINFOIL_PASSKEY_PROFILE } from '@/services/passkey/kit'
import {
  encryptKeyBundle,
  recoverPasskeyKeyBundle,
  type PasskeyCredentialEntry,
} from '@/services/passkey/passkey-key-storage'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockKeyCurrent = vi.fn()

vi.mock('@/services/sync-enclave/sync-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/sync-enclave/sync-api')
  >('@/services/sync-enclave/sync-api')
  return {
    ...actual,
    keyCurrent: (...args: unknown[]) => mockKeyCurrent(...args),
  }
})

const CREDENTIAL_ID = 'AQID'
const PRF_OUTPUT = new Uint8Array(32).map((_, index) => index)

function cachePrf(): void {
  localStorage.setItem(
    SECRET_PASSKEY_PRF_OUTPUT,
    JSON.stringify({
      credentialId: CREDENTIAL_ID,
      prfOutput: btoa(String.fromCharCode(...PRF_OUTPUT)),
    }),
  )
}

async function legacyKek(): Promise<CryptoKey> {
  const input = await crypto.subtle.importKey(
    'raw',
    PRF_OUTPUT,
    'HKDF',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(),
      info: TINFOIL_PASSKEY_PROFILE.hkdfInfo as BufferSource,
    },
    input,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function entry(
  values: Partial<PasskeyCredentialEntry>,
): PasskeyCredentialEntry {
  return {
    id: CREDENTIAL_ID,
    encrypted_keys: '',
    iv: '',
    created_at: '2024-01-01T00:00:00.000Z',
    version: 1,
    sync_version: 1,
    ...values,
  }
}

describe('recoverPasskeyKeyBundle', () => {
  beforeEach(() => {
    localStorage.clear()
    cachePrf()
    mockKeyCurrent.mockReset().mockResolvedValue({ key_id: null, bundles: {} })
  })

  it('adapts and unlocks existing raw bundle bytes through the manager', async () => {
    const recovered = await recoverPasskeyKeyBundle(
      [
        entry({
          iv: btoa(
            String.fromCharCode(
              ...new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
            ),
          ),
          encrypted_keys: btoa(
            String.fromCharCode(
              ...new Uint8Array(
                '53c8f700925c9f94a7cf679d8a892c82f7c443769103a322e477a38d9118f0a014a659136ee1b9f6ed4921877f17aca7'
                  .match(/../g)!
                  .map((byte) => parseInt(byte, 16)),
              ),
            ),
          ),
          source: 'enclave',
        }),
      ],
      { cachedOnly: true },
    )

    expect(recovered?.credentialId).toBe(CREDENTIAL_ID)
    expect(recovered?.keyBundle.alternatives).toEqual([])
  })

  it('retains the legacy primary and alternatives decoder among candidates', async () => {
    const original = {
      primary: 'key_legacy_primary',
      alternatives: ['key_legacy_alternative'],
    }
    const encrypted = await encryptKeyBundle(await legacyKek(), original)
    const recovered = await recoverPasskeyKeyBundle(
      [
        entry({
          id: 'BAUG',
          iv: btoa(String.fromCharCode(...new Uint8Array(12))),
          encrypted_keys: btoa(String.fromCharCode(...new Uint8Array(48))),
          source: 'enclave',
        }),
        entry({
          iv: encrypted.iv,
          encrypted_keys: encrypted.data,
          source: 'legacy',
        }),
      ],
      { cachedOnly: true },
    )

    expect(recovered?.keyBundle).toEqual(original)
    expect(recovered?.source).toBe('legacy')
  })
})
