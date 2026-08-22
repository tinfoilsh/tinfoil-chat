/**
 * Passkey Key Storage — enclave-backed.
 *
 * The legacy implementation talked to `/api/passkey-credentials/` and
 * persisted a JSONB array of credentials directly. After Phase 2 the
 * enclave is the source of truth: passkey bundles live under
 * `user_key_bundles` rows scoped to a single `user_keys.key_id`. We
 * preserve this module's public exports verbatim so the
 * `usePasskeyBackup` hook and recovery flows keep importing the same
 * names, but the internals route through the enclave's
 * `key-current` / `register-key` / `add-bundle` / `remove-bundle`
 * wire.
 *
 * `KeyBundle.alternatives` is preserved end-to-end. The enclave treats
 * the bundle ciphertext as an opaque blob, so any legacy decryption
 * history the caller hands in survives unchanged. Alternatives are
 * dropped from the local model only after the client-side migration
 * loop has re-sealed every legacy row under the current primary CEK.
 *
 * The legacy decoder primitives (`encryptKeyBundle`,
 * `decryptKeyBundle`) are pure client-side AES-256-GCM. Optimistic
 * concurrency is enforced by the enclave: register-key uses
 * `if_match='*'` for first-time writes and returns
 * EXISTING_DATA_UNDER_OTHER_KEY when a key already exists;
 * add-bundle is idempotent per credential_id. The legacy
 * `sync_version` / `bundle_version` counters are synthesized from the
 * enclave's `bundle_version` so callers that read them keep working.
 */

import { base64ToUint8Array, uint8ArrayToBase64 } from '@/utils/binary-codec'
import { logError, logInfo } from '@/utils/error-handling'
import type { WrappedKey } from '@tinfoilsh/passkey-kit'
import { requirePrimaryKeyB64 } from '../cloud/cek-encoding'
import type { CloudKeyAuthorizationMode } from '../cloud/cloud-key-authorization'
import { encryptionService } from '../encryption/encryption-service'
import {
  bytesToBase64,
  addBundle as enclaveAddBundle,
  keyCurrent as enclaveKeyCurrent,
  registerKey as enclaveRegisterKey,
  removeBundle as enclaveRemoveBundle,
  hexToB64,
  newIdempotencyKey,
} from '../sync-enclave/sync-api'
import { SyncEnclaveError } from '../sync-enclave/sync-enclave-client'
import { deriveTinfoilKeyIdHex } from '../sync-enclave/tinfoil-key-id'
import { IF_MATCH_SENTINELS, WIRE_CODES } from '../sync-enclave/wire-contract'
import {
  enclaveBundleFromTinfoilWrappedKey,
  getCachedCredentialId,
  getCachedPrfOutputForLegacyBundle,
  passkeyKeyManager,
  recoverTinfoilKey,
  TINFOIL_PASSKEY_PROFILE,
  tinfoilWrappedKeyFromEnclaveBundle,
} from './kit'
import { fetchLegacyPasskeyCredentials } from './legacy-passkey-credentials'

const AES_GCM_IV_BYTES = 12

export interface KeyBundle {
  primary: string
  /**
   * Decryption-only history retained for legacy v0/v1 rows. New
   * bundles persist whatever the caller hands in (the enclave is a
   * blob store at the bundle layer). Removed in Layer C of the
   * sync-enclave refactor once the client-side migration loop has
   * re-sealed every legacy row under `primary`.
   */
  alternatives: string[]
  authorizationMode?: CloudKeyAuthorizationMode
}

export interface PasskeyCredentialEntry {
  id: string
  encrypted_keys: string
  iv: string
  created_at: string
  version: number
  sync_version: number
  bundle_version?: number
  /**
   * Set on entries that came from the legacy
   * `/api/passkey-credentials/` JSONB rather than the enclave's
   * `user_key_bundles` table. Used by the recovery flow to know
   * whether the unwrapped CEK needs to be promoted into a real
   * `user_keys` row after unlock. Not persisted; populated only on
   * the in-memory list returned by `loadPasskeyCredentials`.
   */
  source?: 'enclave' | 'legacy'
}

const CURRENT_CREDENTIAL_VERSION = 1

export type PasskeyCredentialState = 'exists' | 'empty' | 'unknown'

