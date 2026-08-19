import {
  PENDING_ENCRYPTION_KEY_RECOVERY,
  USER_ENCRYPTION_KEY,
} from '@/constants/storage-keys'
import { encryptionService } from '@/services/encryption/encryption-service'
import {
  deletePendingKeyRecovery,
  getPendingKeyRecovery,
  restorePendingKeyForOwner,
  writePendingKeyRecovery,
} from '@/utils/pending-key-recovery'
import { beforeEach, describe, expect, it } from 'vitest'

describe('pending key recovery', () => {
  let encryptionKey: string

  beforeEach(async () => {
    localStorage.clear()
    encryptionService.clearKey({ persist: false })
    encryptionKey = await encryptionService.generateKey()
  })

  it('writes and validates an owner-bound version 1 record', () => {
    expect(writePendingKeyRecovery('user_1', encryptionKey)).toEqual({
      version: 1,
      ownerUserId: 'user_1',
      encryptionKey,
    })
    expect(getPendingKeyRecovery()?.encryptionKey).toBe(encryptionKey)
  })

  it('rejects malformed and non-canonical records', () => {
    localStorage.setItem(
      PENDING_ENCRYPTION_KEY_RECOVERY,
      JSON.stringify({
        version: 1,
        ownerUserId: 'user_1',
        encryptionKey: encryptionKey.toUpperCase(),
      }),
    )

    expect(getPendingKeyRecovery()).toBeNull()
    expect(() => writePendingKeyRecovery('user_1', 'not-a-key')).toThrow()
  })

  it('restores only for the same owner and consumes the pending record', () => {
    writePendingKeyRecovery('user_1', encryptionKey)

    expect(restorePendingKeyForOwner('user_1')).toBe(true)
    expect(localStorage.getItem(USER_ENCRYPTION_KEY)).toBe(encryptionKey)
    expect(getPendingKeyRecovery()).toBeNull()
  })

  it('discards a different owner record without loading its key', () => {
    writePendingKeyRecovery('user_1', encryptionKey)

    expect(restorePendingKeyForOwner('user_2')).toBe(false)
    expect(localStorage.getItem(USER_ENCRYPTION_KEY)).toBeNull()
    expect(getPendingKeyRecovery()).toBeNull()
  })

  it('deletes the pending record when recovery is done', () => {
    writePendingKeyRecovery('user_1', encryptionKey)
    deletePendingKeyRecovery()
    expect(getPendingKeyRecovery()).toBeNull()
  })
})
