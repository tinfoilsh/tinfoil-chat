/**
 * Memory types for the factoid-based memory system
 * Extracts and stores discrete facts/preferences from user messages
 */

export interface Fact {
  id: string // unique identifier
  fact: string
  date: string // ISO timestamp
  category: string // LLM-determined category
  confidence: number // 0-1 confidence score
}

export type FactOperation =
  | { action: 'add'; fact: Omit<Fact, 'id'> }
  | {
      action: 'update'
      factId: string
      updates: Partial<Pick<Fact, 'fact' | 'category' | 'confidence'>>
    }
  | { action: 'delete'; factId: string; reason: string }

export interface MemoryState {
  facts: Fact[]
  lastProcessedTimestamp: string | null
}

export interface MemoryCallbacks {
  onSave: (memory: MemoryState) => Promise<void>
  onLoad: () => Promise<MemoryState>
}

export interface ExtractFactsResult {
  operations: FactOperation[]
  processedCount: number
}

export const FACT_OPERATIONS_SCHEMA = {
  type: 'object',
  properties: {
    operations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['add', 'update', 'delete'] },
          fact: {
            type: 'object',
            properties: {
              fact: { type: 'string' },
              date: { type: 'string' },
              category: { type: 'string' },
              confidence: { type: 'number' },
            },
            required: ['fact', 'date', 'category', 'confidence'],
          },
          factId: { type: 'string' },
          updates: {
            type: 'object',
            properties: {
              fact: { type: 'string' },
              category: { type: 'string' },
              confidence: { type: 'number' },
            },
          },
          reason: { type: 'string' },
        },
        required: ['action'],
      },
    },
  },
  required: ['operations'],
}

export const MAX_FACTS = 500
export const MIN_WORD_COUNT = 5
