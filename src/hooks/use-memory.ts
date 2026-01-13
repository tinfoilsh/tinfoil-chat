import type { Message } from '@/components/chat/types'
import { extractFacts, mergeFacts } from '@/services/memory/fact-extractor'
import type { Fact, MemoryCallbacks, MemoryState } from '@/types/memory'
import { logError, logInfo } from '@/utils/error-handling'
import { useCallback, useRef, useState } from 'react'

interface UseMemoryParams {
  callbacks: MemoryCallbacks
  enabled?: boolean
}

interface UseMemoryReturn {
  memory: MemoryState
  isProcessing: boolean
  processMessages: (messages: Message[]) => Promise<void>
  loadMemory: () => Promise<void>
  formatMemoryForContext: () => string
}

const EMPTY_MEMORY: MemoryState = {
  facts: [],
  lastProcessedTimestamp: null,
}

export function useMemory({
  callbacks,
  enabled = true,
}: UseMemoryParams): UseMemoryReturn {
  const [memory, setMemory] = useState<MemoryState>(EMPTY_MEMORY)
  const [isProcessing, setIsProcessing] = useState(false)
  const processingRef = useRef(false)

  const loadMemory = useCallback(async () => {
    try {
      const loaded = await callbacks.onLoad()
      setMemory(loaded)
    } catch (error) {
      logError('Failed to load memory', error, {
        component: 'useMemory',
        action: 'loadMemory',
      })
    }
  }, [callbacks])

  const processMessages = useCallback(
    async (messages: Message[]) => {
      if (!enabled || processingRef.current) return

      processingRef.current = true
      setIsProcessing(true)

      try {
        const result = await extractFacts({
          currentMemory: memory,
          messages,
        })

        if (result.facts.length > 0) {
          const mergedFacts = mergeFacts(memory.facts, result.facts)

          const userMessages = messages.filter((m) => m.role === 'user')
          const latestTimestamp =
            userMessages.length > 0
              ? userMessages
                  .map((m) => m.timestamp)
                  .sort((a, b) => b.getTime() - a.getTime())[0]
              : null

          const newMemory: MemoryState = {
            facts: mergedFacts,
            lastProcessedTimestamp:
              latestTimestamp?.toISOString() || memory.lastProcessedTimestamp,
          }

          await callbacks.onSave(newMemory)
          setMemory(newMemory)

          logInfo('Memory updated with new facts', {
            component: 'useMemory',
            action: 'processMessages',
            metadata: {
              newFactsCount: result.facts.length,
              totalFactsCount: mergedFacts.length,
            },
          })
        }
      } catch (error) {
        logError('Failed to process messages for memory', error, {
          component: 'useMemory',
          action: 'processMessages',
        })
      } finally {
        processingRef.current = false
        setIsProcessing(false)
      }
    },
    [enabled, memory, callbacks],
  )

  const formatMemoryForContext = useCallback((): string => {
    if (memory.facts.length === 0) return ''

    const byCategory = memory.facts.reduce(
      (acc, fact) => {
        if (!acc[fact.category]) acc[fact.category] = []
        acc[fact.category].push(fact)
        return acc
      },
      {} as Record<string, Fact[]>,
    )

    let output = ''
    for (const [category, facts] of Object.entries(byCategory)) {
      output += `**${category}**\n`
      for (const fact of facts) {
        output += `- ${fact.fact}\n`
      }
      output += '\n'
    }
    return output.trim()
  }, [memory.facts])

  return {
    memory,
    isProcessing,
    processMessages,
    loadMemory,
    formatMemoryForContext,
  }
}
