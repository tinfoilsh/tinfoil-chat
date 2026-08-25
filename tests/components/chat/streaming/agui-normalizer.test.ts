import { ChatError } from '@/components/chat/chat-utils'
import { RichStreamSession } from '@/components/chat/hooks/streaming/rich-stream-session'
import { createAguiNormalizer } from '@/services/inference/agui/normalizer'
import type { AguiEvent } from '@/services/inference/agui/protocol'
import { describe, expect, it } from 'vitest'
import liveRun from '../../../fixtures/agui-live-run.json'

function text(messageId: string, delta: string): AguiEvent {
  return { type: 'TEXT_MESSAGE_CHUNK', messageId, delta }
}

function reasoning(messageId: string, delta: string): AguiEvent {
  return { type: 'REASONING_MESSAGE_CHUNK', messageId, delta }
}

function call(id: string, name: string, args: string): AguiEvent[] {
  return [
    { type: 'TOOL_CALL_START', toolCallId: id, toolCallName: name },
    { type: 'TOOL_CALL_ARGS', toolCallId: id, delta: args },
    { type: 'TOOL_CALL_END', toolCallId: id },
  ]
}

function normalize(events: AguiEvent[]) {
  const normalizer = createAguiNormalizer()
  return events.flatMap((event) => normalizer.processEvent(event))
}

