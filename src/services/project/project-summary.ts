import { logError, logInfo } from '@/utils/error-handling'

const SUMMARY_UPDATE_PROMPT = `You are maintaining a rolling summary of a project's conversation history.

Current summary:
{CURRENT_SUMMARY}

Latest exchange:
User: {USER_MESSAGE}
Assistant: {ASSISTANT_RESPONSE}

Update the summary to incorporate any new important information from this exchange.
Keep it concise (3-5 sentences max). Focus on:
- Key decisions made
- Important facts/context established
- Outstanding questions or next steps

Return only the updated summary text, nothing else.`

interface UpdateSummaryParams {
  currentSummary: string
  userMessage: string
  assistantResponse: string
  getToken: () => Promise<string | null>
}

export async function updateProjectSummary({
  currentSummary,
  userMessage,
  assistantResponse,
  getToken,
}: UpdateSummaryParams): Promise<string | null> {
  try {
    const token = await getToken()
    if (!token) {
      logError(
        'No auth token available for summary update',
        new Error('No token'),
        {
          component: 'ProjectSummary',
          action: 'updateProjectSummary',
        },
      )
      return null
    }

    const prompt = SUMMARY_UPDATE_PROMPT.replace(
      '{CURRENT_SUMMARY}',
      currentSummary || '(No previous summary)',
    )
      .replace('{USER_MESSAGE}', userMessage.slice(0, 2000))
      .replace('{ASSISTANT_RESPONSE}', assistantResponse.slice(0, 2000))

    const { sendChatStream } = await import(
      '@/services/inference/inference-client'
    )
    const { getAIModels } = await import('@/config/models')

    const models = await getAIModels(true)
    const summaryModel = models.find((m) => m.type === 'title') || models[0]

    if (!summaryModel) {
      logError('No model available for summary update', new Error('No model'), {
        component: 'ProjectSummary',
        action: 'updateProjectSummary',
      })
      return null
    }

    const messages = [
      {
        role: 'user' as const,
        content: prompt,
        timestamp: new Date(),
      },
    ]

    const controller = new AbortController()
    const response = await sendChatStream({
      model: summaryModel,
      systemPrompt:
        'You are a helpful assistant that summarizes conversations.',
      rules: '',
      updatedMessages: messages,
      maxMessages: 1,
      signal: controller.signal,
    })

    if (!response.ok || !response.body) {
      throw new Error('Failed to get summary response')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let summary = ''
    let sseBuffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      sseBuffer += chunk
      const lines = sseBuffer.split(/\r?\n/)
      sseBuffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content
            if (content) {
              summary += content
            }
          } catch {
            // Ignore parse errors for partial chunks
          }
        }
      }
    }

    logInfo('Project summary updated', {
      component: 'ProjectSummary',
      action: 'updateProjectSummary',
      metadata: { summaryLength: summary.length },
    })

    return summary.trim()
  } catch (error) {
    logError('Failed to update project summary', error, {
      component: 'ProjectSummary',
      action: 'updateProjectSummary',
    })
    return null
  }
}
