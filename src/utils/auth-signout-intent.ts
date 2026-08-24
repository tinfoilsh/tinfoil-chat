import {
  AUTH_SIGNOUT_CLEARED_EVENT,
  AUTH_SIGNOUT_INTENT_MAX_AGE_MS,
  AUTH_SIGNOUT_REQUESTED_EVENT,
} from '@/constants/auth-events'
import { AUTH_SIGNOUT_REQUESTED_AT } from '@/constants/storage-keys'

export function requestExplicitSignout(): void {
  try {
    localStorage.setItem(AUTH_SIGNOUT_REQUESTED_AT, String(Date.now()))
  } catch {
    // The same-tab event still lets cleanup proceed when storage is restricted.
  }
  window.dispatchEvent(new CustomEvent(AUTH_SIGNOUT_REQUESTED_EVENT))
}

function removeExplicitSignoutIntent(): void {
  try {
    localStorage.removeItem(AUTH_SIGNOUT_REQUESTED_AT)
  } catch {
    // best-effort
  }
}

export function clearExplicitSignoutIntent(): void {
  removeExplicitSignoutIntent()
  window.dispatchEvent(new CustomEvent(AUTH_SIGNOUT_CLEARED_EVENT))
}

export function hasRecentExplicitSignoutIntent(now = Date.now()): boolean {
  let requestedAt: number
  try {
    requestedAt = Number(localStorage.getItem(AUTH_SIGNOUT_REQUESTED_AT))
  } catch {
    return false
  }
  const age = now - requestedAt
  const isRecent =
    Number.isFinite(requestedAt) &&
    requestedAt > 0 &&
    age >= 0 &&
    age <= AUTH_SIGNOUT_INTENT_MAX_AGE_MS

  if (!isRecent) {
    removeExplicitSignoutIntent()
  }

  return isRecent
}
