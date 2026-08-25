import { parseRichStreamingResponse } from '@/components/chat/hooks/streaming'
import type { AguiEvent } from '@/services/inference/agui/protocol'
import { describe, expect, it, vi } from 'vitest'

function run(events: AguiEvent[]): AsyncGenerator<AguiEvent> {
  return (async function* () {
    yield { type: 'RUN_STARTED', threadId: 't', runId: 'r' }
    yield* events
    yield { type: 'RUN_FINISHED' }
  })()
}

function unfinished(events: AguiEvent[]): AsyncGenerator<AguiEvent> {
  return (async function* () {
    yield* events
  })()
}

function search(id: string, query: string): AguiEvent[] {
  return [
    { type: 'TOOL_CALL_START', toolCallId: id, toolCallName: 'web_search' },
    {
      type: 'TOOL_CALL_ARGS',
      toolCallId: id,
      delta: JSON.stringify({ query }),
    },
    { type: 'TOOL_CALL_END', toolCallId: id },
  ]
}

function searchResult(id: string, url: string): AguiEvent {
  return {
    type: 'TOOL_CALL_RESULT',
    toolCallId: id,
    content: JSON.stringify({ results: [{ url, title: url }] }),
  }
}

describe('parseRichStreamingResponse', () => {
  it('rejects a run that ended before it finished', async () => {
    await expect(
      parseRichStreamingResponse(
        unfinished([
          { type: 'TEXT_MESSAGE_CHUNK', messageId: 'm', delta: 'partial' },
        ]),
      ),
    ).rejects.toThrow('Chat response ended before its completion marker')
  })

  it('ends the initial wait when the first tool call opens', async () => {
    const onFirstEvent = vi.fn()
    await parseRichStreamingResponse(run(search('c1', 'amd root ca')), {
      onFirstEvent,
    })

    expect(onFirstEvent).toHaveBeenCalledOnce()
  })

  it('reconstructs reasoning, content, and widget calls', async () => {
    const message = await parseRichStreamingResponse(
      run([
        {
          type: 'REASONING_MESSAGE_CHUNK',
          messageId: 'm',
          delta: 'Check sources. ',
        },
        { type: 'TEXT_MESSAGE_CHUNK', messageId: 'm', delta: 'Final answer.' },
        {
          type: 'TOOL_CALL_START',
          toolCallId: 'call-1',
          toolCallName: 'render_card',
        },
        { type: 'TOOL_CALL_ARGS', toolCallId: 'call-1', delta: '{"x":' },
        { type: 'TOOL_CALL_ARGS', toolCallId: 'call-1', delta: '1}' },
        { type: 'TOOL_CALL_END', toolCallId: 'call-1' },
      ]),
    )

    expect(message.content).toBe('Final answer.')
    expect(message.thoughts).toBe('Check sources. ')
    expect(message.toolCalls).toEqual([
      { id: 'call-1', name: 'render_card', arguments: '{"x":1}' },
    ])
    expect(message.timeline?.map((block) => block.type)).toEqual([
      'thinking',
      'content',
      'tool_call',
    ])
  })

  it('keeps concurrent searches distinct', async () => {
    const message = await parseRichStreamingResponse(
      run([...search('c1', 'first query'), ...search('c2', 'second query')]),
    )

    expect(
      message.timeline
        ?.filter((block) => block.type === 'web_search')
        .map((block) => block.state.query),
    ).toEqual(['first query', 'second query'])
  })

  it('completes interleaved searches by call id', async () => {
    const message = await parseRichStreamingResponse(
      run([
        ...search('c1', 'first query'),
        ...search('c2', 'second query'),
        searchResult('c1', 'https://example.com'),
      ]),
    )

    expect(
      message.timeline
        ?.filter((block) => block.type === 'web_search')
        .map((block) => block.state),
    ).toEqual([
      expect.objectContaining({ query: 'first query', status: 'completed' }),
      expect.objectContaining({ query: 'second query', status: 'searching' }),
    ])
  })

  it('ends thinking callbacks when the run fails mid-stream', async () => {
    const response = (async function* (): AsyncGenerator<AguiEvent> {
      yield {
        type: 'REASONING_MESSAGE_CHUNK',
        messageId: 'm',
        delta: 'thinking',
      }
      throw new Error('stream failed')
    })()
    const thinkingChanges: boolean[] = []

    await expect(
      parseRichStreamingResponse(response, {
        onThinkingChange: (thinking) => thinkingChanges.push(thinking),
      }),
    ).rejects.toThrow('stream failed')
    expect(thinkingChanges).toEqual([true, false])
  })
})
