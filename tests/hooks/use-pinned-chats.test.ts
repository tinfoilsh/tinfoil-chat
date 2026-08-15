import { usePinnedChats } from '@/hooks/use-pinned-chats'
import { chatEvents } from '@/services/storage/chat-events'
import { savePinnedChatIds } from '@/services/storage/pinned-chats'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

describe('usePinnedChats', () => {
  beforeEach(() => {
    localStorage.clear()
    chatEvents.clear()
  })

  it('prunes pins only after a confirmed delete event', () => {
    savePinnedChatIds(['chat-a', 'chat-b'])
    const { result } = renderHook(() => usePinnedChats())

    act(() => chatEvents.emit({ reason: 'sync', ids: ['chat-a'] }))
    expect(result.current.pinnedChatIds).toEqual(['chat-a', 'chat-b'])

    act(() => chatEvents.emit({ reason: 'delete', ids: ['chat-a'] }))
    expect(result.current.pinnedChatIds).toEqual(['chat-b'])
  })

  it('removes multiple confirmed ids atomically', () => {
    savePinnedChatIds(['chat-a', 'chat-b', 'chat-c'])
    const { result } = renderHook(() => usePinnedChats())

    act(() => result.current.unpinChats(['chat-a', 'chat-c']))

    expect(result.current.pinnedChatIds).toEqual(['chat-b'])
  })

  it('clears every pin only for an explicit delete-all event', () => {
    savePinnedChatIds(['chat-a', 'chat-b'])
    const { result } = renderHook(() => usePinnedChats())

    act(() => chatEvents.emit({ reason: 'delete', ids: [] }))
    expect(result.current.pinnedChatIds).toEqual(['chat-a', 'chat-b'])

    act(() => chatEvents.emit({ reason: 'delete-all' }))
    expect(result.current.pinnedChatIds).toEqual([])
  })
})
