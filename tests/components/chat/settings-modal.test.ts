import { getDeleteAllChatsSuccessDescription } from '@/components/chat/settings-modal'
import { describe, expect, it } from 'vitest'

describe('settings chat deletion confirmation', () => {
  it('describes completed cloud deletion without claiming an email was sent', () => {
    expect(getDeleteAllChatsSuccessDescription(true, true)).toBe(
      'Removed all chats from this device and encrypted cloud storage.',
    )
  })

  it('warns signed-in users when cloud deletion did not complete', () => {
    expect(getDeleteAllChatsSuccessDescription(true, false)).toBe(
      'Removed all chats from this device. Encrypted cloud storage was not cleared.',
    )
  })

  it('keeps guest deletion scoped to the browser session', () => {
    expect(getDeleteAllChatsSuccessDescription(false, false)).toBe(
      'Removed all chats from this browser session.',
    )
  })
})
