import { logError, logInfo } from '@/utils/error-handling'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

interface UpdateSummaryParams {
  currentSummary: string
  chatHistory: ChatMessage[]
  getToken: () => Promise<string | null>
}

function formatChatHistory(chatHistory: ChatMessage[]): string {
  return chatHistory
    .map(
      (msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`,
    )
    .join('\n\n')
}

export async function updateProjectSummary({
  currentSummary,
  chatHistory,
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

    const { sendChatStream } = await import(
      '@/services/inference/inference-client'
    )
    const { getAIModels, getMemoryPrompt } = await import('@/config/models')

    const memoryPromptTemplate = await getMemoryPrompt()
    if (!memoryPromptTemplate) {
      logError('No memory prompt available', new Error('No memory prompt'), {
        component: 'ProjectSummary',
        action: 'updateProjectSummary',
      })
      return null
    }

    const formattedHistory = formatChatHistory(chatHistory)
    const replacements: Record<string, string> = {
      '{CURRENT_SUMMARY}': currentSummary || '(No previous memory)',
      '{CHAT_HISTORY}': formattedHistory,
    }
    const prompt = memoryPromptTemplate.replace(
      /\{CURRENT_SUMMARY\}|\{CHAT_HISTORY\}/g,
      (match) => replacements[match],
    )

    const models = await getAIModels(true)
    const summaryModel = models.find((m) => m.paid === false) || models[0]

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

    if (sseBuffer.startsWith('data: ')) {
      const data = sseBuffer.slice(6)
      if (data !== '[DONE]') {
        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content
          if (content) {
            summary += content
          }
        } catch {
          // Ignore parse errors
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
