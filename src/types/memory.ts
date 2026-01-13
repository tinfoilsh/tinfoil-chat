/**
 * Memory types for the factoid-based memory system
 * Extracts and stores discrete facts/preferences from user messages
 */

export interface Fact {
  fact: string
  date: string // ISO timestamp
  category: string // LLM-determined category
  confidence: number // 0-1 confidence score
}

export interface MemoryState {
  facts: Fact[]
  lastProcessedTimestamp: string | null
}

export interface MemoryCallbacks {
  onSave: (memory: MemoryState) => Promise<void>
  onLoad: () => Promise<MemoryState>
}

export interface ExtractFactsResult {
  facts: Fact[]
  processedCount: number
}

export const FACT_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fact: { type: 'string' },
          date: { type: 'string' },
          category: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['fact', 'date', 'category', 'confidence'],
      },
    },
  },
  required: ['facts'],
}

export const MAX_FACTS = 500
export const MIN_WORD_COUNT = 5
