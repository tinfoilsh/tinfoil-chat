import type { Message } from '@/components/chat/types'
import { getAIModels, getMemoryPrompt } from '@/config/models'
import { sendStructuredCompletion } from '@/services/inference/inference-client'
import type { ExtractFactsResult, Fact, MemoryState } from '@/types/memory'
import {
  FACT_EXTRACTION_SCHEMA,
  MAX_FACTS,
  MIN_WORD_COUNT,
} from '@/types/memory'
import { logError, logInfo } from '@/utils/error-handling'

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function formatFacts(facts: Fact[]): string {
  if (facts.length === 0) return '(No previous facts)'
  return facts
    .map(
      (f) =>
        `- [${f.category}] ${f.fact} (confidence: ${f.confidence}, date: ${f.date})`,
    )
    .join('\n')
}

function formatMessages(
  messages: Array<{ content: string; timestamp: string }>,
): string {
  return messages.map((m) => `[${m.timestamp}] User: ${m.content}`).join('\n\n')
}

export async function extractFacts(params: {
  currentMemory: MemoryState
  messages: Message[]
  signal?: AbortSignal
}): Promise<ExtractFactsResult> {
  const { currentMemory, messages, signal } = params

  logInfo('Starting fact extraction', {
    component: 'FactExtractor',
    action: 'extractFacts',
    metadata: {
      totalMessages: messages.length,
      currentFactsCount: currentMemory.facts.length,
      lastProcessedTimestamp: currentMemory.lastProcessedTimestamp,
    },
  })

  const lastProcessed = currentMemory.lastProcessedTimestamp
    ? new Date(currentMemory.lastProcessedTimestamp)
    : null

  const newMessages = messages.filter((msg) => {
    if (msg.role !== 'user') return false
    if (countWords(msg.content || '') < MIN_WORD_COUNT) return false
    if (lastProcessed && msg.timestamp <= lastProcessed) return false
    return true
  })

  logInfo('Filtered messages for extraction', {
    component: 'FactExtractor',
    action: 'extractFacts',
    metadata: {
      newMessagesCount: newMessages.length,
      userMessagesTotal: messages.filter((m) => m.role === 'user').length,
    },
  })

  if (newMessages.length === 0) {
    return { facts: [], processedCount: 0 }
  }

  const models = await getAIModels(true)
  const freeModel = models.find((m) => m.paid === false) || models[0]
  if (!freeModel) {
    logError('No model available for fact extraction', new Error('No model'), {
      component: 'FactExtractor',
      action: 'extractFacts',
      metadata: { modelsCount: models.length },
    })
    return { facts: [], processedCount: 0 }
  }

  logInfo('Using model for fact extraction', {
    component: 'FactExtractor',
    action: 'extractFacts',
    metadata: { modelName: freeModel.modelName },
  })

  const promptTemplate = await getMemoryPrompt()
  if (!promptTemplate) {
    logError(
      'No memory prompt template available',
      new Error('No prompt template'),
      {
        component: 'FactExtractor',
        action: 'extractFacts',
      },
    )
    return { facts: [], processedCount: 0 }
  }

  logInfo('Got memory prompt template', {
    component: 'FactExtractor',
    action: 'extractFacts',
    metadata: { promptLength: promptTemplate.length },
  })

  const formattedMessages = newMessages.map((m) => ({
    content: m.content || '',
    timestamp: m.timestamp.toISOString(),
  }))

  const prompt = promptTemplate
    .replace('{CURRENT_FACTS}', formatFacts(currentMemory.facts))
    .replace('{NEW_MESSAGES}', formatMessages(formattedMessages))

  try {
    const result = await sendStructuredCompletion<{ facts: Fact[] }>({
      model: freeModel,
      messages: [
        {
          role: 'system',
          content:
            'Extract factoids from user messages. Output valid JSON only.',
        },
        { role: 'user', content: prompt },
      ],
      jsonSchema: FACT_EXTRACTION_SCHEMA,
      signal,
    })

    logInfo('Extracted facts from messages', {
      component: 'FactExtractor',
      action: 'extractFacts',
      metadata: {
        newMessagesCount: newMessages.length,
        extractedFactsCount: result.facts.length,
      },
    })

    return {
      facts: result.facts,
      processedCount: newMessages.length,
    }
  } catch (error) {
    logError('Failed to extract facts', error, {
      component: 'FactExtractor',
      action: 'extractFacts',
    })
    return { facts: [], processedCount: 0 }
  }
}

export function mergeFacts(existing: Fact[], newFacts: Fact[]): Fact[] {
  const merged = [...existing, ...newFacts]

  if (merged.length > MAX_FACTS) {
    merged.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    )
    return merged.slice(0, MAX_FACTS)
  }

  return merged
}
