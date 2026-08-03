import {
  getActiveStreamSessionSnapshot,
  subscribeActiveStreamSessions,
} from '@/services/notifications/active-stream-sessions'
import {
  enablePushNotifications,
  pushNotificationsAvailable,
  pushPermissionDenied,
  watchStreamForPush,
} from '@/services/notifications/push-notifications'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { CONSTANTS } from '../constants'

export type NotifyBannerState =
  'hidden' | 'offer' | 'enabling' | 'confirmed' | 'failed'

interface UseStreamNotifyBannerArgs {
  chatId: string
  /**
   * Identifier embedded in the push payload to build the notification's
   * click-through URL (`/chat/{watchChatId}`). Local-only chats pass
   * `local/{chatId}` so the deep link lands on their `/chat/local/` route.
   */
  watchChatId: string
  /** True while the current chat is waiting for or receiving a response. */
  responsePending: boolean
}

interface UseStreamNotifyBannerReturn {
  bannerState: NotifyBannerState
  requestNotification: () => void
  dismissBanner: () => void
}

const emptySessions: ReadonlyMap<string, string> = new Map()

function useActiveStreamSession(chatId: string): string | null {
  const sessions = useSyncExternalStore(
    subscribeActiveStreamSessions,
    getActiveStreamSessionSnapshot,
    () => emptySessions,
  )
  return sessions.get(chatId) ?? null
}

/**
 * Drives the "Want to be notified when Claude responds?" banner above the
 * chat input. The offer appears once a recovery-enabled stream (signed-in,
 * non-temporary chats only) has been pending for NOTIFY_BANNER_DELAY_MS, and
 * clicking Notify registers this browser for a push and watches the live
 * stream's recovery session on the controlplane.
 */
export function useStreamNotifyBanner({
  chatId,
  watchChatId,
  responsePending,
}: UseStreamNotifyBannerArgs): UseStreamNotifyBannerReturn {
  const sessionId = useActiveStreamSession(chatId)
  const [bannerState, setBannerState] = useState<NotifyBannerState>('hidden')
  // Sessions the user dismissed or already set a watch on; keyed by session
  // so a retried stream (fresh session) can offer again.
  const handledSessionsRef = useRef<Set<string>>(new Set())
  // Mirrors chatId so async work started before a chat switch can detect
  // that its result no longer belongs to the banner on screen.
  const chatIdRef = useRef(chatId)
  chatIdRef.current = chatId

  const eligible =
    Boolean(sessionId) &&
    responsePending &&
    pushNotificationsAvailable() &&
    !pushPermissionDenied() &&
    !handledSessionsRef.current.has(sessionId as string)

  // Each chat gets its own banner lifecycle: switching chats resets the
  // state machine so a confirmation can't linger into another chat.
  useEffect(() => {
    setBannerState('hidden')
  }, [chatId])

  // A replacement session (stream retry) also restarts the state machine,
  // so a confirmation for the dead session can't swallow the fresh offer.
  // Tracks the last non-null session: retries may clear the store before
  // publishing the replacement (old -> null -> new), and the comparison must
  // span that gap while confirmed/failed notices linger through it.
  const lastSessionRef = useRef(sessionId)
  useEffect(() => {
    if (!sessionId) return
    const previous = lastSessionRef.current
    lastSessionRef.current = sessionId
    if (previous && sessionId !== previous) {
      setBannerState('hidden')
    }
  }, [sessionId])

  useEffect(() => {
    if (!eligible) {
      setBannerState((current) => {
        // Let the confirmation and failure notices linger through their own
        // timeout even if the stream finishes (or permission gets denied)
        // meanwhile; everything else hides immediately.
        if (current === 'confirmed' || current === 'failed') return current
        return 'hidden'
      })
      return
    }
    const timer = window.setTimeout(() => {
      setBannerState((current) => (current === 'hidden' ? 'offer' : current))
    }, CONSTANTS.NOTIFY_BANNER_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [eligible, sessionId])

  useEffect(() => {
    if (bannerState !== 'confirmed' && bannerState !== 'failed') return
    const timer = window.setTimeout(() => {
      setBannerState('hidden')
    }, CONSTANTS.NOTIFY_BANNER_CONFIRMATION_MS)
    return () => window.clearTimeout(timer)
  }, [bannerState])

  const requestNotification = useCallback(() => {
    if (!sessionId) return
    const requestChatId = chatId
    setBannerState('enabling')
    void (async () => {
      const enabled = await enablePushNotifications()
      // The permission prompt and FCM registration can take arbitrarily
      // long; the user may have switched chats, or the stream may have
      // finished or retried onto a fresh session. Re-read the live session
      // and watch that one, not the session captured at click time.
      if (chatIdRef.current !== requestChatId) return
      const liveSessionId =
        getActiveStreamSessionSnapshot().get(requestChatId) ?? null
      if (!enabled) {
        setBannerState('failed')
        return
      }
      if (!liveSessionId) {
        // The stream already finished; its response is on screen.
        setBannerState('hidden')
        return
      }
      const watching = await watchStreamForPush(liveSessionId, watchChatId)
      if (chatIdRef.current !== requestChatId) return
      const sessionAfterWatch =
        getActiveStreamSessionSnapshot().get(requestChatId) ?? null
      // The watched session is no longer live: the stream finished (watch
      // acceptance means the push will still arrive, but the response is on
      // screen) or retried onto a fresh session (watch is dead; let the
      // fresh session run its own offer cycle). Either way a lingering
      // confirmation or failure notice would mislead, so hide quietly.
      if (sessionAfterWatch !== liveSessionId) {
        if (watching) handledSessionsRef.current.add(liveSessionId)
        setBannerState('hidden')
        return
      }
      if (watching) {
        handledSessionsRef.current.add(liveSessionId)
        setBannerState('confirmed')
      } else {
        setBannerState('failed')
      }
    })()
  }, [sessionId, chatId, watchChatId])

  const dismissBanner = useCallback(() => {
    if (sessionId) {
      handledSessionsRef.current.add(sessionId)
    }
    setBannerState('hidden')
  }, [sessionId])

  return { bannerState, requestNotification, dismissBanner }
}