/**
 * Per-device classification of the user's passkey bundle state.
 *
 *  - `this-device`: a bundle for the credential id that this device
 *    last enrolled / authenticated against is registered server-side.
 *  - `other-device-only`: at least one bundle exists but none of them
 *    match this device's local credential id, so the user must
 *    enroll a passkey on this device to back up their key here.
 *  - `empty`: no bundles registered for the current key at all.
 *  - `unknown`: enclave was unreachable; caller should leave state alone.
 */
export type PasskeyDeviceState =
  'this-device' | 'other-device-only' | 'empty' | 'unknown'

export interface StoreEncryptedKeysOptions {
  expectedSyncVersion?: number | null
  knownBundleVersion?: number | null
  incrementBundleVersion?: boolean
  enforceRemoteBundleVersion?: boolean
}

export class PasskeyCredentialConflictError extends Error {
  readonly remoteSyncVersion: number | null
  readonly remoteBundleVersion: number

  constructor(
    message: string,
    details: {
      remoteSyncVersion?: number | null
      remoteBundleVersion?: number
    } = {},
  ) {
    super(message)
    this.name = 'PasskeyCredentialConflictError'
    this.remoteSyncVersion = details.remoteSyncVersion ?? null
    this.remoteBundleVersion = details.remoteBundleVersion ?? 0
  }
}

// --- Crypto primitives -----------------------------------------------------

export async function encryptKeyBundle(
  kek: CryptoKey,
  keys: KeyBundle,
): Promise<{ iv: string; data: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES))
  const plaintext = new TextEncoder().encode(JSON.stringify(keys))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    kek,
    plaintext,
  )
  return {
    iv: uint8ArrayToBase64(iv),
    data: uint8ArrayToBase64(new Uint8Array(ciphertext)),
  }
}

export async function decryptKeyBundle(
  kek: CryptoKey,
  encrypted: { iv: string; data: string },
): Promise<KeyBundle> {
  const iv = base64ToUint8Array(encrypted.iv)
  const ciphertext = base64ToUint8Array(encrypted.data)
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    kek,
    ciphertext as BufferSource,
  )
  const json = new TextDecoder().decode(plaintext)
  const parsed = JSON.parse(json) as Partial<KeyBundle>
  if (
    typeof parsed.primary !== 'string' ||
    !Array.isArray(parsed.alternatives) ||
    (parsed.authorizationMode !== undefined &&
      parsed.authorizationMode !== 'validated' &&
      parsed.authorizationMode !== 'explicit_start_fresh')
  ) {
    throw new Error('Invalid key bundle structure')
  }
  return {
    primary: parsed.primary,
    alternatives: parsed.alternatives,
    authorizationMode: parsed.authorizationMode,
  }
}

// --- Wire reshape ----------------------------------------------------------

function reshapeBundleToEntry(bundle: {
  credential_id: string
  kek_iv: string
  encrypted_keys: string
  bundle_version?: number
  created_at?: string
}): PasskeyCredentialEntry {
  const bundleVersion = bundle.bundle_version ?? 1
  // The enclave wire carries kek_iv / encrypted_keys as hex
  // (matching BundleBody), but PasskeyCredentialEntry is the legacy
  // base64-flavoured shape that decryptKeyBundle / use-passkey-backup
  // consume. Convert at this boundary so the entry contract stays
  // uniform with the values coming back from
  // fetchLegacyPasskeyCredentials.
  return {
    id: bundle.credential_id,
    iv: hexToB64(bundle.kek_iv),
    encrypted_keys: hexToB64(bundle.encrypted_keys),
    created_at: bundle.created_at ?? new Date(0).toISOString(),
    version: CURRENT_CREDENTIAL_VERSION,
    sync_version: bundleVersion,
    bundle_version: bundleVersion,
  }
}

// --- Public API ------------------------------------------------------------

export async function loadPasskeyCredentials(): Promise<
  PasskeyCredentialEntry[]
> {
  try {
    const resp = await enclaveKeyCurrent()
    if (resp.key_id) {
      const entries = Object.values(resp.bundles).map((bundle) => ({
        ...reshapeBundleToEntry(bundle),
        source: 'enclave' as const,
      }))
      if (entries.length > 0) return entries
      // A registered key with zero bundles is an orphan: the enclave's
      // migrate-all bootstrap stamps a current key before any passkey
      // bundle is written, so a key_id can exist with no way to unlock
      // it. Fall back to the legacy passkey so the user can still
      // recover instead of being forced into manual key entry.
      return await loadLegacyFallback()
    }
    return await loadLegacyFallback()
  } catch (err) {
    if (err instanceof SyncEnclaveError && err.status === 404) {
      return loadLegacyFallback()
    }
    throw err
  }
}

