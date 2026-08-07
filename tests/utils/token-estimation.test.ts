import type { Message } from '@/components/chat/types'
import {
  CONTEXT_BUDGET,
  RequestContextLimitError,
  estimateMessageTokens,
  estimateTokenCount,
  findContextStartIndex,
  getContextTokenBudget,
  getMinimumContextWindowTokens,
  parseContextWindowTokens,
  planRequestContext,
  selectMessagesForRequest,
  selectMessagesWithinBudget,
} from '@/utils/token-estimation'
import { describe, expect, it } from 'vitest'

function makeMessage(role: 'user' | 'assistant', tokenCount: number): Message {
  return {
    role,
    content: 'a'.repeat(tokenCount * CONTEXT_BUDGET.charsPerToken),
    timestamp: new Date(),
  }
}

const baseBudget = {
  contextWindows: ['64k tokens'],
  systemInstructions: '',
  isMultimodal: false,
}

describe('token estimation', () => {
  it('estimates roughly four characters per token', () => {
    expect(estimateTokenCount('a'.repeat(400))).toBe(100)
    expect(estimateTokenCount('abc')).toBe(1)
    expect(estimateTokenCount(undefined)).toBe(0)
  })

  it('counts persisted message content without thoughts', () => {
    const message: Message = {
      role: 'user',
      content: 'a'.repeat(40),
      thoughts: 'b'.repeat(40),
      quote: 'c'.repeat(40),
      attachments: [
        {
          id: 'document',
          type: 'document',
          fileName: 'doc.txt',
          textContent: 'd'.repeat(40),
        },
      ],
      timestamp: new Date(),
    }
    expect(estimateMessageTokens(message)).toBe(30)
  })
})

describe('request context budgeting', () => {
  it.each([
    ['32k tokens', 32000],
    ['64k tokens', 64000],
    ['128k tokens', 128000],
  ])(
    'preserves a conservative margin at the %s boundary',
    (window, expected) => {
      const safeLimit = Math.floor(
        expected * CONTEXT_BUDGET.contextWindowUsageRatio,
      )
      const payloadLimit =
        safeLimit -
        CONTEXT_BUDGET.outputReserveTokens -
        CONTEXT_BUDGET.requestOverheadTokens -
        CONTEXT_BUDGET.messageOverheadTokens
      const budget = {
        ...baseBudget,
        contextWindows: [window],
      }
      const plan = planRequestContext(
        [makeMessage('user', payloadLimit)],
        budget,
      )
      expect(plan.limitTokens).toBe(safeLimit)
      expect(plan.usedTokens).toBe(safeLimit)
      expect(() =>
        selectMessagesForRequest(
          [makeMessage('user', payloadLimit + 1)],
          budget,
        ),
      ).toThrow(RequestContextLimitError)
    },
  )

  it('uses the smallest window among mixed Auto candidates', () => {
    expect(
      getMinimumContextWindowTokens([
        '128k tokens',
        '32k tokens',
        '64k tokens',
      ]),
    ).toBe(32000)
  })

  it('deducts large system and project context before selecting history', () => {
    const messages = [
      makeMessage('user', 10000),
      makeMessage('assistant', 10000),
      makeMessage('user', 10000),
    ]
    const plan = planRequestContext(messages, {
      ...baseBudget,
      contextWindows: ['32k tokens'],
      systemInstructions: 's'.repeat(20000),
    })
    expect(plan.startIndex).toBe(2)
    expect(plan.fixedTokens).toBeGreaterThan(CONTEXT_BUDGET.outputReserveTokens)
  })

  it('deducts GenUI tool schemas and the time reminder', () => {
    const withoutTools = planRequestContext([], baseBudget)
    const withTools = planRequestContext([], {
      ...baseBudget,
      toolDefinitions: JSON.stringify({ tools: 'x'.repeat(16000) }),
      timeReminder: '<system-reminder>time</system-reminder>',
    })
    expect(withTools.availableTokens).toBeLessThan(withoutTools.availableTokens)
  })

  it('reserves context for router-provided tools', () => {
    const withoutRouterTools = planRequestContext([], baseBudget)
    const withRouterTools = planRequestContext([], {
      ...baseBudget,
      additionalToolCount: 2,
    })

    expect(
      withoutRouterTools.availableTokens - withRouterTools.availableTokens,
    ).toBe(CONTEXT_BUDGET.routerToolAllowanceTokens * 2)
  })

  it('keeps complete recent turns and assistant tool-call result groups', () => {
    const messages = [
      makeMessage('user', 14000),
      makeMessage('assistant', 14000),
      makeMessage('user', 100),
      {
        ...makeMessage('assistant', 100),
        toolCalls: [
          { id: 'call_1', name: 'render_chart', arguments: '{"value":1}' },
        ],
      },
    ]
    const selected = selectMessagesForRequest(messages, {
      ...baseBudget,
      contextWindows: ['32k tokens'],
    })
    expect(selected).toEqual(messages.slice(2))
  })

  it('throws a typed error instead of sending an oversized newest turn', () => {
    const oversized = [makeMessage('user', 30000)]
    expect(() =>
      selectMessagesForRequest(oversized, {
        ...baseBudget,
        contextWindows: ['32k tokens'],
      }),
    ).toThrow(RequestContextLimitError)
  })

  it('accounts for a conservative multimodal image allowance', () => {
    const imageMessage: Message = {
      role: 'user',
      content: 'describe this',
      attachments: [
        {
          id: 'image',
          type: 'image',
          fileName: 'image.png',
          mimeType: 'image/png',
          base64: 'data',
        },
      ],
      timestamp: new Date(),
    }
    const textPlan = planRequestContext([imageMessage], baseBudget)
    const imagePlan = planRequestContext([imageMessage], {
      ...baseBudget,
      isMultimodal: true,
    })
    expect(imagePlan.usedTokens - textPlan.usedTokens).toBe(
      CONTEXT_BUDGET.imageInputAllowanceTokens,
    )
  })
})

describe('parseContextWindowTokens', () => {
  it('parses reported windows and falls back for malformed values', () => {
    expect(parseContextWindowTokens('64k tokens')).toBe(64000)
    expect(parseContextWindowTokens('128K tokens')).toBe(128000)
    expect(parseContextWindowTokens('unknown')).toBe(64000)
  })
})

describe('legacy history helpers', () => {
  it('keeps the conservative context budget used by fallback views', () => {
    expect(getContextTokenBudget('100k tokens')).toBe(
      90000 -
        CONTEXT_BUDGET.outputReserveTokens -
        CONTEXT_BUDGET.requestOverheadTokens,
    )
  })

  it('archives oldest messages and keeps the latest substantive message', () => {
    const messages = [
      makeMessage('user', 100),
      makeMessage('assistant', 100),
      makeMessage('user', 100),
    ]

    expect(findContextStartIndex(messages, 250)).toBe(1)
    expect(findContextStartIndex([makeMessage('user', 1000)], 10)).toBe(0)
  })

  it('selects the newest fallback history within the safe model budget', () => {
    const messages = [
      makeMessage('user', 400),
      makeMessage('assistant', 400),
      makeMessage('user', 400),
    ]

    expect(selectMessagesWithinBudget(messages, '1k tokens')).toEqual([
      messages[2],
    ])
  })
})
