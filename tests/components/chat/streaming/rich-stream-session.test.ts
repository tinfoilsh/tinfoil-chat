import { RichStreamSession } from '@/components/chat/hooks/streaming/rich-stream-session'
import type { AguiEvent } from '@/services/inference/agui/protocol'
import { describe, expect, it, vi } from 'vitest'

function run(
  events: AguiEvent[],
  options?: ConstructorParameters<typeof RichStreamSession>[0],
): RichStreamSession {
  const session = new RichStreamSession(options)
  session.processEvent({ type: 'RUN_STARTED', threadId: 't', runId: 'r' })
  for (const event of events) session.processEvent(event)
  session.processEvent({ type: 'RUN_FINISHED' })
  return session
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

describe('RichStreamSession', () => {
  it('rejects a run that ended before it finished', () => {
    const session = new RichStreamSession()
    session.processEvent({
      type: 'TEXT_MESSAGE_CHUNK',
      messageId: 'm',
      delta: 'partial',
    })

    expect(() => session.complete()).toThrow(
      'Chat response ended before its completion marker',
    )
  })

  it('ends the initial wait when the first tool call opens', () => {
    const onFirstEvent = vi.fn()
    run(search('c1', 'amd root ca'), { onFirstEvent })

    expect(onFirstEvent).toHaveBeenCalledOnce()
  })

  it('reconstructs reasoning, content, and widget calls', () => {
    const message = run([
      {
        type: 'REASONING_MESSAGE_CHUNK',
        messageId: 'm',
        delta: 'Check sources. ',
      },
      { type: 'TEXT_MESSAGE_CHUNK', messageId: 'm', delta: 'Final answer.' },
      {
        type: 'TOOL_CALL_START',
        toolCallId: 'call-1',
        toolCallName: 'render_chart',
      },
      { type: 'TOOL_CALL_ARGS', toolCallId: 'call-1', delta: '{"x":' },
      { type: 'TOOL_CALL_ARGS', toolCallId: 'call-1', delta: '1}' },
      { type: 'TOOL_CALL_END', toolCallId: 'call-1' },
    ]).complete()

    expect(message.content).toBe('Final answer.')
    expect(message.thoughts).toBe('Check sources. ')
    expect(message.toolCalls).toEqual([
      { id: 'call-1', name: 'render_chart', arguments: '{"x":1}' },
    ])
    expect(message.timeline?.map((block) => block.type)).toEqual([
      'thinking',
      'content',
      'tool_call',
    ])
  })

  it('keeps concurrent searches distinct', () => {
    const message = run([
      ...search('c1', 'first query'),
      ...search('c2', 'second query'),
    ]).complete()

    expect(
      message.timeline
        ?.filter((block) => block.type === 'web_search')
        .map((block) => block.state.query),
    ).toEqual(['first query', 'second query'])
  })

  it('completes interleaved searches by call id', () => {
    const message = run([
      ...search('c1', 'first query'),
      ...search('c2', 'second query'),
      searchResult('c1', 'https://example.com'),
    ]).complete()

    expect(
      message.timeline
        ?.filter((block) => block.type === 'web_search')
        .map((block) => block.state),
    ).toEqual([
      expect.objectContaining({ query: 'first query', status: 'completed' }),
      expect.objectContaining({ query: 'second query', status: 'searching' }),
    ])
  })

  it('ends thinking callbacks when a run is closed mid-thought', () => {
    const thinkingChanges: boolean[] = []
    const session = new RichStreamSession({
      onThinkingChange: (thinking) => thinkingChanges.push(thinking),
    })
    session.processEvent({
      type: 'REASONING_MESSAGE_CHUNK',
      messageId: 'm',
      delta: 'thinking',
    })

    session.close()

    expect(thinkingChanges).toEqual([true, false])
  })
})
