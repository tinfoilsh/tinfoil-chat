import { getVisibleMessages } from '@/components/chat/chat-messages'
import { getAssistantRenderSections } from '@/components/chat/renderers/default/DefaultMessageRenderer'
import type { Message } from '@/components/chat/types'
import { describe, expect, it } from 'vitest'

describe('chat UI behavior', () => {
  it('filters hidden action messages out of the visible chat timeline', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: 'I clicked "Postpone" on the confirmation card.',
        hiddenFromUI: true,
        timestamp: new Date('2026-04-19T08:33:00.000Z'),
      },
      {
        role: 'assistant',
        content: 'Good call — we should postpone the migration.',
        timestamp: new Date('2026-04-19T08:33:01.000Z'),
      },
    ]

    expect(getVisibleMessages(messages)).toEqual([messages[1]])
  })

  it('orders assistant content before tool-rendered plan components', () => {
    expect(getAssistantRenderSections(true, true)).toEqual([
      'content',
      'toolCalls',
    ])
  })
})
