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

  const eligible =
    Boolean(sessionId) &&
    responsePending &&
    pushNotificationsAvailable() &&
    !pushPermissionDenied() &&
    !handledSessionsRef.current.has(sessionId as string)

  useEffect(() => {
    if (!eligible) {
      setBannerState((current) => {
        // Let the confirmation linger through its own timeout even if the
        // stream finishes quickly; everything else hides immediately.
        if (current === 'confirmed') return current
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
    setBannerState('enabling')
    void (async () => {
      const enabled = await enablePushNotifications()
      const watching =
        enabled && (await watchStreamForPush(sessionId, watchChatId))
      if (watching) {
        handledSessionsRef.current.add(sessionId)
        setBannerState('confirmed')
      } else {
        setBannerState('failed')
      }
    })()
  }, [sessionId, watchChatId])

  const dismissBanner = useCallback(() => {
    if (sessionId) {
      handledSessionsRef.current.add(sessionId)
    }
    setBannerState('hidden')
  }, [sessionId])

  return { bannerState, requestNotification, dismissBanner }
}
