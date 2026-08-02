import { CONSTANTS } from '@/components/chat/constants'
import { useStreamNotifyBanner } from '@/components/chat/hooks/use-stream-notify-banner'
import {
  clearActiveStreamSession,
  getActiveStreamSessionSnapshot,
  setActiveStreamSession,
} from '@/services/notifications/active-stream-sessions'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const enablePushNotifications = vi.fn()
const watchStreamForPush = vi.fn()
const pushNotificationsAvailable = vi.fn()
const pushPermissionDenied = vi.fn()

vi.mock('@/services/notifications/push-notifications', () => ({
  enablePushNotifications: (...args: unknown[]) =>
    enablePushNotifications(...args),
  watchStreamForPush: (...args: unknown[]) => watchStreamForPush(...args),
  pushNotificationsAvailable: () => pushNotificationsAvailable(),
  pushPermissionDenied: () => pushPermissionDenied(),
}))

const CHAT_ID = 'chat-1'
const SESSION_ID = 'a'.repeat(32)

function renderBanner(responsePending = true) {
  return renderHook(
    ({ pending }: { pending: boolean }) =>
      useStreamNotifyBanner({
        chatId: CHAT_ID,
        watchChatId: CHAT_ID,
        responsePending: pending,
      }),
    { initialProps: { pending: responsePending } },
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  pushNotificationsAvailable.mockReturnValue(true)
  pushPermissionDenied.mockReturnValue(false)
  enablePushNotifications.mockResolvedValue(true)
  watchStreamForPush.mockResolvedValue(true)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  for (const chatId of getActiveStreamSessionSnapshot().keys()) {
    clearActiveStreamSession(chatId)
  }
})

describe('useStreamNotifyBanner', () => {
  it('offers after the delay while a stream session is pending', () => {
    const { result } = renderBanner()
    expect(result.current.bannerState).toBe('hidden')

    act(() => setActiveStreamSession(CHAT_ID, SESSION_ID))
    act(() => {
      vi.advanceTimersByTime(CONSTANTS.NOTIFY_BANNER_DELAY_MS - 1)
    })
    expect(result.current.bannerState).toBe('hidden')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.bannerState).toBe('offer')
  })

  it('never offers without an active recovery session', () => {
    const { result } = renderBanner()
    act(() => {
      vi.advanceTimersByTime(CONSTANTS.NOTIFY_BANNER_DELAY_MS * 2)
    })
    expect(result.current.bannerState).toBe('hidden')
  })

  it('never offers when push is unavailable in this browser', () => {
    pushNotificationsAvailable.mockReturnValue(false)
    const { result } = renderBanner()
    act(() => setActiveStreamSession(CHAT_ID, SESSION_ID))
    act(() => {
      vi.advanceTimersByTime(CONSTANTS.NOTIFY_BANNER_DELAY_MS)
    })
    expect(result.current.bannerState).toBe('hidden')
  })

  it('hides when the stream finishes before the delay elapses', () => {
    const { result, rerender } = renderBanner()
    act(() => setActiveStreamSession(CHAT_ID, SESSION_ID))
    act(() => {
      vi.advanceTimersByTime(CONSTANTS.NOTIFY_BANNER_DELAY_MS - 1000)
    })
    act(() => clearActiveStreamSession(CHAT_ID))
    rerender({ pending: false })
    act(() => {
      vi.advanceTimersByTime(CONSTANTS.NOTIFY_BANNER_DELAY_MS)
    })
    expect(result.current.bannerState).toBe('hidden')
  })

  it('registers the device, watches the stream, and confirms', async () => {
    const { result } = renderBanner()
    act(() => setActiveStreamSession(CHAT_ID, SESSION_ID))
    act(() => {
      vi.advanceTimersByTime(CONSTANTS.NOTIFY_BANNER_DELAY_MS)
    })

    act(() => result.current.requestNotification())
    expect(result.current.bannerState).toBe('enabling')

    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })
    expect(enablePushNotifications).toHaveBeenCalledTimes(1)
    expect(watchStreamForPush).toHaveBeenCalledWith(SESSION_ID, CHAT_ID)
    expect(result.current.bannerState).toBe('confirmed')

    // The confirmation auto-hides and the session never re-offers.
    act(() => {
      vi.advanceTimersByTime(CONSTANTS.NOTIFY_BANNER_CONFIRMATION_MS)
    })
    expect(result.current.bannerState).toBe('hidden')
    act(() => {
      vi.advanceTimersByTime(CONSTANTS.NOTIFY_BANNER_DELAY_MS * 2)
    })
    expect(result.current.bannerState).toBe('hidden')
  })

  it('shows a failure state when the watch cannot be created', async () => {
    watchStreamForPush.mockResolvedValue(false)
    const { result } = renderBanner()
    act(() => setActiveStreamSession(CHAT_ID, SESSION_ID))
    act(() => {
      vi.advanceTimersByTime(CONSTANTS.NOTIFY_BANNER_DELAY_MS)
    })
    act(() => result.current.requestNotification())
    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })
    expect(result.current.bannerState).toBe('failed')
  })

  it('stays hidden for the same session after dismissal, but re-offers for a new session', () => {
    const { result } = renderBanner()
    act(() => setActiveStreamSession(CHAT_ID, SESSION_ID))
    act(() => {
      vi.advanceTimersByTime(CONSTANTS.NOTIFY_BANNER_DELAY_MS)
    })
    expect(result.current.bannerState).toBe('offer')

    act(() => result.current.dismissBanner())
    expect(result.current.bannerState).toBe('hidden')
    act(() => {
      vi.advanceTimersByTime(CONSTANTS.NOTIFY_BANNER_DELAY_MS * 2)
    })
    expect(result.current.bannerState).toBe('hidden')

    // A retried stream gets a fresh session and may offer again.
    act(() => setActiveStreamSession(CHAT_ID, 'b'.repeat(32)))
    act(() => {
      vi.advanceTimersByTime(CONSTANTS.NOTIFY_BANNER_DELAY_MS)
    })
    expect(result.current.bannerState).toBe('offer')
  })
})
