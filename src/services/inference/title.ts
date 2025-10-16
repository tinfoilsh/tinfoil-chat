import { CONSTANTS } from '@/components/chat/constants'
import { getTinfoilClient } from './tinfoil-client'

export async function generateTitle(
  messages: Array<{ role: string; content: string }>,
  apiKey?: string | null,
  freeModelName?: string,
  freeModelEndpoint?: string,
): Promise<string> {
  if (!messages || messages.length === 0) return 'New Chat'
  if (!freeModelName || !apiKey) return 'New Chat'

  try {
    const conversationForTitle = messages
      .slice(0, Math.min(4, messages.length))
      .map((msg) => `${msg.role.toUpperCase()}: ${msg.content.slice(0, 500)}`)
      .join('\n\n')

    const client = getTinfoilClient(apiKey)

    const completion = await client.chat.completions.create({
      model: freeModelName,
      messages: [
        { role: 'system', content: CONSTANTS.TITLE_GENERATION_PROMPT },
        {
          role: 'user',
          content: `Generate a title for this conversation:\n\n${conversationForTitle}`,
        },
      ],
      stream: false,
      max_tokens: 30,
    })

    const title = completion.choices?.[0]?.message?.content?.trim() || ''
    const cleanTitle = title.replace(/^["']|["']$/g, '').trim()
    if (cleanTitle && cleanTitle.length > 0 && cleanTitle.length <= 50) {
      return cleanTitle
    }
    return 'New Chat'
  } catch {
    return 'New Chat'
  }
}