describe('agui normalizer', () => {
  it('opens a thinking block on reasoning and closes it on the answer', () => {
    expect(
      normalize([
        reasoning('m', 'weigh'),
        reasoning('m', 'ing'),
        text('m', 'Answer'),
      ]),
    ).toEqual([
      { type: 'thinking_start' },
      { type: 'thinking_delta', content: 'weigh' },
      { type: 'thinking_delta', content: 'ing' },
      { type: 'thinking_end' },
      { type: 'content_delta', content: 'Answer' },
    ])
  })

  it('folds reasoning that arrives after the answer back into its block', () => {
    const events = normalize([
      reasoning('m', 'nearly'),
      text('m', 'Answer'),
      reasoning('m', ' done'),
    ])
    expect(events.at(-1)).toEqual({
      type: 'thinking_tail_delta',
      content: ' done',
    })
  })

  it('opens a thinking block for reasoning that follows text with none open', () => {
    expect(normalize([text('m', 'Answer'), reasoning('m', 'late')])).toEqual([
      { type: 'content_delta', content: 'Answer' },
      { type: 'thinking_start' },
      { type: 'thinking_delta', content: 'late' },
    ])
  })

  it('opens a new thinking block after a tool boundary', () => {
    const events = normalize([
      reasoning('m', 'first'),
      ...call('c1', 'web_search', '{"query":"amd"}'),
      reasoning('m', 'second'),
    ])
    expect(events.filter((e) => e.type === 'thinking_start')).toHaveLength(2)
    expect(events).toContainEqual({ type: 'thinking_end' })
  })

  it('reads a search query from the arguments the call closed with', () => {
    expect(
      normalize(call('c1', 'web_search', '{"query":"amd root ca"}')),
    ).toEqual([
      {
        type: 'web_search',
        id: 'c1',
        status: 'in_progress',
        query: 'amd root ca',
      },
    ])
  })

  it('completes a search with the sources its result carried', () => {
    const events = normalize([
      ...call('c1', 'web_search', '{"query":"amd"}'),
      {
        type: 'TOOL_CALL_RESULT',
        toolCallId: 'c1',
        content: JSON.stringify({
          results: [
            { url: 'https://amd.com/a', title: 'A' },
            { url: 'https://amd.com/b' },
            { title: 'no url' },
          ],
        }),
      },
    ])
    expect(events.at(-1)).toEqual({
      type: 'web_search',
      id: 'c1',
      status: 'completed',
      sources: [
        { url: 'https://amd.com/a', title: 'A' },
        { url: 'https://amd.com/b', title: undefined },
      ],
    })
  })

  it('keeps a search whose arguments never parsed on its own block', () => {
    const session = new RichStreamSession()
    for (const event of [
      ...call('c1', 'web_search', '{"query":"am'),
      ...call('c2', 'web_search', '{"query":"intel"}'),
      {
        type: 'TOOL_CALL_RESULT' as const,
        toolCallId: 'c1',
        content: JSON.stringify({ results: [{ url: 'https://amd.com/a' }] }),
      },
    ]) {
      session.processEvent(event)
    }
    const searches = session
      .snapshot()
      .timeline?.filter((block) => block.type === 'web_search')
    expect(searches).toHaveLength(2)
    expect(searches?.[0]).toMatchObject({
      state: { query: '', status: 'completed' },
    })
    expect(searches?.[1]).toMatchObject({
      state: { query: 'intel', status: 'searching' },
    })
  })

  it('fails a search whose result is the error the model read', () => {
    const events = normalize([
      ...call('c1', 'web_search', '{"query":"amd"}'),
      {
        type: 'TOOL_CALL_RESULT',
        toolCallId: 'c1',
        content: '{"error":"validating \\"arguments\\""}',
      },
    ])
    expect(events.at(-1)).toMatchObject({
      type: 'web_search',
      status: 'failed',
    })
  })

  it('tracks a fetch by its call id', () => {
    const events = normalize([
      ...call('c2', 'web_fetch', '{"url":"https://amd.com/spec.pdf"}'),
      { type: 'TOOL_CALL_RESULT', toolCallId: 'c2', content: '{"text":"..."}' },
    ])
    expect(events).toEqual([
      {
        type: 'url_fetch',
        id: 'c2',
        url: 'https://amd.com/spec.pdf',
        status: 'in_progress',
      },
      { type: 'url_fetch', id: 'c2', url: '', status: 'completed' },
    ])
  })

  it('passes a client-rendered tool through as a widget call', () => {
    expect(
      normalize([
        {
          type: 'TOOL_CALL_START',
          toolCallId: 'w1',
          toolCallName: 'render_chart',
        },
        { type: 'TOOL_CALL_ARGS', toolCallId: 'w1', delta: '{"ti' },
        { type: 'TOOL_CALL_ARGS', toolCallId: 'w1', delta: 'tle":"Hi"}' },
      ]),
    ).toEqual([
      { type: 'genui_tool_call_start', id: 'w1', name: 'render_chart' },
      { type: 'genui_tool_call_delta', id: 'w1', argumentsDelta: '{"ti' },
      { type: 'genui_tool_call_delta', id: 'w1', argumentsDelta: 'tle":"Hi"}' },
    ])
  })

  it('surfaces the progress a running tool reports', () => {
    expect(
      normalize([
        {
          type: 'ACTIVITY_SNAPSHOT',
          messageId: 'act_c1',
          activityType: 'TOOL',
          content: {
            toolCallId: 'c1',
            tool: 'web_search',
            progress: 0,
            output: [],
          },
        },
        {
          type: 'ACTIVITY_DELTA',
          messageId: 'act_c1',
          patch: [
            { op: 'replace', path: '/progress', value: 0.5 },
            { op: 'add', path: '/output/-', value: 'reading amd.com' },
          ],
        },
      ]),
    ).toEqual([{ type: 'search_reasoning', content: 'reading amd.com' }])
  })

  it('takes only what is new from a snapshot that restates the log', () => {
    const snapshot = (output: string[]): AguiEvent => ({
      type: 'ACTIVITY_SNAPSHOT',
      messageId: 'act_c1',
      activityType: 'TOOL',
      content: { toolCallId: 'c1', tool: 'web_search', progress: 0, output },
    })

    expect(
      normalize([
        snapshot(['searching amd.com']),
        snapshot(['searching amd.com', 'reading the root CA page']),
      ]),
    ).toEqual([
      { type: 'search_reasoning', content: 'searching amd.com' },
      { type: 'search_reasoning', content: 'reading the root CA page' },
    ])
  })

  it('does not repeat notes a delta already reported when a snapshot follows', () => {
    expect(
      normalize([
        {
          type: 'ACTIVITY_DELTA',
          messageId: 'act_c1',
          patch: [{ op: 'add', path: '/output/-', value: 'searching' }],
        },
        {
          type: 'ACTIVITY_SNAPSHOT',
          messageId: 'act_c1',
          activityType: 'TOOL',
          content: {
            toolCallId: 'c1',
            tool: 'web_search',
            progress: 0.5,
            output: ['searching', 'reading'],
          },
        },
      ]),
    ).toEqual([
      { type: 'search_reasoning', content: 'searching' },
      { type: 'search_reasoning', content: 'reading' },
    ])
  })

  it('turns a failed run into a typed error', () => {
    const normalizer = createAguiNormalizer()
    expect(() =>
      normalizer.processEvent({
        type: 'RUN_ERROR',
        message: 'gateway refused',
      }),
    ).toThrow(ChatError)
  })

  it('refuses a run that ended without finishing', () => {
    const normalizer = createAguiNormalizer()
    normalizer.processEvent(text('m', 'partial'))
    expect(() => normalizer.assertComplete()).toThrow()
    normalizer.processEvent({ type: 'RUN_FINISHED' })
    expect(() => normalizer.assertComplete()).not.toThrow()
  })

  it('closes an unfinished thinking block on flush', () => {
    const normalizer = createAguiNormalizer()
    normalizer.processEvent(reasoning('m', 'interrupted'))
    expect(normalizer.flush()).toEqual([{ type: 'thinking_end' }])
    expect(normalizer.flush()).toEqual([])
  })

  it('assembles a recorded run into a message', () => {
    const session = new RichStreamSession()
    for (const event of liveRun as AguiEvent[]) session.processEvent(event)
    const message = session.complete()

    expect(message.content).toContain('AMD root CA')
    expect(message.webSearch?.status).toBe('failed')
    expect(
      message.timeline?.filter((b) => b.type === 'web_search'),
    ).toHaveLength(3)
    expect(message.thoughts).toBeUndefined()
  })
})
