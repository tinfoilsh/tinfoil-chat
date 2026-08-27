import { getDeleteAllChatsSuccessDescription } from '@/components/chat/settings-modal'
import { describe, expect, it } from 'vitest'

describe('settings chat deletion confirmation', () => {
  it('describes signed-in deletion without claiming an email was sent', () => {
    expect(getDeleteAllChatsSuccessDescription(true)).toBe(
      'Removed all chats from this device and encrypted cloud storage.',
    )
  })

  it('keeps local-only deletion scoped to the browser session', () => {
    expect(getDeleteAllChatsSuccessDescription(false)).toBe(
      'Removed all chats from this browser session.',
    )
  })
})
