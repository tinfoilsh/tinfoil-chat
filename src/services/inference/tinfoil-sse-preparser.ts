/**
 * Tinfoil SSE pre-parser.
 *
 * Wraps a `fetch` so chat completion responses are split into two streams:
 * 1. A downstream SSE that only contains OpenAI-compliant `chat.completion.chunk`
 *    events (plus the terminal `data: [DONE]`), which the Vercel AI SDK can
 *    consume without choking on unknown event types.
 * 2. A sidechannel of Tinfoil-specific events the upstream streaming loop
 *    subscribes to: web search progress, URL fetches, url_citation
 *    annotations, search_reasoning deltas, and inline `<think>` content
 *    rewritten into `reasoning_content` deltas.
 *
 * The pre-parser only engages for responses whose content-type starts with
 * `text/event-stream`; other responses (errors, JSON bodies for non-streaming
 * endpoints) pass through untouched.
 */

export type TinfoilSidechannelEvent =
  | {
      type: 'web_search_call'
      status: 'in_progress' | 'completed' | 'failed' | 'blocked'
      query?: string
      reason?: string
    }
  | {
      type: 'url_fetch'
      id: string
      url: string
      status: 'fetching' | 'completed' | 'failed'
    }
  | {
      type: 'url_citation'
      title: string
      url: string
    }
  | {
      type: 'search_reasoning_delta'
      delta: string
    }

export interface TinfoilSidechannel {
  /**
   * Subscribe to Tinfoil events. Returns an unsubscribe function.
   */
  subscribe: (listener: (event: TinfoilSidechannelEvent) => void) => () => void
  /**
   * Emit an event to all subscribers. Exposed for the pre-parser; callers
   * outside this module should not use it.
   */
  emit: (event: TinfoilSidechannelEvent) => void
}

export function createTinfoilSidechannel(): TinfoilSidechannel {
  const listeners = new Set<(event: TinfoilSidechannelEvent) => void>()
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emit(event) {
      for (const listener of listeners) {
        try {
          listener(event)
        } catch {
          // Listeners must not throw into the stream pipeline.
        }
      }
    },
  }
}

interface ChatCompletionChunk {
  choices?: Array<{
    delta?: {
      content?: string | null
      reasoning_content?: string | null
      reasoning?: string | null
      search_reasoning?: string | null
      annotations?: unknown[]
      tool_calls?: unknown[]
      role?: string
    }
    index?: number
    finish_reason?: string | null
    [key: string]: unknown
  }>
  [key: string]: unknown
}

interface ThinkTagState {
  insideThink: boolean
  pendingBuffer: string
}

/**
 * Wrap a fetch implementation so streamed chat completion responses have
 * Tinfoil-specific events peeled off into the provided sidechannel.
 */
export function wrapFetchWithTinfoilPreparser(
  innerFetch: typeof fetch,
  sidechannel: TinfoilSidechannel,
): typeof fetch {
  return async (input, init) => {
    const response = await innerFetch(input as any, init)

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().startsWith('text/event-stream')) {
      return response
    }

    if (!response.body) {
      return response
    }

    const transformedBody = transformTinfoilStream(response.body, sidechannel)

    return new Response(transformedBody, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }
}

function transformTinfoilStream(
  source: ReadableStream<Uint8Array>,
  sidechannel: TinfoilSidechannel,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  const thinkState: ThinkTagState = {
    insideThink: false,
    pendingBuffer: '',
  }
  let sseBuffer = ''

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = source.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            if (sseBuffer.length > 0) {
              processSseBlock(
                sseBuffer,
                controller,
                sidechannel,
                thinkState,
                encoder,
              )
              sseBuffer = ''
            }
            controller.close()
            return
          }

          sseBuffer += decoder.decode(value, { stream: true })

          // SSE events are separated by blank lines; a single event can span
          // multiple lines but always ends with \n\n (or \r\n\r\n).
          let boundary = findEventBoundary(sseBuffer)
          while (boundary !== -1) {
            const rawEvent = sseBuffer.slice(0, boundary)
            sseBuffer = sseBuffer.slice(boundary).replace(/^(\r?\n){2}/, '')
            processSseBlock(
              rawEvent,
              controller,
              sidechannel,
              thinkState,
              encoder,
            )
            boundary = findEventBoundary(sseBuffer)
          }
        }
      } catch (err) {
        controller.error(err)
      } finally {
        reader.releaseLock()
      }
    },
    cancel(reason) {
      source.cancel(reason).catch(() => undefined)
    },
  })
}

function findEventBoundary(buffer: string): number {
  const lfIdx = buffer.indexOf('\n\n')
  const crlfIdx = buffer.indexOf('\r\n\r\n')
  if (lfIdx === -1) return crlfIdx
  if (crlfIdx === -1) return lfIdx
  return Math.min(lfIdx, crlfIdx)
}

