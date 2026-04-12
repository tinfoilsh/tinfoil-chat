import {
  AUTH_ACTIVE_USER_ID,
  SECRET_CLOUD_KEY_AUTHORIZATION_PREFIX,
} from '@/constants/storage-keys'
import { encryptionService } from '../encryption/encryption-service'

export type CloudKeyAuthorizationMode = 'validated' | 'explicit_start_fresh'

interface CloudKeyAuthorizationRecord {
  fingerprint: string
  mode: CloudKeyAuthorizationMode
}

function getActiveUserId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(AUTH_ACTIVE_USER_ID)
}

function storageKey(userId: string): string {
  return `${SECRET_CLOUD_KEY_AUTHORIZATION_PREFIX}${userId}`
}

function loadRecord(userId: string): CloudKeyAuthorizationRecord | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return null
    return JSON.parse(raw) as CloudKeyAuthorizationRecord
  } catch {
    return null
  }
}

async function fingerprintForKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(key),
  )

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function getCurrentCloudKeyAuthorizationMode(): Promise<CloudKeyAuthorizationMode | null> {
  const userId = getActiveUserId()
  const currentKey = encryptionService.getKey()
  if (!userId || !currentKey) return null

  const record = loadRecord(userId)
  if (!record) return null

  const fingerprint = await fingerprintForKey(currentKey)
  return record.fingerprint === fingerprint ? record.mode : null
}

export async function canWriteToCloud(): Promise<boolean> {
  return (await getCurrentCloudKeyAuthorizationMode()) !== null
}

export async function authorizeCurrentPrimaryKey(
  mode: CloudKeyAuthorizationMode,
): Promise<boolean> {
  const userId = getActiveUserId()
  const currentKey = encryptionService.getKey()
  if (!userId || !currentKey || typeof window === 'undefined') return false

  try {
    const fingerprint = await fingerprintForKey(currentKey)
    const record: CloudKeyAuthorizationRecord = { fingerprint, mode }
    localStorage.setItem(storageKey(userId), JSON.stringify(record))
    return true
  } catch {
    clearCloudKeyAuthorization(userId)
    return false
  }
}

export async function authorizeCurrentPrimaryKeyOrThrow(
  mode: CloudKeyAuthorizationMode,
): Promise<void> {
  const authorized = await authorizeCurrentPrimaryKey(mode)
  if (!authorized) {
    throw new Error('Failed to authorize the current encryption key')
  }
}

export function clearCloudKeyAuthorization(userId?: string | null): void {
  if (typeof window === 'undefined') return

  const resolvedUserId = userId ?? getActiveUserId()
  if (!resolvedUserId) return

  localStorage.removeItem(storageKey(resolvedUserId))
}
