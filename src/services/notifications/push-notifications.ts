import { API_BASE_URL, FIREBASE_CONFIG, FIREBASE_VAPID_KEY } from '@/config'
import { authTokenManager } from '@/services/auth'
import { logError } from '@/utils/error-handling'
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getMessaging, getToken, isSupported } from 'firebase/messaging'

const SERVICE_WORKER_URL = '/firebase-messaging-sw.js'

let firebaseApp: FirebaseApp | null = null
let cachedFcmToken: string | null = null
let enablePromise: Promise<boolean> | null = null
// Bumped by resetPushNotifications() so an in-flight enable started under a
// previous account cannot write its results into the next account's state.
let enableGeneration = 0

export function pushNotificationsConfigured(): boolean {
  return Boolean(
    FIREBASE_CONFIG.apiKey &&
    FIREBASE_CONFIG.projectId &&
    FIREBASE_CONFIG.messagingSenderId &&
    FIREBASE_CONFIG.appId &&
    FIREBASE_VAPID_KEY,
  )
}

export function pushNotificationsAvailable(): boolean {
  return (
    pushNotificationsConfigured() &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'Notification' in window &&
    'PushManager' in window
  )
}

export function pushPermissionDenied(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission === 'denied'
  )
}

async function apiFetch(
  path: string,
  init: { method: string; body?: unknown },
): Promise<Response> {
  const headers = await authTokenManager.getAuthHeaders()
  return fetch(`${API_BASE_URL}${path}`, {
    method: init.method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
}

/**
 * Requests notification permission (if needed), mints an FCM registration
 * token bound to our push service worker, and registers it with the
 * controlplane under the signed-in user. Idempotent and safe to call on
 * every "Notify" click; concurrent calls share one attempt.
 *
 * Returns true when pushes can be delivered to this browser.
 */
export async function enablePushNotifications(): Promise<boolean> {
  if (!pushNotificationsAvailable()) return false
  if (enablePromise) return enablePromise

  const generation = enableGeneration
  const thisAttempt = (async () => {
    try {
      if (!(await isSupported())) return false

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return false

      // Scope the worker away from '/' so it never intercepts page fetches
      // or clashes with any future app-wide service worker. getToken() waits
      // for the registration to activate before subscribing it to push.
      const registration = await navigator.serviceWorker.register(
        SERVICE_WORKER_URL,
        { scope: '/push/' },
      )

      firebaseApp ??= initializeApp(FIREBASE_CONFIG)
      const messaging = getMessaging(firebaseApp)
      const fcmToken = await getToken(messaging, {
        vapidKey: FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: registration,
      })
      if (!fcmToken) return false
      // The account changed mid-flight: this registration belonged to the
      // previous user; do not record it (or report success) for the next.
      if (generation !== enableGeneration) return false

      // Re-registering after a token rotation: the old token is pruned
      // server-side when FCM reports it unregistered, so only the fresh
      // token needs to be stored.
      if (cachedFcmToken !== fcmToken) {
        const response = await apiFetch('/api/notifications/devices', {
          method: 'POST',
          body: { token: fcmToken },
        })
        if (!response.ok) return false
        if (generation === enableGeneration) {
          cachedFcmToken = fcmToken
        }
      }
      return true
    } catch (error) {
      logError('Failed to enable push notifications', error, {
        component: 'push-notifications',
        action: 'enablePushNotifications',
      })
      return false
    } finally {
      // Only release the guard we own; a reset (account switch) bumps the
      // generation and takes over the shared state for the next account.
      if (generation === enableGeneration) {
        enablePromise = null
      }
    }
  })()
  enablePromise = thisAttempt
  return thisAttempt
}

/**
 * Asks the controlplane to push a notification when the stream identified
 * by the recovery session finishes. Returns false when the watch could not
 * be created (e.g. the stream already completed).
 */
export async function watchStreamForPush(
  sessionId: string,
  chatId: string,
): Promise<boolean> {
  try {
    const response = await apiFetch('/api/notifications/stream-watches', {
      method: 'POST',
      body: { session_id: sessionId, chat_id: chatId },
    })
    return response.ok
  } catch (error) {
    logError('Failed to create stream watch', error, {
      component: 'push-notifications',
      action: 'watchStreamForPush',
    })
    return false
  }
}

/**
 * Revokes this browser's push bindings for the signing-out account and
 * forgets the in-memory registration state. Best-effort and fire-and-forget:
 * it must run while the account's auth token is still valid.
 *
 * The FCM token itself is device-scoped, but the controlplane registration
 * is per-user, so the next account must re-register instead of hitting the
 * previous account's already-registered cache — hence the generation bump,
 * which also disowns any enable attempt still in flight.
 */
export function resetPushNotifications(): void {
  const staleToken = cachedFcmToken
  cachedFcmToken = null
  enablePromise = null
  enableGeneration += 1

  if (staleToken) {
    // Unregister the device server-side so stream watches created by the
    // signing-out account (whose payloads FCM would still deliver to this
    // browser) have no registered device to fan out to.
    void apiFetch('/api/notifications/devices', {
      method: 'DELETE',
      body: { token: staleToken },
    }).catch((error) => {
      logError('Failed to unregister push device on signout', error, {
        component: 'push-notifications',
        action: 'resetPushNotifications',
      })
    })
  }
}

/** Cancels a pending stream watch. Best-effort. */
export async function unwatchStreamForPush(sessionId: string): Promise<void> {
  try {
    await apiFetch(`/api/notifications/stream-watches/${sessionId}`, {
      method: 'DELETE',
    })
  } catch (error) {
    logError('Failed to delete stream watch', error, {
      component: 'push-notifications',
      action: 'unwatchStreamForPush',
    })
  }
}