function processSseBlock(
  rawEvent: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  sidechannel: TinfoilSidechannel,
  thinkState: ThinkTagState,
  encoder: TextEncoder,
): void {
  const trimmed = rawEvent.trim()
  if (!trimmed) return

  // Pass-through for the terminal sentinel.
  if (trimmed === 'data: [DONE]') {
    controller.enqueue(encoder.encode('data: [DONE]\n\n'))
    return
  }

  // SSE events may have multiple lines; we only care about `data: ...`.
  const dataLine = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('data:'))

  if (!dataLine) return

  const jsonPart = dataLine.replace(/^data:\s*/i, '')
  if (!jsonPart) return

  let parsed: any
  try {
    parsed = JSON.parse(jsonPart)
  } catch {
    // If we can't parse it, forward untouched so AI SDK can surface the error.
    controller.enqueue(encoder.encode(`data: ${jsonPart}\n\n`))
    return
  }

  // Handle Tinfoil-specific top-level events (web_search_call and open_page URL fetches).
  if (parsed?.type === 'web_search_call') {
    handleWebSearchEvent(parsed, sidechannel)
    return
  }

  // Only rewrite chat.completion.chunk events for reasoning/think/annotations.
  const chunk = parsed as ChatCompletionChunk
  const choice = chunk?.choices?.[0]
  const delta = choice?.delta

  if (delta) {
    // Lift url_citation annotations onto the sidechannel.
    if (Array.isArray(delta.annotations) && delta.annotations.length > 0) {
      for (const ann of delta.annotations) {
        const a = ann as any
        if (a?.type === 'url_citation' && a?.url_citation?.url) {
          sidechannel.emit({
            type: 'url_citation',
            title: a.url_citation.title ?? a.url_citation.url,
            url: a.url_citation.url,
          })
        }
      }
    }

    // Lift search_reasoning deltas.
    const searchReasoning =
      typeof delta.search_reasoning === 'string'
        ? delta.search_reasoning
        : undefined
    if (searchReasoning) {
      sidechannel.emit({
        type: 'search_reasoning_delta',
        delta: searchReasoning,
      })
    }

    // Rewrite inline <think>...</think> in content into reasoning_content deltas.
    if (typeof delta.content === 'string' && delta.content.length > 0) {
      const rewritten = rewriteThinkTags(delta.content, thinkState)
      if (rewritten.reasoningDelta || rewritten.contentDelta !== undefined) {
        if (rewritten.reasoningDelta) {
          const prevReasoning =
            typeof delta.reasoning_content === 'string'
              ? delta.reasoning_content
              : ''
          delta.reasoning_content = prevReasoning + rewritten.reasoningDelta
        }
        delta.content = rewritten.contentDelta ?? ''
      }
    }
  }

  // Forward the (possibly-mutated) chunk to the downstream consumer.
  const payload = `data: ${JSON.stringify(chunk)}\n\n`
  controller.enqueue(encoder.encode(payload))
}

function handleWebSearchEvent(
  event: any,
  sidechannel: TinfoilSidechannel,
): void {
  if (event?.action?.type === 'open_page' && event?.action?.url) {
    const status = event.status as string
    const mapped: 'fetching' | 'completed' | 'failed' =
      status === 'in_progress'
        ? 'fetching'
        : status === 'completed'
          ? 'completed'
          : 'failed'
    sidechannel.emit({
      type: 'url_fetch',
      id: (event.id as string) || (event.action.url as string),
      url: event.action.url as string,
      status: mapped,
    })
    return
  }

  const query = event?.action?.query as string | undefined
  const status = event?.status as string

  if (
    status === 'in_progress' ||
    status === 'completed' ||
    status === 'failed' ||
    status === 'blocked'
  ) {
    sidechannel.emit({
      type: 'web_search_call',
      status,
      query,
      reason: event?.reason as string | undefined,
    })
  }
}

interface ThinkRewriteResult {
  /** Content remaining after any `<think>...</think>` has been stripped. */
  contentDelta?: string
  /** Fragments that should be routed into reasoning_content. */
  reasoningDelta?: string
}

/**
 * Rewrite inline `<think>...</think>` tags into reasoning deltas. Handles
 * partial tags across chunk boundaries via `thinkState`.
 */
function rewriteThinkTags(
  chunk: string,
  state: ThinkTagState,
): ThinkRewriteResult {
  let contentOut = ''
  let reasoningOut = ''
  let input = state.pendingBuffer + chunk
  state.pendingBuffer = ''

  while (input.length > 0) {
    if (state.insideThink) {
      const closeIdx = input.indexOf('</think>')
      if (closeIdx === -1) {
        // All remaining bytes go to reasoning; defer nothing.
        reasoningOut += input
        input = ''
      } else {
        reasoningOut += input.slice(0, closeIdx)
        input = input.slice(closeIdx + '</think>'.length)
        state.insideThink = false
      }
    } else {
      const openIdx = input.indexOf('<think>')
      if (openIdx === -1) {
        // No opening tag yet, but a partial might be at the end; hold it back.
        const partial = detectPartialOpenTag(input)
        if (partial > 0) {
          state.pendingBuffer = input.slice(input.length - partial)
          contentOut += input.slice(0, input.length - partial)
        } else {
          contentOut += input
        }
        input = ''
      } else {
        contentOut += input.slice(0, openIdx)
        input = input.slice(openIdx + '<think>'.length)
        state.insideThink = true
      }
    }
  }

  return {
    contentDelta: contentOut,
    reasoningDelta: reasoningOut.length > 0 ? reasoningOut : undefined,
  }
}

function detectPartialOpenTag(input: string): number {
  const marker = '<think>'
  // Check if the tail of `input` could be a prefix of `<think>`.
  const max = Math.min(marker.length - 1, input.length)
  for (let len = max; len > 0; len--) {
    if (input.endsWith(marker.slice(0, len))) {
      return len
    }
  }
  return 0
}
