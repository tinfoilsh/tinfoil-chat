import { toAguiMessages } from '@/services/inference/agui/protocol'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { describe, expect, it } from 'vitest'

describe('toAguiMessages', () => {
  it('carries the history an earlier assistant turn was given', () => {
    // What ChatQueryBuilder.buildMessages attaches to an assistant message so
    // the next turn can answer questions about the previous answer.
    const assistant = {
      role: 'assistant',
      content: 'AMD publishes its root CA there.',
      annotations: [
        {
          type: 'url_citation',
          url_citation: { title: 'AMD', url: 'https://amd.com' },
        },
      ],
      search_reasoning: 'searched amd.com, read the root CA page',
      reasoning_content: 'the question is about the signing chain',
    } as unknown as ChatCompletionMessageParam

    expect(toAguiMessages([assistant])[0]).toMatchObject({
      role: 'assistant',
      annotations: [
        {
          type: 'url_citation',
          url_citation: { title: 'AMD', url: 'https://amd.com' },
        },
      ],
      searchReasoning: 'searched amd.com, read the root CA page',
      reasoningContent: 'the question is about the signing chain',
    })
  })

  it('leaves the extra history off a message that has none', () => {
    const [message] = toAguiMessages([{ role: 'user', content: 'hello' }])

    expect(message.annotations).toBeUndefined()
    expect(message.searchReasoning).toBeUndefined()
    expect(message.reasoningContent).toBeUndefined()
  })
})
