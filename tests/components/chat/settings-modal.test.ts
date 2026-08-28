import {
  getDeleteAllChatsSuccessDescription,
  getDeleteAllChatsSuccessTitle,
} from '@/components/chat/settings-modal'
import { describe, expect, it } from 'vitest'

describe('settings chat deletion confirmation', () => {
  it('scopes the title to the device when cloud deletion is incomplete', () => {
    expect(getDeleteAllChatsSuccessTitle(true, false)).toBe(
      'Chats deleted from this device',
    )
    expect(getDeleteAllChatsSuccessTitle(true, true)).toBe('All chats deleted')
    expect(getDeleteAllChatsSuccessTitle(false, false)).toBe(
      'All chats deleted',
    )
  })

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
