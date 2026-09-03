// Bumped whenever the sealed pair changes shape. v1 envelopes named a pair
// the previous harness API minted; nothing they point at can be resumed by
// this one, so they are dropped on sight rather than migrated.
export const RECOVERY_ENVELOPE_VERSION = 2

export const RECOVERY_ENVELOPE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000
export const MAX_PENDING_RECOVERIES_PER_CHAT = 8
export const MAX_RECOVERY_ID_LENGTH = 256
export const MAX_RECOVERY_CIPHERTEXT_BYTES = 4096

export type SyncedRecoveryEnvelope = {
  v: typeof RECOVERY_ENVELOPE_VERSION
  storage?: never
  turnId: string
  keyId: string
  createdAt: string
  expiresAt: string
  nonce: string
  ciphertext: string
}

export type LocalRecoveryEnvelope = {
  v: typeof RECOVERY_ENVELOPE_VERSION
  storage: 'local'
  turnId: string
  createdAt: string
  expiresAt: string
  sessionId: string
  recoveryToken: string
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
      left.sessionId === right.sessionId &&
      left.recoveryToken === right.recoveryToken
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
