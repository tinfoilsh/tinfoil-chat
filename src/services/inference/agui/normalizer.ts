import { ChatError } from '@/components/chat/chat-utils'
import type { NormalizedEvent } from '@/components/chat/hooks/streaming/types'
import { logError } from '@/utils/error-handling'
import {
  WEB_FETCH_TOOL,
  WEB_SEARCH_TOOL,
  type AguiEvent,
  type AguiJsonPatch,
} from './protocol'

export interface AguiNormalizer {
  processEvent(event: AguiEvent): NormalizedEvent[]
  flush(): NormalizedEvent[]
  assertComplete(): void
}

interface PendingCall {
  name: string
  args: string
}

export function createAguiNormalizer(): AguiNormalizer {
  let isInThinking = false
  let thinkingClosedByContent = false
  let finished = false
  const calls = new Map<string, PendingCall>()
  // The notes already taken from each activity log, so a snapshot -- which
  // restates the whole log rather than adding to it -- contributes only what
  // is not recorded yet instead of repeating everything it carries.
  const activityNotes = new Map<string, number>()

  function endThinking(events: NormalizedEvent[]): boolean {
    if (!isInThinking) return false
    events.push({ type: 'thinking_end' })
    isInThinking = false
    return true
  }

  return {
    processEvent(event): NormalizedEvent[] {
      const events: NormalizedEvent[] = []

      switch (event.type) {
        case 'TEXT_MESSAGE_CHUNK':
          if (!event.delta) break
          if (endThinking(events)) thinkingClosedByContent = true
          events.push({ type: 'content_delta', content: event.delta })
          break

        case 'REASONING_MESSAGE_CHUNK':
          if (!event.delta) break
          if (isInThinking) {
            events.push({ type: 'thinking_delta', content: event.delta })
          } else if (thinkingClosedByContent) {
            events.push({ type: 'thinking_tail_delta', content: event.delta })
          } else {
            isInThinking = true
            events.push({ type: 'thinking_start' })
            events.push({ type: 'thinking_delta', content: event.delta })
          }
          break

        case 'TOOL_CALL_START':
          endThinking(events)
          thinkingClosedByContent = false
          calls.set(event.toolCallId, { name: event.toolCallName, args: '' })
          if (isRendered(event.toolCallName)) {
            events.push({
              type: 'genui_tool_call_start',
              id: event.toolCallId,
              name: event.toolCallName,
            })
          }
          break

        case 'TOOL_CALL_ARGS': {
          const call = calls.get(event.toolCallId)
          if (!call) break
          call.args += event.delta
          if (isRendered(call.name)) {
            events.push({
              type: 'genui_tool_call_delta',
              id: event.toolCallId,
              argumentsDelta: event.delta,
            })
          }
          break
        }

        case 'TOOL_CALL_END': {
          const call = calls.get(event.toolCallId)
          if (!call) break
          const args = parseJson<Record<string, unknown>>(call.args)
          if (call.name === WEB_SEARCH_TOOL) {
            events.push({
              type: 'web_search',
              id: event.toolCallId,
              status: 'in_progress',
              query: typeof args?.query === 'string' ? args.query : '',
            })
          } else if (call.name === WEB_FETCH_TOOL) {
            events.push({
              type: 'url_fetch',
              id: event.toolCallId,
              url: typeof args?.url === 'string' ? args.url : '',
              status: 'in_progress',
            })
          }
          break
        }

        case 'TOOL_CALL_RESULT': {
          const call = calls.get(event.toolCallId)
          if (!call) break
          const result = parseJson<SearchResult>(event.content)
          const failed = !result || typeof result.error === 'string'
          if (call.name === WEB_SEARCH_TOOL) {
            events.push({
              type: 'web_search',
              id: event.toolCallId,
              status: failed ? 'failed' : 'completed',
              sources: failed ? undefined : sourcesOf(result),
            })
          } else if (call.name === WEB_FETCH_TOOL) {
            events.push({
              type: 'url_fetch',
              id: event.toolCallId,
              url: '',
              status: failed ? 'failed' : 'completed',
            })
          }
          break
        }

        case 'ACTIVITY_SNAPSHOT': {
          const output = event.content.output ?? []
          const taken = activityNotes.get(event.messageId) ?? 0
          for (const note of output.slice(taken)) {
            events.push({ type: 'search_reasoning', content: note })
          }
          activityNotes.set(event.messageId, Math.max(taken, output.length))
          break
        }

        case 'ACTIVITY_DELTA': {
          const notes = appended(event.patch)
          for (const note of notes) {
            events.push({ type: 'search_reasoning', content: note })
          }
          activityNotes.set(
            event.messageId,
            (activityNotes.get(event.messageId) ?? 0) + notes.length,
          )
          break
        }

        case 'RUN_FINISHED':
          finished = true
          break

        case 'RUN_ERROR':
          throw new ChatError(
            event.message || 'The agent run failed',
            'SERVER_ERROR',
          )
      }

      return events
    },

    flush(): NormalizedEvent[] {
      if (!isInThinking) return []
      isInThinking = false
      return [{ type: 'thinking_end' }]
    },

    assertComplete(): void {
      if (!finished) {
        throw new Error('Chat response ended before its completion marker')
      }
    },
  }
}

function isRendered(name: string): boolean {
  return name !== WEB_SEARCH_TOOL && name !== WEB_FETCH_TOOL
}

interface SearchResult {
  error?: string
  results?: Array<{ url?: string; title?: string }>
}

function sourcesOf(result: SearchResult | null): Array<{
  url: string
  title?: string
}> {
  if (!result?.results) return []
  return result.results
    .filter((entry): entry is { url: string; title?: string } =>
      Boolean(entry.url),
    )
    .map((entry) => ({ url: entry.url, title: entry.title }))
}

function appended(patch: AguiJsonPatch[]): string[] {
  const notes: string[] = []
  for (const operation of patch) {
    if (
      operation.op === 'add' &&
      operation.path === '/output/-' &&
      typeof operation.value === 'string'
    ) {
      notes.push(operation.value)
    }
  }
  return notes
}

function parseJson<T>(raw: string): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch (error) {
    logError('Failed to parse tool payload', error, {
      component: 'agui-normalizer',
      metadata: { length: raw.length },
    })
    return null
  }
}
