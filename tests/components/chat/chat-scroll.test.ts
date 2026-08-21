import {
  canRemoveChatSpacerWithoutJump,
  getChatContentBottomScrollTop,
  getDistanceFromChatContentBottom,
} from '@/components/chat/chat-scroll'
import { describe, expect, it } from 'vitest'

describe('chat scrolling', () => {
  it('targets the end of conversation content instead of the spacer', () => {
    expect(getChatContentBottomScrollTop(2400, 800, 500)).toBe(1100)
  })

  it('measures distance from conversation content instead of the spacer', () => {
    expect(getDistanceFromChatContentBottom(2400, 900, 800, 500)).toBe(200)
  })

  it('only removes the spacer when the viewport will not be clamped', () => {
    expect(canRemoveChatSpacerWithoutJump(2400, 900, 800, 500)).toBe(true)
    expect(canRemoveChatSpacerWithoutJump(1400, 500, 800, 500)).toBe(false)
  })
})
