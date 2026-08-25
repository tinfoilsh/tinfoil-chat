export const RECOVERY_ENVELOPE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000
export const MAX_PENDING_RECOVERIES_PER_CHAT = 8
export const MAX_RECOVERY_ID_LENGTH = 256
export const MAX_RECOVERY_CIPHERTEXT_BYTES = 4096

export type SyncedRecoveryEnvelope = {
  v: 1
  storage?: never
  turnId: string
  keyId: string
  createdAt: string
  expiresAt: string
  nonce: string
  ciphertext: string
}

export type LocalRecoveryEnvelope = {
  v: 1
  storage: 'local'
  turnId: string
  createdAt: string
  expiresAt: string
  storageId: string
  resumeSecret: string
}

export type PendingRecoveryEnvelope =
  SyncedRecoveryEnvelope | LocalRecoveryEnvelope

export function isLocalRecoveryEnvelope(
  envelope: PendingRecoveryEnvelope,
): envelope is LocalRecoveryEnvelope {
  return envelope.storage === 'local'
}

export function samePendingRecoveryEnvelope(
  left: PendingRecoveryEnvelope,
  right: PendingRecoveryEnvelope,
): boolean {
  if (left.v !== right.v || left.turnId !== right.turnId) return false
  if (isLocalRecoveryEnvelope(left) || isLocalRecoveryEnvelope(right)) {
    return (
      isLocalRecoveryEnvelope(left) &&
      isLocalRecoveryEnvelope(right) &&
      left.createdAt === right.createdAt &&
      left.expiresAt === right.expiresAt &&
      left.storageId === right.storageId &&
      left.resumeSecret === right.resumeSecret
    )
  }
  return (
    left.keyId === right.keyId &&
    left.createdAt === right.createdAt &&
    left.expiresAt === right.expiresAt &&
    left.nonce === right.nonce &&
    left.ciphertext === right.ciphertext
  )
}
