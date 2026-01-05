import { CONSTANTS } from '@/components/chat/constants'
import { logError } from '@/utils/error-handling'
import { getTinfoilClient } from './tinfoil-client'

export async function generateTitle(
  messages: Array<{ role: string; content: string }>,
  titleModelName?: string,
): Promise<string> {
  if (!messages || messages.length === 0) return 'Untitled'
  if (!titleModelName) return 'Untitled'

  try {
    const assistantMessage = messages.find((msg) => msg.role === 'assistant')
    if (!assistantMessage?.content) return 'Untitled'

    const words = assistantMessage.content.split(/\s+/)
    const truncatedContent = words.slice(0, 500).join(' ')

    const client = await getTinfoilClient()

    const completion = await client.chat.completions.create({
      model: titleModelName,
      messages: [
        { role: 'system', content: CONSTANTS.TITLE_GENERATION_PROMPT },
        {
          role: 'user',
          content: truncatedContent,
        },
      ],
      stream: false,
      max_tokens: 50,
    })

    const title = completion.choices?.[0]?.message?.content?.trim() || ''
    const cleanTitle = title.replace(/^["']|["']$/g, '').trim()
    if (cleanTitle && cleanTitle.length > 0 && cleanTitle.length <= 50) {
      return cleanTitle
    }
    return 'Untitled'
  } catch (error) {
    logError('Failed to generate title', error, {
      component: 'title',
      action: 'generateTitle',
      metadata: {
        modelName: titleModelName,
      },
    })
    return 'Untitled'
  }
}
