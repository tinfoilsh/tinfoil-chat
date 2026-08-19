import { PENDING_ENCRYPTION_KEY_RECOVERY } from '@/constants/storage-keys'
import { encryptionService } from '@/services/encryption/encryption-service'

const PENDING_KEY_RECOVERY_VERSION = 1

export interface PendingKeyRecovery {
  version: typeof PENDING_KEY_RECOVERY_VERSION
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
      record.version !== PENDING_KEY_RECOVERY_VERSION ||
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
  try {
    return parsePendingKeyRecovery(
      localStorage.getItem(PENDING_ENCRYPTION_KEY_RECOVERY),
    )
  } catch {
    return null
  }
}

export function writePendingKeyRecovery(
  ownerUserId: string,
  encryptionKey: string,
): PendingKeyRecovery {
  if (!ownerUserId || !isCanonicalEncryptionKey(encryptionKey)) {
    throw new Error('Invalid pending encryption key recovery record')
  }

  const record: PendingKeyRecovery = {
    version: PENDING_KEY_RECOVERY_VERSION,
    ownerUserId,
    encryptionKey,
  }
  if (typeof window === 'undefined') {
    throw new Error('Pending encryption key recovery storage is unavailable')
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
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(PENDING_ENCRYPTION_KEY_RECOVERY)
  } catch {
    // Best-effort cleanup when browser storage is unavailable.
  }
}

export async function restorePendingKeyForOwner(
  ownerUserId: string,
): Promise<boolean> {
  const pending = getPendingKeyRecovery()
  if (!pending) {
    deletePendingKeyRecovery()
    return false
  }
  if (pending.ownerUserId !== ownerUserId) {
    deletePendingKeyRecovery()
    return false
  }

  await encryptionService.replaceKeyBundle(pending.encryptionKey, [])
  deletePendingKeyRecovery()
  return true
}