async function loadLegacyFallback(): Promise<PasskeyCredentialEntry[]> {
  const legacy = await fetchLegacyPasskeyCredentials()
  if (legacy.length === 0) return []
  logInfo('falling back to legacy passkey credentials for recovery', {
    component: 'PasskeyKeyStorage',
    action: 'loadLegacyFallback',
    metadata: { count: legacy.length },
  })
  return legacy.map((entry) => ({ ...entry, source: 'legacy' as const }))
}

/**
 * Candidate set for the recovery wizard. Unlike loadPasskeyCredentials
 * — which prefers enclave bundles and hides legacy credentials once any
 * bundle exists — this returns the UNION of the enclave bundles and the
 * user's legacy credentials (deduped by id, enclave winning conflicts).
 * That lets a device whose own pre-enclave passkey predates the v2 key
 * registry still be offered for recovery after another platform has
 * registered the key, so it can unlock the shared CEK and enroll itself.
 */
export async function loadRecoveryCandidates(): Promise<
  PasskeyCredentialEntry[]
> {
  let enclaveEntries: PasskeyCredentialEntry[] = []
  try {
    const resp = await enclaveKeyCurrent()
    if (resp.key_id) {
      enclaveEntries = Object.values(resp.bundles).map((bundle) => ({
        ...reshapeBundleToEntry(bundle),
        source: 'enclave' as const,
      }))
    }
  } catch (err) {
    if (!(err instanceof SyncEnclaveError) || err.status !== 404) throw err
  }
  const legacyEntries = await loadLegacyFallback()
  const byId = new Map<string, PasskeyCredentialEntry>()
  for (const entry of legacyEntries) byId.set(entry.id, entry)
  for (const entry of enclaveEntries) byId.set(entry.id, entry)
  return [...byId.values()]
}

/**
 * Legacy bulk-replace. The enclave wire doesn't expose a put-all
 * endpoint — bundles are added/removed individually — so this helper
 * is now a no-op kept only for source compatibility. Callers must
 * use `storeEncryptedKeys` and `deletePasskeyCredential`.
 */
export async function savePasskeyCredentials(
  _entries: PasskeyCredentialEntry[],
): Promise<boolean> {
  logInfo('savePasskeyCredentials is a no-op under the enclave wire', {
    component: 'PasskeyKeyStorage',
    action: 'savePasskeyCredentials',
  })
  return true
}

export async function deletePasskeyCredential(
  credentialId: string,
): Promise<boolean> {
  try {
    const resp = await enclaveKeyCurrent()
    if (!resp.key_id || !resp.bundles[credentialId]) {
      // No enclave bundle to remove. If the credential only exists in
      // the read-only legacy table the client cannot delete it, so
      // report failure instead of a false success that would leave the
      // passkey able to unlock the user's data.
      const legacy = await fetchLegacyPasskeyCredentials()
      return !legacy.some((entry) => entry.id === credentialId)
    }
    await enclaveRemoveBundle({
      keyId: resp.key_id,
      keyB64: requirePrimaryKeyB64(),
      credentialId,
      idempotencyKey: newIdempotencyKey(),
    })
    return true
  } catch (error) {
    logError('Failed to delete passkey credential', error, {
      component: 'PasskeyKeyStorage',
      action: 'deletePasskeyCredential',
    })
    return false
  }
}

export async function hasPasskeyCredentials(): Promise<boolean> {
  try {
    const entries = await loadPasskeyCredentials()
    return entries.length > 0
  } catch {
    return false
  }
}

export async function getPasskeyCredentialState(): Promise<PasskeyCredentialState> {
  try {
    const entries = await loadPasskeyCredentials()
    return entries.length > 0 ? 'exists' : 'empty'
  } catch {
    return 'unknown'
  }
}

/**
 * Classify the user's passkey bundle state from the perspective of
 * the current device. The data model already supports many bundles
 * per user (one per WebAuthn credential id), so the right question
 * is not "does any bundle exist?" but "does *this* device have its
 * own bundle?". A user with an Apple passkey on a Mac and Windows
 * Hello on a PC should see "active" on each device and a
 * "set up passkey on this device" prompt when signing in on a new
 * machine.
 */
