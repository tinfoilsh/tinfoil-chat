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

  it('keeps the failure notice visible after the user denies permission', async () => {
    enablePushNotifications.mockImplementation(async () => {
      // Denying the prompt flips the browser permission to denied, which
      // makes the banner ineligible at the same moment enabling fails.
      pushPermissionDenied.mockReturnValue(true)
      return false
    })
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

    // The failure notice hides via its own timeout, not immediately.
    act(() => {
      vi.advanceTimersByTime(CONSTANTS.NOTIFY_BANNER_CONFIRMATION_MS)
    })
    expect(result.current.bannerState).toBe('hidden')
  })

  it('watches the live session when the stream was retried mid-enable', async () => {
    const freshSession = 'b'.repeat(32)
    enablePushNotifications.mockImplementation(async () => {
      setActiveStreamSession(CHAT_ID, freshSession)
      return true
    })
    const { result } = renderBanner()
    act(() => setActiveStreamSession(CHAT_ID, SESSION_ID))
    act(() => {
      vi.advanceTimersByTime(CONSTANTS.NOTIFY_BANNER_DELAY_MS)
    })
    act(() => result.current.requestNotification())
    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })
    expect(watchStreamForPush).toHaveBeenCalledWith(freshSession, CHAT_ID)
    expect(result.current.bannerState).toBe('confirmed')
  })

  it('hides quietly when the stream finishes while enabling', async () => {
    enablePushNotifications.mockImplementation(async () => {
      clearActiveStreamSession(CHAT_ID)
      return true
    })
    const { result } = renderBanner()
    act(() => setActiveStreamSession(CHAT_ID, SESSION_ID))
    act(() => {
      vi.advanceTimersByTime(CONSTANTS.NOTIFY_BANNER_DELAY_MS)
    })
    act(() => result.current.requestNotification())
    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })
    expect(watchStreamForPush).not.toHaveBeenCalled()
    expect(result.current.bannerState).toBe('hidden')
  })

  it('re-offers a retried session even when the store clears before republishing', async () => {
    const { result } = renderBanner()
    act(() => setActiveStreamSession(CHAT_ID, SESSION_ID))
    act(() => {
      vi.advanceTimersByTime(CONSTANTS.NOTIFY_BANNER_DELAY_MS)
    })
    act(() => result.current.requestNotification())
    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })
    expect(result.current.bannerState).toBe('confirmed')

    // Retry lifecycle: old session clears first, fresh one publishes later.
    act(() => clearActiveStreamSession(CHAT_ID))
    act(() => setActiveStreamSession(CHAT_ID, 'b'.repeat(32)))
    expect(result.current.bannerState).toBe('hidden')
    act(() => {
      vi.advanceTimersByTime(CONSTANTS.NOTIFY_BANNER_DELAY_MS)
    })
    expect(result.current.bannerState).toBe('offer')
  })

  it('hides quietly when the stream retries while the watch call is in flight', async () => {
    watchStreamForPush.mockImplementation(async () => {
      // Fresh session replaces the watched one mid-request.
      setActiveStreamSession(CHAT_ID, 'b'.repeat(32))
      return true
    })
    const { result } = renderBanner()
    act(() => setActiveStreamSession(CHAT_ID, SESSION_ID))
    act(() => {
      vi.advanceTimersByTime(CONSTANTS.NOTIFY_BANNER_DELAY_MS)
    })
    act(() => result.current.requestNotification())
    await act(async () => {
      // Settles the watch promise and the fresh session's offer delay.
      await vi.runOnlyPendingTimersAsync()
    })
    // No misleading confirmation for the dead session; the fresh session
    // runs its own offer cycle instead.
    expect(result.current.bannerState).toBe('offer')
  })

  it('resets the banner when switching chats', async () => {
    const { result, rerender } = renderHook(
      ({ chatId }: { chatId: string }) =>
        useStreamNotifyBanner({
          chatId,
          watchChatId: chatId,
          responsePending: true,
        }),
      { initialProps: { chatId: CHAT_ID } },
    )
    act(() => setActiveStreamSession(CHAT_ID, SESSION_ID))
    act(() => {
      vi.advanceTimersByTime(CONSTANTS.NOTIFY_BANNER_DELAY_MS)
    })
    act(() => result.current.requestNotification())
    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })
    expect(result.current.bannerState).toBe('confirmed')

    // The confirmation must not follow the user into another chat.
    rerender({ chatId: 'chat-2' })
    expect(result.current.bannerState).toBe('hidden')
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
