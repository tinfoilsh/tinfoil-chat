import {
  PENDING_ENCRYPTION_KEY_RECOVERY,
  USER_ENCRYPTION_KEY,
} from '@/constants/storage-keys'
import { encryptionService } from '@/services/encryption/encryption-service'

export interface PendingKeyRecovery {
  version: 1
  ownerUserId: string
  encryptionKey: string
}

function isCanonicalEncryptionKey(key: string): boolean {
  const bytes = encryptionService.getAlternativeKeyBytes(key)
  return bytes !== null && encryptionService.encodeKeyFromBytes(bytes) === key
}

function parsePendingKeyRecovery(
  raw: string | null,
): PendingKeyRecovery | null {
  if (!raw) return null

  try {
    const record = JSON.parse(raw) as Partial<PendingKeyRecovery>
    if (
      record.version !== 1 ||
      typeof record.ownerUserId !== 'string' ||
      record.ownerUserId.length === 0 ||
      typeof record.encryptionKey !== 'string' ||
      !isCanonicalEncryptionKey(record.encryptionKey)
    ) {
      return null
    }
    return record as PendingKeyRecovery
  } catch {
    return null
  }
}

export function getPendingKeyRecovery(): PendingKeyRecovery | null {
  if (typeof window === 'undefined') return null
  return parsePendingKeyRecovery(
    localStorage.getItem(PENDING_ENCRYPTION_KEY_RECOVERY),
  )
}

export function writePendingKeyRecovery(
  ownerUserId: string,
  encryptionKey: string,
): PendingKeyRecovery {
  if (!ownerUserId || !isCanonicalEncryptionKey(encryptionKey)) {
    throw new Error('Invalid pending encryption key recovery record')
  }

  const record: PendingKeyRecovery = {
    version: 1,
    ownerUserId,
    encryptionKey,
  }
  localStorage.setItem(PENDING_ENCRYPTION_KEY_RECOVERY, JSON.stringify(record))

  const verified = getPendingKeyRecovery()
  if (
    !verified ||
    verified.ownerUserId !== ownerUserId ||
    verified.encryptionKey !== encryptionKey
  ) {
    throw new Error('Failed to verify pending encryption key recovery record')
  }
  return verified
}

export function deletePendingKeyRecovery(): void {
  localStorage.removeItem(PENDING_ENCRYPTION_KEY_RECOVERY)
}

export function restorePendingKeyForOwner(ownerUserId: string): boolean {
  const pending = getPendingKeyRecovery()
  if (!pending) {
    deletePendingKeyRecovery()
    return false
  }
  if (pending.ownerUserId !== ownerUserId) {
    deletePendingKeyRecovery()
    return false
  }

  localStorage.setItem(USER_ENCRYPTION_KEY, pending.encryptionKey)
  deletePendingKeyRecovery()
  return true
}
