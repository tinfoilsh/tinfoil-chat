import { ChatError, type ChatErrorCode } from '@/components/chat/chat-utils'
import { isGenUIToolName } from '@/components/chat/genui/registry'
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
  let reasoningMessageId: string | null = null
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
          if (event.messageId !== reasoningMessageId) {
            reasoningMessageId = event.messageId
            thinkingClosedByContent = false
          }
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
          if (isGenUIToolName(event.toolCallName)) {
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
          if (isGenUIToolName(call.name)) {
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
          if (!call || isGenUIToolName(call.name)) break
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
          } else {
            // The call is shown once its arguments are whole: the renderer
            // takes them at the push and only status and output after that.
            events.push({
              type: 'code_exec_tool_call',
              id: event.toolCallId,
              toolName: call.name,
              status: 'in_progress',
              arguments: args ?? undefined,
            })
          }
          break
        }

        case 'TOOL_CALL_RESULT': {
          const call = calls.get(event.toolCallId)
          if (!call || isGenUIToolName(call.name)) break
          if (call.name === WEB_SEARCH_TOOL || call.name === WEB_FETCH_TOOL) {
            const result = parseJson<SearchResult>(event.content)
            const failed = !result || typeof result.error === 'string'
            events.push(
              call.name === WEB_SEARCH_TOOL
                ? {
                    type: 'web_search',
                    id: event.toolCallId,
                    status: failed ? 'failed' : 'completed',
                    sources: failed ? undefined : sourcesOf(result),
                  }
                : {
                    type: 'url_fetch',
                    id: event.toolCallId,
                    url: '',
                    status: failed ? 'failed' : 'completed',
                  },
            )
          } else {
            // Unlike a search result, this content is the tool's own output and
            // need not be JSON: only a reported error means the call failed.
            const result = readJson<SearchResult>(event.content)
            events.push({
              type: 'code_exec_tool_call',
              id: event.toolCallId,
              toolName: call.name,
              status:
                typeof result?.error === 'string' ? 'failed' : 'completed',
              output: event.content,
            })
          }
          break
        }

        case 'ACTIVITY_SNAPSHOT':
        case 'ACTIVITY_DELTA': {
          const taken = activityNotes.get(event.messageId) ?? 0
          // A snapshot restates the whole log, so only what lies past the notes
          // already taken is new; a delta carries nothing else.
          const notes =
            event.type === 'ACTIVITY_SNAPSHOT'
              ? (event.content.output ?? []).slice(taken)
              : appended(event.patch)
          for (const note of notes) {
            events.push({ type: 'search_reasoning', content: note })
          }
          activityNotes.set(event.messageId, taken + notes.length)
          break
        }

        case 'RUN_FINISHED':
          finished = true
          break

        case 'RUN_ERROR':
          throw new ChatError(
            event.message || 'The agent run failed',
            runErrorCode(event.code),
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
        throw new ChatError(
          'Chat response ended before its completion marker',
          'SERVER_ERROR',
        )
      }
    },
  }
}

const RUN_ERROR_CODES = new Set<ChatErrorCode>(['RATE_LIMIT', 'HOURLY_LIMIT'])

function runErrorCode(code: string | undefined): ChatErrorCode {
  return RUN_ERROR_CODES.has(code as ChatErrorCode)
    ? (code as ChatErrorCode)
    : 'SERVER_ERROR'
}

interface SearchResult {
  error?: string
  results?: unknown
}

// A parsed tool result is not a checked one; a bad shape must not kill the run.
function sourcesOf(result: SearchResult | null): Array<{
  url: string
  title?: string
}> {
  if (!Array.isArray(result?.results)) return []
  return result.results.flatMap((entry: unknown) => {
    const { url, title } = (entry ?? {}) as { url?: unknown; title?: unknown }
    return typeof url === 'string' && url
      ? [{ url, title: typeof title === 'string' ? title : undefined }]
      : []
  })
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

function readJson<T>(
  raw: string,
  onFailure?: (error: unknown) => void,
): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch (error) {
    onFailure?.(error)
    return null
  }
}

function parseJson<T>(raw: string): T | null {
  return readJson<T>(raw, (error) =>
    logError('Failed to parse tool payload', error, {
      component: 'agui-normalizer',
      metadata: { length: raw.length },
    }),
  )
}
