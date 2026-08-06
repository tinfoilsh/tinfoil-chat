import { CONSTANTS } from '@/components/chat/constants'
import type { Message } from '@/components/chat/types'
import { DEFAULT_CHAT_TITLE } from '@/constants/chat'
import { logError } from '@/utils/error-handling'
import { summarize } from './summary-client'

export function getTitleContent(
  message: Pick<Message, 'content' | 'attachments'>,
): string {
  return (
    message.content?.trim() ||
    (message.attachments
      ?.map(
        (attachment) =>
          attachment.textContent?.trim() ||
          attachment.description?.trim() ||
          attachment.fileName.trim(),
      )
      .filter(Boolean)
      .join('\n') ??
      '')
  )
}

export async function generateTitle(
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  if (!messages || messages.length === 0) return DEFAULT_CHAT_TITLE

  try {
    const userMessage = messages.find((msg) => msg.role === 'user')
    if (!userMessage?.content) return DEFAULT_CHAT_TITLE

    const words = userMessage.content.split(/\s+/)
    const truncatedContent = words
      .slice(0, CONSTANTS.TITLE_GENERATION_WORD_THRESHOLD)
      .join(' ')

    const title = await summarize({
      content: truncatedContent,
      style: 'title_summary',
    })

    const cleanTitle = title.replace(/^["']|["']$/g, '').trim()
    if (cleanTitle && cleanTitle.length > 0 && cleanTitle.length <= 50) {
      return cleanTitle
    }
    return DEFAULT_CHAT_TITLE
  } catch (error) {
    logError('Failed to generate title', error, {
      component: 'title',
      action: 'generateTitle',
    })
    return DEFAULT_CHAT_TITLE
  }
}
