import { IS_DEV } from '@/config'

interface LogEntry {
  t: number
  type: string
  data: unknown
}

export interface StreamLogger {
  logRaw(line: string): void
  logParsedEvent(json: unknown): void
  logTinfoilEvent(event: unknown): void
  logWebSearchDispatch(event: unknown): void
  flush(chatId: string): void
}

const noopLogger: StreamLogger = {
  logRaw() {},
  logParsedEvent() {},
  logTinfoilEvent() {},
  logWebSearchDispatch() {},
  flush() {},
}

// extractAssistantText pulls the assistant content / reasoning / tool-call
// argument tokens from a single chat-completion chunk so flush() can stitch
// them back into one readable stream. Returns three buckets so each kind of
// token lands in its own concatenated view.
function extractAssistantText(json: unknown): {
  content: string
  reasoning: string
  toolArgs: string
} {
  const choice = (
    json as { choices?: Array<{ delta?: Record<string, unknown> }> }
  )?.choices?.[0]
  const delta = choice?.delta
  if (!delta) return { content: '', reasoning: '', toolArgs: '' }

  const content = typeof delta.content === 'string' ? delta.content : ''
  const reasoning =
    (typeof delta.reasoning_content === 'string'
      ? delta.reasoning_content
      : '') || (typeof delta.reasoning === 'string' ? delta.reasoning : '')

  let toolArgs = ''
  const toolCalls = delta.tool_calls
  if (Array.isArray(toolCalls)) {
    for (const tc of toolCalls) {
      const fn = (tc as { function?: { arguments?: unknown } })?.function
      if (fn && typeof fn.arguments === 'string') toolArgs += fn.arguments
    }
  }

  return { content, reasoning, toolArgs }
}

export function createStreamLogger(): StreamLogger {
  if (!IS_DEV) return noopLogger

  const entries: LogEntry[] = []

  return {
    logRaw(line: string) {
      entries.push({ t: Date.now(), type: 'raw', data: line })
    },

    logParsedEvent(json: unknown) {
      entries.push({ t: Date.now(), type: 'parsed', data: json })
    },

    logTinfoilEvent(event: unknown) {
      entries.push({ t: Date.now(), type: 'tinfoil_event', data: event })
    },

    logWebSearchDispatch(event: unknown) {
      entries.push({ t: Date.now(), type: 'web_search_dispatch', data: event })
    },

    flush(chatId: string) {
      if (entries.length === 0) return

      let content = ''
      let reasoning = ''
      let toolArgs = ''
      for (const entry of entries) {
        if (entry.type !== 'parsed') continue
        const parts = extractAssistantText(entry.data)
        content += parts.content
        reasoning += parts.reasoning
        toolArgs += parts.toolArgs
      }

      const tinfoilEvents = entries
        .filter((e) => e.type === 'tinfoil_event')
        .map((e) => e.data)

      const summary =
        `chat=${chatId} chunks=${entries.filter((e) => e.type === 'parsed').length}` +
        ` content=${content.length}ch reasoning=${reasoning.length}ch` +
        ` tool_args=${toolArgs.length}ch tinfoil_events=${tinfoilEvents.length}`

      console.groupCollapsed(`[stream] ${summary}`)
      if (reasoning) {
        console.log('--- reasoning ---')
        console.log(reasoning)
      }
      if (toolArgs) {
        console.log('--- tool call arguments (concatenated) ---')
        console.log(toolArgs)
      }
      if (tinfoilEvents.length > 0) {
        console.log('--- tinfoil events ---')
        for (const event of tinfoilEvents) console.log(event)
      }
      console.log('--- assistant content ---')
      console.log(content || '(empty)')
      console.groupCollapsed(`raw entries (${entries.length})`)
      for (const entry of entries) console.log(entry)
      console.groupEnd()
      console.groupEnd()

      entries.length = 0
    },
  }
}
