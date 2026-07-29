import {
  getChatPath,
  getNewChatPath,
  isPlainPrimaryClick,
} from '@/utils/navigation'
import { describe, expect, it } from 'vitest'

describe('navigation utilities', () => {
  it('builds chat destinations for each storage context', () => {
    expect(getChatPath('chat-1')).toBe('/chat/chat-1')
    expect(getChatPath('chat-1', { isLocalOnly: true })).toBe(
      '/chat/local/chat-1',
    )
    expect(getChatPath('chat-1', { projectId: 'project-1' })).toBe(
      '/project/project-1/chat/chat-1',
    )
    expect(getNewChatPath()).toBe('/newchat')
    expect(getNewChatPath('project-1')).toBe('/project/project-1')
  })

  it('only classifies unmodified primary clicks as in-place navigation', () => {
    const primaryClick = {
      altKey: false,
      button: 0,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    }

    expect(isPlainPrimaryClick(primaryClick)).toBe(true)
    expect(isPlainPrimaryClick({ ...primaryClick, button: 1 })).toBe(false)
    expect(isPlainPrimaryClick({ ...primaryClick, ctrlKey: true })).toBe(false)
  })
})
