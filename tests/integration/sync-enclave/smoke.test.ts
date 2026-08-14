/**
 * Live sync-enclave smoke test.
 *
 * Gated on `SYNC_ENCLAVE_URL` + `SYNC_ENCLAVE_TEST_JWT`. The test
 * builds a fresh per-run CEK and exercises replay protection, CAS,
 * tombstones, key isolation, attachment capabilities, share tamper
 * detection, and migration. Every call is attested by the same
 * SecureClient the production app uses. The primary JWT must belong
 * to a disposable CI-only account because setup intentionally invokes
 * start-fresh when a previous run left a key behind.
 *
 * Skipped automatically in local dev — `npm run test:unit` excludes
 * `tests/integration/**` so contributors without staging credentials
 * never accidentally hit the network.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// The sync-enclave client captures its URL at module-load time from
// `@/config`'s `SYNC_ENCLAVE_URL`. `vi.hoisted` runs the env wiring
// BEFORE the static imports below resolve, so the client picks up
// the integration URL on first import. Without this, the static
// imports would resolve against the default URL and `resetSyncEnclaveClient`
// alone would not re-read config.
const { TEST_JWT, enabled } = vi.hoisted(() => {
  const url = process.env.SYNC_ENCLAVE_URL
  const jwt = process.env.SYNC_ENCLAVE_TEST_JWT
  const on = Boolean(url && jwt)
  if (on) {
    process.env.NEXT_PUBLIC_SYNC_ENCLAVE_URL = url
  }
  return {
    TEST_JWT: jwt,
    enabled: on,
  }
})

import {
  attachmentDelete,
  attachmentGet,
  attachmentGetPublic,
  attachmentPut,
  base64ToBytes,
  bytesToBase64,
  deleteRow,
  health,
  keyCurrent,
  listStatus,
  newIdempotencyKey,
  pull,
  pullItemPlaintext,
  push,
  registerKey,
  removeBundle,
  shareOpen,
  shareSeal,
} from '@/services/sync-enclave/sync-api'
import {
  resetSyncEnclaveClient,
  SyncEnclaveError,
} from '@/services/sync-enclave/sync-enclave-client'
import { WIRE_CODES } from '@/services/sync-enclave/wire-contract'

function randomCekBytes(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32))
}

async function collectCleanupFailure(
  operation: () => Promise<unknown>,
  failures: unknown[],
): Promise<void> {
  try {
    await operation()
  } catch (error) {
    if (
      !(error instanceof SyncEnclaveError) ||
      (error.status !== 404 && error.code !== 'NOT_FOUND')
    ) {
      failures.push(error)
    }
  }
}

describe.skipIf(!enabled)('sync-enclave live smoke', () => {
  let cekBytes: Uint8Array
  let cekB64: string
  let registeredKeyId: string | null = null
  let registrationRequest: Parameters<typeof registerKey>[0]
  let registrationResponse: Awaited<ReturnType<typeof registerKey>>
  let profileEtag: string | null = null
  let chatEtag: string | null = null
  let chatDeleted = false
  const attachmentIds = new Set<string>()
  const runId = `${Date.now()}-${newIdempotencyKey()}`
  const credentialId = `integration-cred-${runId}`
  const chatId = `integration-chat-${runId}`
  const profilePayload = new TextEncoder().encode(
    JSON.stringify({ smoke: true, runId }),
  )
  const chatPayload = new TextEncoder().encode(
    JSON.stringify({ id: chatId, title: 'adversarial sync test', runId }),
  )

  beforeAll(async () => {
    // The enclave client pulls the JWT from authTokenManager; for a
    // standalone integration run we override with the CI-provided
    // token without touching production auth wiring.
    const auth = await import('@/services/auth')
    auth.authTokenManager.getValidToken = async () => TEST_JWT as string
    auth.authTokenManager.refreshToken = async () => TEST_JWT as string
    auth.authTokenManager.getAuthHeaders = async () => ({
      Authorization: `Bearer ${TEST_JWT as string}`,
    })
    resetSyncEnclaveClient()

    cekBytes = randomCekBytes()
    cekB64 = bytesToBase64(cekBytes)
    const before = await keyCurrent()
    registrationRequest = {
      keyB64: cekB64,
      ifMatch: before.key_id ? (before.etag ?? '') : '*',
      createdVia: before.key_id ? 'start_fresh' : 'passkey',
      idempotencyKey: newIdempotencyKey(),
      initialBundle: {
        credentialId,
        kekIvHex: '00'.repeat(12),
        encryptedKeysHex: '00'.repeat(48),
      },
    }
    registrationResponse = await registerKey(registrationRequest)
    registeredKeyId = registrationResponse.key_id
  })

  afterAll(async () => {
    const cleanupFailures: unknown[] = []
    for (const id of attachmentIds) {
      await collectCleanupFailure(
        () => attachmentDelete({ id }),
        cleanupFailures,
      )
    }
    if (chatEtag && !chatDeleted) {
      await collectCleanupFailure(
        () =>
          deleteRow({
            scope: 'chat',
            id: chatId,
            ifMatch: chatEtag,
            idempotencyKey: newIdempotencyKey(),
            keyB64: cekB64,
          }),
        cleanupFailures,
      )
    }
    if (profileEtag) {
      await collectCleanupFailure(
        () =>
          deleteRow({
            scope: 'profile',
            id: 'profile',
            ifMatch: profileEtag,
            idempotencyKey: newIdempotencyKey(),
            keyB64: cekB64,
          }),
        cleanupFailures,
      )
    }
    if (registeredKeyId) {
      await collectCleanupFailure(
        () =>
          removeBundle({
            keyId: registeredKeyId as string,
            keyB64: cekB64,
            credentialId,
            idempotencyKey: newIdempotencyKey(),
          }),
        cleanupFailures,
      )
    }
    if (cleanupFailures.length > 0) {
      throw new AggregateError(
        cleanupFailures,
        'sync enclave integration cleanup failed',
      )
    }
  })

  it('reports a healthy enclave', async () => {
    const resp = await health()
    expect(resp.status).toBeTruthy()
  })

  it('registers a fresh key and replays the same operation exactly once', async () => {
    expect(registrationResponse.ok).toBe(true)
    expect(registrationResponse.key_id).toMatch(/^[0-9a-f]+$/)

    const replay = await registerKey(registrationRequest)
    expect(replay).toEqual(registrationResponse)
    const current = await keyCurrent()
    expect(current.key_id).toBe(registrationResponse.key_id)
    expect(current.bundles[credentialId]).toBeDefined()
  })

  it('round-trips a profile blob through push and pull', async () => {
    const pushResp = await push({
      scope: 'profile',
      id: 'profile',
      keyB64: cekB64,
      plaintext: profilePayload,
      ifMatch: null,
      idempotencyKey: newIdempotencyKey(),
    })
    profileEtag = pushResp.etag
    expect(pushResp.ok).toBe(true)
    expect(pushResp.etag).toBeTruthy()
    expect(pushResp.key_id).toBe(registeredKeyId)

    const pullResp = await pull({
      scope: 'profile',
      keys: [{ key: cekB64 }],
      all: true,
    })
    expect(pullResp.items.length).toBeGreaterThanOrEqual(1)
    const ours = pullResp.items.find((i) => i.ok && i.plaintext)
    expect(ours).toBeDefined()
    if (ours?.plaintext) {
      const decoded = new TextDecoder().decode(base64ToBytes(ours.plaintext))
      expect(JSON.parse(decoded)).toEqual({ smoke: true, runId })
    }
  })

  it('enforces idempotency, CAS, and key isolation for chat writes', async () => {
    const createRequest = {
      scope: 'chat' as const,
      id: chatId,
      keyB64: cekB64,
      plaintext: chatPayload,
      ifMatch: null,
      idempotencyKey: newIdempotencyKey(),
      metadata: { test_run: runId },
    }
    const created = await push(createRequest)
    chatEtag = created.etag

    await expect(push(createRequest)).resolves.toEqual(created)
    await expect(
      push({
        ...createRequest,
        plaintext: new TextEncoder().encode('different operation'),
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: WIRE_CODES.IdempotencyConflict,
    })

    const updatedPayload = new TextEncoder().encode(
      JSON.stringify({ id: chatId, title: 'updated', runId }),
    )
    const updated = await push({
      ...createRequest,
      plaintext: updatedPayload,
      ifMatch: created.etag,
      idempotencyKey: newIdempotencyKey(),
    })
    chatEtag = updated.etag
    expect(updated.etag).not.toBe(created.etag)

    await expect(
      push({
        ...createRequest,
        plaintext: new TextEncoder().encode('stale overwrite'),
        ifMatch: created.etag,
        idempotencyKey: newIdempotencyKey(),
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: WIRE_CODES.SyncConflict,
    })

    const wrongKey = bytesToBase64(randomCekBytes())
    const wrongKeyPull = await pull({
      scope: 'chat',
      ids: [chatId],
      keys: [{ key: wrongKey }],
    })
    const unreadable = wrongKeyPull.items.find((item) => item.id === chatId)
    expect(unreadable).toMatchObject({ id: chatId, ok: false })
    expect(unreadable?.plaintext).toBeUndefined()

    const pulled = await pull({
      scope: 'chat',
      ids: [chatId],
      keys: [{ key: cekB64 }],
    })
    const readable = pulled.items.find((item) => item.id === chatId)
    expect(readable).toMatchObject({ id: chatId, ok: true, etag: updated.etag })
    expect(pullItemPlaintext(readable!)).toEqual(updatedPayload)

    const deleteRequest = {
      scope: 'chat' as const,
      id: chatId,
      ifMatch: chatEtag,
      idempotencyKey: newIdempotencyKey(),
      keyB64: cekB64,
    }
    const deleted = await deleteRow(deleteRequest)
    await expect(deleteRow(deleteRequest)).resolves.toEqual(deleted)
    chatDeleted = true

    const afterDelete = await pull({
      scope: 'chat',
      ids: [chatId],
      keys: [{ key: cekB64 }],
    })
    expect(
      afterDelete.items.some(
        (item) => item.id === chatId && item.ok && !!item.plaintext,
      ),
    ).toBe(false)

    const statusAfterDelete = await listStatus({
      scope: 'chat',
      direction: 'desc',
      limit: 100,
    })
    expect(statusAfterDelete.deletes.some((item) => item.id === chatId)).toBe(
      true,
    )
    const restoredPayload = new TextEncoder().encode(
      JSON.stringify({ id: chatId, title: 'restored', runId }),
    )
    const restored = await push({
      ...createRequest,
      plaintext: restoredPayload,
      ifMatch: null,
      idempotencyKey: newIdempotencyKey(),
      metadata: { ...createRequest.metadata, restoreDeleted: true },
    })
    chatEtag = restored.etag
    chatDeleted = false
    expect(BigInt(restored.etag)).toBeGreaterThan(BigInt(updated.etag))

    const afterRestore = await pull({
      scope: 'chat',
      ids: [chatId],
      keys: [{ key: cekB64 }],
    })
    const restoredItem = afterRestore.items.find((item) => item.id === chatId)
    expect(restoredItem).toMatchObject({
      id: chatId,
      ok: true,
      etag: restored.etag,
    })
    expect(pullItemPlaintext(restoredItem!)).toEqual(restoredPayload)
  })

  it('protects attachment capabilities and rejects altered replays', async () => {
    const plaintext = crypto.getRandomValues(new Uint8Array(257))
    const putRequest = {
      chatId,
      plaintext,
      idempotencyKey: newIdempotencyKey(),
    }
    const stored = await attachmentPut(putRequest)
    attachmentIds.add(stored.id)

    await expect(attachmentPut(putRequest)).resolves.toEqual(stored)
    const alteredPlaintext = new Uint8Array([1, 2, 3])
    const altered = await attachmentPut({
      ...putRequest,
      plaintext: alteredPlaintext,
      idempotencyKey: newIdempotencyKey(),
    })
    attachmentIds.add(altered.id)
    expect(altered.id).not.toBe(stored.id)
    expect(altered.att_key).not.toBe(stored.att_key)
    await expect(
      attachmentGet({ id: stored.id, attKeyB64: stored.att_key }),
    ).resolves.toEqual(plaintext)
    await expect(
      attachmentGet({ id: altered.id, attKeyB64: altered.att_key }),
    ).resolves.toEqual(alteredPlaintext)
    await expect(
      attachmentGetPublic({ id: stored.id, attKeyB64: stored.att_key }),
    ).resolves.toEqual(plaintext)

    const wrongKey = bytesToBase64(randomCekBytes())
    await expect(
      attachmentGetPublic({ id: stored.id, attKeyB64: wrongKey }),
    ).rejects.toBeInstanceOf(SyncEnclaveError)
  })

  it('detects tampering when sealing and opening public shares', async () => {
    const plaintext = crypto.getRandomValues(new Uint8Array(513))
    const sealed = await shareSeal({ plaintext })
    const ciphertext = base64ToBytes(sealed.ciphertext)

    await expect(
      shareOpen({ shareKeyHex: sealed.share_key, ciphertext }),
    ).resolves.toEqual(plaintext)

    const tampered = ciphertext.slice()
    tampered[tampered.length - 1] ^= 1
    await expect(
      shareOpen({ shareKeyHex: sealed.share_key, ciphertext: tampered }),
    ).rejects.toBeInstanceOf(SyncEnclaveError)

    const wrongKey = `${sealed.share_key[0] === '0' ? '1' : '0'}${sealed.share_key.slice(1)}`
    await expect(
      shareOpen({ shareKeyHex: wrongKey, ciphertext }),
    ).rejects.toBeInstanceOf(SyncEnclaveError)
  })

  it('runs migration as a no-op for a freshly-keyed scope', async () => {
    // Just one batch is enough — the goal is to assert that the wire
    // contract is healthy. The full client loop is unit-tested in
    // legacy-blob-migration.test.ts.
    const mod = await import('@/services/sync-enclave/sync-api')
    const resp = await mod.migrate({
      scope: 'profile',
      keys: [{ key: cekB64 }],
      target: { key: cekB64 },
      limit: 1,
    })
    expect(resp.retryable_remaining).toBe(0)
    expect(resp.blocked.length).toBe(0)
  })

  it('keyCurrent reflects the registered bundle', async () => {
    const resp = await keyCurrent()
    expect(resp.key_id).toBe(registeredKeyId)
    expect(resp.bundles[credentialId]).toBeDefined()
  })
})
