import { API_BASE_URL, FIREBASE_CONFIG, FIREBASE_VAPID_KEY } from '@/config'
import { authTokenManager } from '@/services/auth'
import { logError } from '@/utils/error-handling'
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getMessaging, getToken, isSupported } from 'firebase/messaging'

const SERVICE_WORKER_URL = '/firebase-messaging-sw.js'

let firebaseApp: FirebaseApp | null = null
let cachedFcmToken: string | null = null
let enablePromise: Promise<boolean> | null = null

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

  enablePromise = (async () => {
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

      // Re-registering after a token rotation: the old token is pruned
      // server-side when FCM reports it unregistered, so only the fresh
      // token needs to be stored.
      if (cachedFcmToken !== fcmToken) {
        const response = await apiFetch('/api/notifications/devices', {
          method: 'POST',
          body: { token: fcmToken },
        })
        if (!response.ok) return false
        cachedFcmToken = fcmToken
      }
      return true
    } catch (error) {
      logError('Failed to enable push notifications', error, {
        component: 'push-notifications',
        action: 'enablePushNotifications',
      })
      return false
    } finally {
      enablePromise = null
    }
  })()
  return enablePromise
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
 * Forgets the in-memory registration state, e.g. on sign-out or account
 * switch. The FCM token itself is device-scoped, but the controlplane
 * registration is per-user, so the next account must re-register instead of
 * hitting the previous account's already-registered cache.
 */
export function resetPushNotifications(): void {
  cachedFcmToken = null
  enablePromise = null
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
