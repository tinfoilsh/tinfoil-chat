import {
  getResolvedModelContextWindow,
  requiresCompleteReasoningHistory,
  type BaseModel,
} from '@/config/models'
import { describe, expect, it } from 'vitest'

const model = (
  modelName: string,
  requiresHistory = false,
  contextWindow?: string,
): BaseModel => ({
  modelName,
  image: '',
  name: modelName,
  nameShort: modelName,
  description: '',
  type: 'chat',
  chat: true,
  contextWindow,
  reasoningConfig: requiresHistory
    ? { requiresCompleteReasoningHistory: true }
    : undefined,
})

describe('requiresCompleteReasoningHistory', () => {
  it('uses the direct model capability', () => {
    expect(requiresCompleteReasoningHistory({ model: model('standard') })).toBe(
      false,
    )
    expect(
      requiresCompleteReasoningHistory({ model: model('kimi-k3', true) }),
    ).toBe(true)
  })

  it('requires history when any Auto candidate requires it', () => {
    expect(
      requiresCompleteReasoningHistory({
        model: model('standard'),
        autoCandidates: [model('standard'), model('kimi-k3', true)],
      }),
    ).toBe(true)
  })

  it('uses the smallest Auto candidate context window', () => {
    expect(
      getResolvedModelContextWindow({
        model: model('large', false, '256k tokens'),
        autoCandidates: [
          model('large', false, '256k tokens'),
          model('small', false, '128k tokens'),
        ],
      }),
    ).toBe('128k tokens')
  })
})
