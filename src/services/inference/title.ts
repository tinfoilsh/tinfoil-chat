import { CONSTANTS } from '@/components/chat/constants'
import { logError } from '@/utils/error-handling'
import { summarize } from './summary-client'

export async function generateTitle(
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  if (!messages || messages.length === 0) return 'Untitled'

  try {
    const userMessage = messages.find((msg) => msg.role === 'user')
    if (!userMessage?.content) return 'Untitled'

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
    return 'Untitled'
  } catch (error) {
    logError('Failed to generate title', error, {
      component: 'title',
      action: 'generateTitle',
    })
    return 'Untitled'
  }
}
