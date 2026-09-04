import {
  getAutoModels,
  getReasoningHistoryPolicy,
  getResolvedModelContextWindowTokens,
  type BaseModel,
} from '@/config/models'
import {
  REASONING_HISTORY_POLICIES,
  type ReasoningHistoryPolicy,
} from '@/utils/reasoning-history'
import { describe, expect, it } from 'vitest'

const model = (
  modelName: string,
  policy?: ReasoningHistoryPolicy,
  contextWindowTokens?: number,
): BaseModel => ({
  modelName,
  image: '',
  name: modelName,
  nameShort: modelName,
  description: '',
  type: 'chat',
  chat: true,
  chatConfig: {
    contextWindowTokens,
    reasoningConfig: policy ? { reasoningHistoryPolicy: policy } : undefined,
  },
})

describe('getReasoningHistoryPolicy', () => {
  it('uses the direct model policy with a safe default', () => {
    expect(getReasoningHistoryPolicy({ model: model('standard') })).toBe(
      REASONING_HISTORY_POLICIES.none,
    )
    expect(
      getReasoningHistoryPolicy({
        model: model('kimi-k3', REASONING_HISTORY_POLICIES.all),
      }),
    ).toBe(REASONING_HISTORY_POLICIES.all)
  })

  it('uses the strongest Auto candidate policy', () => {
    expect(
      getReasoningHistoryPolicy({
        model: model('standard'),
        autoCandidates: [
          model('standard'),
          model('glm', REASONING_HISTORY_POLICIES.toolCallOnly),
          model('kimi-k3', REASONING_HISTORY_POLICIES.all),
        ],
      }),
    ).toBe(REASONING_HISTORY_POLICIES.all)
  })

  it('falls back safely for unknown future policies', () => {
    const futureModel = model('future')
    futureModel.chatConfig = {
      reasoningConfig: { reasoningHistoryPolicy: 'future-policy' as never },
    }

    expect(getReasoningHistoryPolicy({ model: futureModel })).toBe(
      REASONING_HISTORY_POLICIES.none,
    )
  })

  it('uses the smallest Auto candidate context window', () => {
    const candidates = [
      model('large', undefined, 256000),
      model('small', undefined, 32000),
    ]
    candidates.forEach((candidate) => {
      candidate.chatConfig = { ...candidate.chatConfig, attributes: ['smart'] }
    })

    expect(
      getResolvedModelContextWindowTokens({
        model: candidates[0],
        autoCandidates: candidates,
      }),
    ).toBe(32000)
    expect(getAutoModels(candidates)[0].chatConfig?.contextWindowTokens).toBe(
      32000,
    )
  })
})
