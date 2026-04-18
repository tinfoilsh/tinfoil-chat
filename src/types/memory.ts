/**
 * Memory types for the factoid-based memory system
 * Extracts and stores discrete facts/preferences from user messages
 */
import { z } from 'zod'

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

const factAddSchema = z.object({
  action: z.literal('add'),
  fact: z.object({
    fact: z.string(),
    date: z.string(),
    category: z.string(),
    confidence: z.number(),
  }),
})

const factUpdateSchema = z.object({
  action: z.literal('update'),
  factId: z.string(),
  updates: z.object({
    fact: z.string().optional(),
    category: z.string().optional(),
    confidence: z.number().optional(),
  }),
})

const factDeleteSchema = z.object({
  action: z.literal('delete'),
  factId: z.string(),
  reason: z.string(),
})

export const FACT_OPERATIONS_SCHEMA = z.object({
  operations: z.array(
    z.discriminatedUnion('action', [
      factAddSchema,
      factUpdateSchema,
      factDeleteSchema,
    ]),
  ),
})

export type FactOperationsPayload = z.infer<typeof FACT_OPERATIONS_SCHEMA>

export const MAX_FACTS = 500
export const MIN_WORD_COUNT = 5