export async function getPasskeyDeviceState(
  localCredentialId: string | null,
): Promise<PasskeyDeviceState> {
  try {
    const entries = await loadPasskeyCredentials()
    if (entries.length === 0) return 'empty'
    if (
      localCredentialId &&
      entries.some((entry) => entry.id === localCredentialId)
    ) {
      return 'this-device'
    }
    return 'other-device-only'
  } catch {
    return 'unknown'
  }
}

/**
 * Wrap the user's KeyBundle under a passkey-derived KEK and ship the
 * bundle to the enclave. Behavior mirrors the legacy contract the
 * hook expects:
 *
 *  - No remote key yet → register-key with initial_bundle.
 *  - Remote key exists under the SAME primary CEK → add-bundle for
 *    this credential.
 *  - Remote key exists under a DIFFERENT CEK → throw
 *    PasskeyCredentialConflictError so the hook routes the user to
 *    the recovery wizard instead of clobbering.
 *
 * The version-counter knobs in `StoreEncryptedKeysOptions` are
 * accepted for source compat; the enclave owns concurrency so there
 * is no client-side rev loop. The returned counters mirror what the
 * enclave reports for the freshly written bundle.
 */
export async function storeEncryptedKeys(
  wrappedKey: WrappedKey,
  keys: KeyBundle,
  options: StoreEncryptedKeysOptions = {},
): Promise<{ syncVersion: number; bundleVersion: number } | null> {
  try {
    const credentialId = wrappedKey.credentialId
    const enclaveBundle = enclaveBundleFromTinfoilWrappedKey(wrappedKey)
    const current = await enclaveKeyCurrent()
    const primaryBytes = encryptionService.getAlternativeKeyBytes(keys.primary)
    if (!primaryBytes) {
      throw new Error('passkey-key-storage: primary key is not decodable')
    }
    const localKeyId = await deriveTinfoilKeyIdHex(primaryBytes)

    if (!current.key_id) {
      try {
        await enclaveRegisterKey({
          keyB64: bytesToBase64(primaryBytes),
          ifMatch: IF_MATCH_SENTINELS.AnyKey,
          // When the controlplane reports un-migrated legacy data
          // (key_id IS NULL rows) but no current key, this CEK is the
          // existing v1 key being adopted into v2, not a brand-new one.
          // Register it as 'recovery' so the cross-key guard allows it
          // (a fresh 'passkey' key is refused over legacy data) and the
          // legacy rows can then re-seal under it. The bundle is still
          // attached, so the key is never stranded without a passkey.
          createdVia:
            keys.authorizationMode === 'explicit_start_fresh'
              ? 'start_fresh'
              : current.has_data
                ? 'recovery'
                : 'passkey',
          idempotencyKey: newIdempotencyKey(),
          initialBundle: {
            credentialId,
            kekIvHex: enclaveBundle.kekIvHex,
            encryptedKeysHex: enclaveBundle.encryptedKeysHex,
          },
        })
      } catch (err) {
        if (
          err instanceof SyncEnclaveError &&
          err.code === WIRE_CODES.ExistingDataUnderOtherKey
        ) {
          throw new PasskeyCredentialConflictError(
            'Remote key already exists under a different CEK; recover first.',
            { remoteSyncVersion: null, remoteBundleVersion: 0 },
          )
        }
        throw err
      }
      const created = await enclaveKeyCurrent()
      const bundleVersion = created.bundles[credentialId]?.bundle_version ?? 1
      logInfo('Registered initial key + bundle with enclave', {
        component: 'PasskeyKeyStorage',
        action: 'storeEncryptedKeys',
        metadata: { credentialId, bundleVersion },
      })
      return { syncVersion: bundleVersion, bundleVersion }
    }

    if (current.key_id !== localKeyId) {
      if (keys.authorizationMode === 'explicit_start_fresh') {
        // The user has chosen to wipe everything and bind a brand-new
        // CEK. Route through register-key with created_via=start_fresh
        // so the controlplane atomically drops every blob row, returns
        // the v2 attachment ids it removed, and lets the enclave drain
        // those from buckets — all without the cross-key conflict
        // guard firing.
        await enclaveRegisterKey({
          keyB64: bytesToBase64(primaryBytes),
          ifMatch: current.etag || IF_MATCH_SENTINELS.AnyKey,
          createdVia: 'start_fresh',
          idempotencyKey: newIdempotencyKey(),
          initialBundle: {
            credentialId,
            kekIvHex: enclaveBundle.kekIvHex,
            encryptedKeysHex: enclaveBundle.encryptedKeysHex,
          },
        })
        const created = await enclaveKeyCurrent()
        const bundleVersion = created.bundles[credentialId]?.bundle_version ?? 1
        logInfo('start_fresh wipe + key register completed', {
          component: 'PasskeyKeyStorage',
          action: 'storeEncryptedKeys',
          metadata: { credentialId, bundleVersion },
        })
        return { syncVersion: bundleVersion, bundleVersion }
      }
      throw new PasskeyCredentialConflictError(
        "The remote key does not match this device's CEK. Recover the existing key first.",
        {
          remoteSyncVersion: null,
          remoteBundleVersion:
            current.bundles[credentialId]?.bundle_version ?? 0,
        },
      )
    }

    await enclaveAddBundle({
      keyId: current.key_id,
      keyB64: bytesToBase64(primaryBytes),
      credentialId,
      kekIvHex: enclaveBundle.kekIvHex,
      encryptedKeysHex: enclaveBundle.encryptedKeysHex,
      idempotencyKey: newIdempotencyKey(),
    })

    const refreshed = await enclaveKeyCurrent()
    const bundleVersion =
      refreshed.bundles[credentialId]?.bundle_version ??
      (options.knownBundleVersion ?? 0) + 1
    logInfo('Added passkey bundle for current enclave key', {
      component: 'PasskeyKeyStorage',
      action: 'storeEncryptedKeys',
      metadata: { credentialId, bundleVersion },
    })
    return { syncVersion: bundleVersion, bundleVersion }
  } catch (error) {
    if (error instanceof PasskeyCredentialConflictError) {
      throw error
    }
    logError('Failed to store encrypted keys', error, {
      component: 'PasskeyKeyStorage',
      action: 'storeEncryptedKeys',
    })
    return null
  }
}

