import {
  clearActiveStreamSession,
  clearAllActiveStreamSessions,
  getActiveStreamSessionSnapshot,
  setActiveStreamSession,
  subscribeActiveStreamSessions,
} from '@/services/notifications/active-stream-sessions'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  for (const chatId of getActiveStreamSessionSnapshot().keys()) {
    clearActiveStreamSession(chatId)
  }
})

describe('active-stream-sessions', () => {
  it('tracks the live session per chat and notifies subscribers', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeActiveStreamSessions(listener)

    setActiveStreamSession('chat-1', 'a'.repeat(32))
    expect(getActiveStreamSessionSnapshot().get('chat-1')).toBe('a'.repeat(32))
    expect(listener).toHaveBeenCalledTimes(1)

    // A retry swaps in a fresh session for the same chat.
    setActiveStreamSession('chat-1', 'b'.repeat(32))
    expect(getActiveStreamSessionSnapshot().get('chat-1')).toBe('b'.repeat(32))
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    setActiveStreamSession('chat-2', 'c'.repeat(32))
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('does not publish when setting an identical session', () => {
    setActiveStreamSession('chat-1', 'a'.repeat(32))
    const listener = vi.fn()
    const unsubscribe = subscribeActiveStreamSessions(listener)
    setActiveStreamSession('chat-1', 'a'.repeat(32))
    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('clears only when the session matches', () => {
    setActiveStreamSession('chat-1', 'a'.repeat(32))

    // Stale clear from a finished retry attempt must not drop the live one.
    clearActiveStreamSession('chat-1', 'b'.repeat(32))
    expect(getActiveStreamSessionSnapshot().get('chat-1')).toBe('a'.repeat(32))

    clearActiveStreamSession('chat-1', 'a'.repeat(32))
    expect(getActiveStreamSessionSnapshot().has('chat-1')).toBe(false)
  })

  it('clears unconditionally without a session filter', () => {
    setActiveStreamSession('chat-1', 'a'.repeat(32))
    clearActiveStreamSession('chat-1')
    expect(getActiveStreamSessionSnapshot().has('chat-1')).toBe(false)
  })

  it('clears everything on account switch', () => {
    setActiveStreamSession('chat-1', 'a'.repeat(32))
    setActiveStreamSession('chat-2', 'b'.repeat(32))
    clearAllActiveStreamSessions()
    expect(getActiveStreamSessionSnapshot().size).toBe(0)
  })

  it('returns stable snapshots between mutations', () => {
    setActiveStreamSession('chat-1', 'a'.repeat(32))
    const first = getActiveStreamSessionSnapshot()
    expect(getActiveStreamSessionSnapshot()).toBe(first)
    setActiveStreamSession('chat-2', 'b'.repeat(32))
    expect(getActiveStreamSessionSnapshot()).not.toBe(first)
  })
})
