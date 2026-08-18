import { consumeFavoriteDrop } from '@/components/chat/favorite-drag'
import { describe, expect, it, vi } from 'vitest'

describe('consumeFavoriteDrop', () => {
  it('removes a dragged favorite without moving the chat', () => {
    const onRemoveFavorite = vi.fn()

    expect(
      consumeFavoriteDrop({
        source: 'favorites',
        chatId: 'chat-a',
        pinnedChatIds: ['chat-a'],
        onRemoveFavorite,
      }),
    ).toBe(true)
    expect(onRemoveFavorite).toHaveBeenCalledWith('chat-a')
  })

  it('leaves non-favorite drag sources for other drop handlers', () => {
    const onRemoveFavorite = vi.fn()

    expect(
      consumeFavoriteDrop({
        source: 'chat-history',
        chatId: 'chat-a',
        pinnedChatIds: ['chat-a'],
        onRemoveFavorite,
      }),
    ).toBe(false)
    expect(onRemoveFavorite).not.toHaveBeenCalled()
  })

  it('leaves stale favorite sources for other drop handlers', () => {
    const onRemoveFavorite = vi.fn()

    expect(
      consumeFavoriteDrop({
        source: 'favorites',
        chatId: 'chat-a',
        pinnedChatIds: [],
        onRemoveFavorite,
      }),
    ).toBe(false)
    expect(onRemoveFavorite).not.toHaveBeenCalled()
  })
})