export interface RecoveredPasskeyKeyBundle {
  keyBundle: KeyBundle
  credentialId: string
  syncVersion: number | null
  bundleVersion: number
  source?: 'enclave' | 'legacy'
}

const PLACEHOLDER_WRAPPED_KEY_HEX = '00'.repeat(48)

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  )
}

function entryToWrappedKey(entry: PasskeyCredentialEntry): WrappedKey {
  const ciphertext = base64ToUint8Array(entry.encrypted_keys)
  // Legacy web records encrypt a variable-length JSON envelope. A valid-size
  // placeholder lets the manager run the credential ceremony and cache its
  // PRF result; recoverLegacyEntry then applies the retained app-owned decoder.
  return tinfoilWrappedKeyFromEnclaveBundle({
    credentialId: entry.id,
    kekIvHex: bytesToHex(base64ToUint8Array(entry.iv)),
    wrappedKeyHex:
      ciphertext.length === 48
        ? bytesToHex(ciphertext)
        : PLACEHOLDER_WRAPPED_KEY_HEX,
  })
}

async function deriveLegacyKek(prfOutput: Uint8Array): Promise<CryptoKey> {
  const input = await crypto.subtle.importKey(
    'raw',
    prfOutput as BufferSource,
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

async function recoverLegacyEntry(
  entry: PasskeyCredentialEntry,
): Promise<KeyBundle | null> {
  const prfOutput = getCachedPrfOutputForLegacyBundle()
  if (!prfOutput) return null
  try {
    return await decryptKeyBundle(await deriveLegacyKek(prfOutput), {
      iv: entry.iv,
      data: entry.encrypted_keys,
    })
  } catch {
    return null
  }
}

async function acceptLegacyBundleForCurrentKey(
  entry: PasskeyCredentialEntry,
  bundle: KeyBundle,
): Promise<boolean> {
  if (entry.source !== 'legacy') return true
  let currentKeyId: string | null = null
  try {
    currentKeyId = (await enclaveKeyCurrent()).key_id
  } catch (error) {
    if (!(error instanceof SyncEnclaveError) || error.status !== 404)
      return false
  }
  if (!currentKeyId) return true
  const primaryBytes = encryptionService.getAlternativeKeyBytes(bundle.primary)
  if (!primaryBytes) return false
  const legacyKeyId = await deriveTinfoilKeyIdHex(primaryBytes)
  if (legacyKeyId === currentKeyId) return true
  logInfo('skipping legacy passkey bundle for a rotated-away key', {
    component: 'PasskeyKeyStorage',
    action: 'recoverPasskeyKeyBundle',
    metadata: { credentialId: entry.id, legacyKeyId, currentKeyId },
  })
  return false
}

export async function recoverPasskeyKeyBundle(
  entries: PasskeyCredentialEntry[],
  options: { cachedOnly?: boolean } = {},
): Promise<RecoveredPasskeyKeyBundle | null> {
  if (entries.length === 0) return null
  const wrappedKeys = entries.map(entryToWrappedKey)
  let credentialId: string | null = null
  let rawKey: Uint8Array | null = null

  if (options.cachedOnly) {
    const recovered = await passkeyKeyManager.recoverKeyFromCache({
      wrappedKeys,
    })
    credentialId = recovered?.credentialId ?? getCachedCredentialId()
    rawKey = recovered?.key ?? null
  } else {
    try {
      const recovered = await recoverTinfoilKey(wrappedKeys)
      if (!recovered) return null
      credentialId = recovered.credentialId
      rawKey = recovered.key
    } catch (error) {
      credentialId = getCachedCredentialId()
      if (
        !credentialId ||
        !entries.some((entry) => entry.id === credentialId)
      ) {
        throw error
      }
    }
  }

  if (!credentialId) return null
  const entry = entries.find((candidate) => candidate.id === credentialId)
  if (!entry) return null
  const keyBundle = rawKey
    ? {
        primary: encryptionService.encodeKeyFromBytes(rawKey),
        alternatives: [],
      }
    : await recoverLegacyEntry(entry)
  if (
    !keyBundle ||
    !(await acceptLegacyBundleForCurrentKey(entry, keyBundle))
  ) {
    return null
  }
  return {
    keyBundle,
    credentialId,
    syncVersion: entry.sync_version ?? null,
    bundleVersion: entry.bundle_version ?? 0,
    source: entry.source,
  }
}

export async function addWrappedKeyForCurrentKey(input: {
  wrappedKey: WrappedKey
  cek: Uint8Array
  keyIdHex: string
}): Promise<void> {
  const enclaveBundle = enclaveBundleFromTinfoilWrappedKey(input.wrappedKey)
  await enclaveAddBundle({
    keyId: input.keyIdHex,
    keyB64: bytesToBase64(input.cek),
    credentialId: enclaveBundle.credentialId,
    kekIvHex: enclaveBundle.kekIvHex,
    encryptedKeysHex: enclaveBundle.encryptedKeysHex,
    idempotencyKey: newIdempotencyKey(),
  })
}

export async function promoteRecoveredCekToEnclave(input: {
  cek: Uint8Array
  credentialId: string
}): Promise<boolean> {
  const wrappedKey = await passkeyKeyManager.rewrapKeyFromCache({
    key: input.cek,
  })
  if (!wrappedKey || wrappedKey.credentialId !== input.credentialId)
    return false
  const keyIdHex = await deriveTinfoilKeyIdHex(input.cek)
  let current: Awaited<ReturnType<typeof enclaveKeyCurrent>> | null = null
  try {
    current = await enclaveKeyCurrent()
  } catch (error) {
    if (!(error instanceof SyncEnclaveError) || error.status !== 404)
      return false
  }
  if (current?.key_id) {
    if (current.key_id !== keyIdHex) return false
    if (current.bundles[input.credentialId]) return true
    await addWrappedKeyForCurrentKey({
      wrappedKey,
      cek: input.cek,
      keyIdHex,
    })
    return true
  }
  try {
    const enclaveBundle = enclaveBundleFromTinfoilWrappedKey(wrappedKey)
    await enclaveRegisterKey({
      keyB64: bytesToBase64(input.cek),
      ifMatch: IF_MATCH_SENTINELS.AnyKey,
      createdVia: 'recovery',
      idempotencyKey: newIdempotencyKey(),
      initialBundle: {
        credentialId: enclaveBundle.credentialId,
        kekIvHex: enclaveBundle.kekIvHex,
        encryptedKeysHex: enclaveBundle.encryptedKeysHex,
      },
    })
    return true
  } catch (error) {
    if (
      error instanceof SyncEnclaveError &&
      error.code === WIRE_CODES.ExistingDataUnderOtherKey
    ) {
      return false
    }
    throw error
  }
}
