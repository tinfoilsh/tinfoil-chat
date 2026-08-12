import type { Message } from '@/components/chat/types'
import { TITLE_SOURCE_MAX_CHARACTERS } from '@/services/inference/constants'
import { getTitleContent } from '@/services/inference/title'
import { describe, expect, it } from 'vitest'

function message(overrides: Partial<Message>): Message {
  return {
    role: 'user',
    content: '',
    timestamp: new Date('2026-08-12T00:00:00.000Z'),
    ...overrides,
  }
}

describe('getTitleContent', () => {
  it('bounds large message content before title processing', () => {
    const content = getTitleContent(
      message({ content: 'A'.repeat(TITLE_SOURCE_MAX_CHARACTERS * 10) }),
    )

    expect(content).toHaveLength(TITLE_SOURCE_MAX_CHARACTERS)
  })

  it('bounds combined attachment content and uses metadata fallbacks', () => {
    const content = getTitleContent(
      message({
        attachments: [
          {
            id: 'attachment-1',
            type: 'document',
            fileName: 'fallback.pdf',
            textContent: ' '.repeat(TITLE_SOURCE_MAX_CHARACTERS * 2),
          },
          {
            id: 'attachment-2',
            type: 'document',
            fileName: 'second.pdf',
            textContent: 'B'.repeat(TITLE_SOURCE_MAX_CHARACTERS * 2),
          },
        ],
      }),
    )

    expect(content.startsWith('fallback.pdf')).toBe(true)
    expect(content.length).toBeLessThanOrEqual(TITLE_SOURCE_MAX_CHARACTERS)
  })
})
